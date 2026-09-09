import {
	addNode,
	createElementNode,
	createEmptyExperienceDraft,
	createScreen,
	dataReadsOfStep,
	ensureScreenRoot,
	fieldStatePath,
	fieldEnumValues,
	fieldStateType,
	isFieldBuilderKind,
	isInteractiveBuilderKind,
	operationsOfStep,
	parseValue,
	removeNode,
	stepsOfJourney,
	validationDescription,
	type BuilderElementNode,
	type Journey,
	type JourneyStep,
	type ProjectExperienceDraft
} from '$domain/experience';
import type { ProjectFeaturesDraft } from '$domain/features';
import type { ProjectUsersDraft } from '$domain/users';
import type { BehaviorOp } from '$application/ports';
import type { UnspaFeatureSnapshot, UnspaTag } from '$lib/unspa-schema';
import { experienceFeatureId } from './aux-feature-ids';

/**
 * The Lyriks-owned RESIDUE for the Experience section (Step 05) — the full authored
 * draft minus the recomputed `derivedCores`. The behavior kernel owns the journey
 * layer's identity/structure (which journeys/steps exist, their names, order and
 * screen links → workflow surfaces/actions/transitions) plus personas; but the rich
 * authoring surface the kernel is a lossy projection of — the builder layout trees,
 * wiring, run state, the design library, brand, and the Lyriks-only per-step detail
 * (coreId, actorRoleIds, descriptions, `stepOperations`, `stepDataReads`) —
 * lives here, keyed by the same kernel ids. On read the kernel journey layer is
 * overlaid onto this so dashboard/MCP edits round-trip (two-way binding); everything
 * else is served verbatim. Stored under section "experience".
 */
export type ExperienceResidue = Omit<ProjectExperienceDraft, 'derivedCores'>;

/** Split the Lyriks-owned residue out of the wizard draft (the write side). */
export function experienceResidueFromDraft(draft: ProjectExperienceDraft): ExperienceResidue {
	// `derivedCores` is a read-only mirror of Step 04 — never stored (recomputed on load).
	const { derivedCores: _derivedCores, ...residue } = draft;
	return residue;
}

/**
 * Rebuild the Step-05 draft from the residue, then OVERLAY the behavior kernel's
 * journey layer so surfaces/actions/transitions authored in unspa show up in the
 * page (two-way binding). Kernel workflow surfaces are authoritative for which
 * journeys/steps exist and their names/order/screen links; the residue decorates
 * each with the Lyriks-only facet (coreId, actorRoleIds, description, operations,
 * data reads) keyed by id. Pure and framework-free; `derivedCores` is left empty
 * (the load use-case recomputes it). Layout/library/brand detail comes from residue;
 * kernel screen names and action identity overlay it so structural edits round-trip.
 */
export function buildExperienceProjection(
	projectId: string,
	residue: ExperienceResidue | null,
	feature: UnspaFeatureSnapshot | null
): ProjectExperienceDraft {
	const base: ProjectExperienceDraft = residue
		? withoutLegacyViewState(residue, projectId)
		: createEmptyExperienceDraft(projectId);
	return overlayBuilderLayer(overlayJourneyLayer(base, feature), feature);
}

function withoutLegacyViewState(
	residue: ExperienceResidue,
	projectId: string
): ProjectExperienceDraft {
	const {
		activeDesignMode: _activeDesignMode,
		activeTab: _activeTab,
		activeLibraryTab: _activeLibraryTab,
		selectedJourneyId: _selectedJourneyId,
		...content
	} = residue as ExperienceResidue & Record<string, unknown>;
	return { ...content, projectId, derivedCores: [] } as ProjectExperienceDraft;
}

/* ── read: kernel journey layer → draft.journeys/steps (two-way binding) ── */

const SRF_PREFIX = 'srf-';
const ACT_PREFIX = 'act-';
const SCREEN_SURFACE_PREFIX = 'srf-screen-';

function strip(id: string, prefix: string): string {
	return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

interface WireSurface {
	id?: string;
	name?: string;
	type?: string;
	actions?: WireAction[];
	transitions?: { fromAction?: string; toSurface?: string }[];
}
interface WireAction {
	id?: string;
	name?: string;
}

/**
 * Overlay the kernel's screen/action structure onto the editable builder.
 * Unspa has no layout geometry, so groups and styling stay residue-owned; names
 * and action identity are kernel-authoritative and can round-trip safely.
 */
function overlayBuilderLayer(
	base: ProjectExperienceDraft,
	feature: UnspaFeatureSnapshot | null
): ProjectExperienceDraft {
	const screenSurfaces = ((feature?.feature as { surfaces?: WireSurface[] })?.surfaces ?? []).filter(
		(surface) => surface.type === 'screen' && surface.id?.startsWith(SCREEN_SURFACE_PREFIX)
	);
	if (screenSurfaces.length === 0) return base;

	const draft: ProjectExperienceDraft = {
		...base,
		screens: base.screens.map((screen) => ({ ...screen })),
		components: base.components.map((component) => ({ ...component })),
		templates: base.templates.map((template) => ({ ...template })),
		steps: base.steps.map((step) => ({ ...step })),
		builder: structuredClone(base.builder)
	};

	for (const surface of screenSurfaces) {
		const surfaceId = strip(surface.id ?? '', SCREEN_SURFACE_PREFIX);
		if (!surfaceId) continue;
		const name = surface.name ?? 'Screen';
		const screen = draft.screens.find((item) => item.id === surfaceId);
		const component = draft.components.find((item) => item.id === surfaceId);
		const template = draft.templates.find((item) => item.id === surfaceId);
		if (screen) screen.name = name;
		else if (component) component.name = name;
		else if (template) template.name = name;
		else if (surfaceId !== '__app_header__' && surfaceId !== '__app_footer__') {
			draft.screens.push(createScreen({ id: surfaceId, name }));
		}

		const rootId = ensureScreenRoot(draft.builder, surfaceId);
		if (!Array.isArray(surface.actions)) continue;
		const liveActionIds = new Set(
			surface.actions.flatMap((action) =>
				typeof action.id === 'string' && action.id ? [action.id] : []
			)
		);
		const elements = Object.values(draft.builder.nodes).filter(
			(node): node is BuilderElementNode =>
				node.kind === 'element' && node.surfaceId === surfaceId
		);

		for (const element of elements) {
			if (
				isInteractiveBuilderKind(element.elementKind) &&
				!liveActionIds.has(builderActionId(element))
			) {
				removeNode(draft.builder, element.id);
			}
		}

		for (const action of surface.actions) {
			if (typeof action.id !== 'string' || !action.id) continue;
			const existing = Object.values(draft.builder.nodes).find(
				(node): node is BuilderElementNode =>
					node.kind === 'element' &&
					node.surfaceId === surfaceId &&
					builderActionId(node) === action.id
			);
			if (existing) {
				existing.label =
					isFieldBuilderKind(existing.elementKind)
						? (action.name ?? '').replace(/^Set\s+/i, '')
						: action.name ?? existing.label;
				continue;
			}

			const input = action.id.startsWith('act-write-');
			const conventionalId = input
				? action.id.slice('act-write-'.length)
				: action.id.startsWith('act-')
					? action.id.slice('act-'.length)
					: '';
			let nodeId = conventionalId || `engine-${slug(action.id) || 'action'}`;
			let suffix = 2;
			while (draft.builder.nodes[nodeId]) nodeId = `engine-${slug(action.id) || 'action'}-${suffix++}`;
			const node = createElementNode(surfaceId, rootId, input ? 'input' : 'button');
			const materialized: BuilderElementNode = {
				...node,
				id: nodeId,
				label: input ? (action.name ?? '').replace(/^Set\s+/i, '') : action.name ?? 'Action',
				...(action.id === (input ? `act-write-${nodeId}` : `act-${nodeId}`)
					? {}
					: { kernelActionId: action.id })
			};
			addNode(draft.builder, materialized);
		}
	}

	return draft;
}

/**
 * Overlay the kernel's workflow surfaces onto the residue draft. Every workflow
 * surface becomes a Journey and every one of its actions a Step; the residue
 * supplies each journey/step's Lyriks-only fields when the id matches, and sensible
 * defaults (orphaned core, empty actors) for surfaces authored purely in unspa.
 * `stepOperations`/`stepDataReads` are pruned to steps that still exist. When the
 * kernel has no experience feature yet (pre-flip / MAP first read) the residue is
 * returned untouched.
 */
function overlayJourneyLayer(
	base: ProjectExperienceDraft,
	feature: UnspaFeatureSnapshot | null
): ProjectExperienceDraft {
	const surfaces = ((feature?.feature as { surfaces?: WireSurface[] })?.surfaces ?? []).filter(
		(s) => s.type === 'workflow'
	);
	if (!feature || surfaces.length === 0) return base;

	const baseJourneyById = new Map(base.journeys.map((j) => [j.id, j]));
	const baseStepById = new Map(base.steps.map((s) => [s.id, s]));
	const nextOrder = base.journeys.reduce((m, j) => Math.max(m, j.order), -1) + 1;

	const journeys: Journey[] = [];
	const steps: JourneyStep[] = [];
	const liveStepIds = new Set<string>();

	surfaces.forEach((srf, jIdx) => {
		const journeyId = strip(srf.id ?? '', SRF_PREFIX);
		if (!journeyId) return;
		const bj = baseJourneyById.get(journeyId);
		journeys.push({
			id: journeyId,
			coreId: bj?.coreId ?? '',
			name: srf.name ?? bj?.name ?? '',
			description: bj?.description ?? '',
			order: bj?.order ?? nextOrder + jIdx,
			actorRoleIds: bj?.actorRoleIds ?? []
		});
		(srf.actions ?? []).forEach((act, aIdx) => {
			const stepId = strip(act.id ?? '', ACT_PREFIX);
			if (!stepId) return;
			const bs = baseStepById.get(stepId);
			liveStepIds.add(stepId);
			steps.push({
				id: stepId,
				journeyId,
				name: act.name ?? bs?.name ?? '',
				order: bs?.order ?? aIdx,
				linkedScreenId: bs?.linkedScreenId ?? recoverLinkedScreen(srf, stepId)
			});
		});
	});

	return {
		...base,
		journeys,
		steps,
		// Prune the per-step underlays to steps the kernel still carries; a step deleted
		// in unspa drops its operations/reads (they'd be orphaned otherwise).
		stepOperations: base.stepOperations.filter((o) => liveStepIds.has(o.stepId)),
		stepDataReads: base.stepDataReads.filter((d) => liveStepIds.has(d.stepId))
	};
}

/** Recover a step's linked screen from its workflow surface's `lnk-` transition. */
function recoverLinkedScreen(srf: WireSurface, stepId: string): string | null {
	const fromAction = `${ACT_PREFIX}${stepId}`;
	for (const t of srf.transitions ?? []) {
		if (t.fromAction === fromAction && typeof t.toSurface === 'string' && t.toSurface.startsWith(SCREEN_SURFACE_PREFIX))
			return strip(t.toSurface, SCREEN_SURFACE_PREFIX);
	}
	return null;
}

/* ── write: draft → kernel ops (the retired sync, made MAP-native) ──────── */

/** How a leaf feature declares a state path in its behavior model. */
export interface DeclaredState {
	type: string;
	enumValues?: readonly string[];
}

export interface ExperienceOpsContext {
	features: ProjectFeaturesDraft | null;
	users: ProjectUsersDraft | null;
	/**
	 * The type each state path is declared with by the project's leaf features
	 * (first declaration wins, the rule the back's graph compiler applies). A
	 * simulator seed on one of these paths is declared with THAT type, so the
	 * Experience mirror never contradicts the behavior model it sits beside.
	 */
	declaredStates?: ReadonlyMap<string, DeclaredState>;
}

/**
 * Project the experience draft into kernel write ops: the central "Experience" aux
 * feature (every journey as a workflow surface, every builder screen as a screen
 * surface), its listing in the project, and the Core-bridge mirror that lifts each
 * consuming leaf feature. The port MERGES surfaces/personas with what unspa authored,
 * so this is the write half of the two-way binding — and what retires
 * `sync-experience-to-unspaghettit`, MAP-native (ops, not `back.propagate*`).
 */
export function experienceDraftToBehaviorOps(
	draft: ProjectExperienceDraft,
	ctx: ExperienceOpsContext
): BehaviorOp[] {
	const roleName = (id: string) => ctx.users?.roles.find((r) => r.id === id)?.name || 'Role';
	const exId = experienceFeatureId(draft.projectId);

	const journeyBuilt = buildBehavior(draft, draft.journeys, roleName);
	const builderBuilt = buildBuilderBehavior(draft, roleName, ctx.declaredStates);
	const built: BuiltBehavior = {
		surfaces: [...journeyBuilt.surfaces, ...builderBuilt.surfaces],
		personas: dedupeBy([...journeyBuilt.personas, ...builderBuilt.personas], (p) => p.id),
		events: dedupeBy([...journeyBuilt.events, ...builderBuilt.events], (e) => e.name)
	};

	const ops: BehaviorOp[] = [
		{
			kind: 'upsertExperienceFeature',
			featureId: exId,
			name: 'Experience',
			description:
				'Consolidated user experience projected from the Experience section: every journey as a workflow surface, its steps as actions. Generated; edit in the Lyriks Experience section or detail it in unspa.',
			tags: [{ type: 'kind', value: 'experience' }] as UnspaTag[],
			surfaces: built.surfaces as unknown as Record<string, unknown>[],
			personas: built.personas as unknown as Record<string, unknown>[],
			events: built.events as unknown as Record<string, unknown>[]
		},
		{ kind: 'ensureProjectFeatureId', featureId: exId }
	];

	// No Core-bridge mirror: a journey lives once, on the Experience feature above.
	// It used to be COPIED onto every leaf sharing the journey's Core, which made
	// each sibling show the same borrowed actions, let an unrelated save delete
	// them, and inflated per-leaf maturity. A leaf's behavior is now exactly what
	// is authored on it in unspa; its link to a journey is a reference the reader
	// resolves (see `journeysForCore`), not owned content the writer duplicates.
	return ops;
}

/**
 * Journeys that run through a Core — the read-side replacement for the retired
 * Core-bridge mirror. A leaf can show "appears in journey X" from this without
 * the journey's surfaces being copied into the leaf's own model.
 */
export function journeysForCore(
	draft: ProjectExperienceDraft,
	coreId: string
): Array<{ id: string; name: string }> {
	return draft.journeys
		.filter((j) => j.coreId === coreId)
		.map((j) => ({ id: j.id, name: j.name }));
}

/* ── on-disk shapes (loose) ───────────────────────────────────────────── */
interface UnspaEffect {
	id: string;
	type: string;
	event?: string;
	/** set_state only: the state path written and the literal/Expression written to it. */
	path?: string;
	value?: unknown;
	description?: string;
}
interface UnspaAction {
	id: string;
	name: string;
	intent: string;
	parameters: unknown[];
	requiredStates: string[];
	rules: unknown[];
	invariants: unknown[];
	effects: UnspaEffect[];
	emittedEvents: string[];
	transitions: unknown[];
	scenarios?: unknown[];
	visibility?: unknown;
}
interface UnspaSurface {
	id: string;
	name: string;
	type: string;
	description: string;
	stateDefinitions: unknown[];
	rules: unknown[];
	invariants: unknown[];
	transitions: unknown[];
	actions: UnspaAction[];
	/** Screen surfaces are pure UI (builder layout), excluded from behavior maturity
	 *  by the engine (unspaghettit ≥ 0.10.0). Only set on builder-screen surfaces. */
	presentation?: boolean;
}
interface UnspaPersona {
	id: string;
	name: string;
	description: string;
	stateOverrides: never[];
	parameterOverrides: never[];
}
interface UnspaEvent {
	id: string;
	name: string;
	description: string;
}
interface BuiltBehavior {
	surfaces: UnspaSurface[];
	personas: UnspaPersona[];
	events: UnspaEvent[];
}

/* ── builders (ported verbatim from sync-experience-to-unspaghettit) ────── */

function buildBehavior(
	experience: ProjectExperienceDraft,
	journeys: Journey[],
	roleName: (id: string) => string
): BuiltBehavior {
	const eventNames = new Set<string>();
	const screenName = (id: string | null) =>
		id ? experience.screens.find((s) => s.id === id)?.name || 'screen' : null;

	const surfaces: UnspaSurface[] = journeys
		.slice()
		.sort((a, b) => a.order - b.order)
		.map((journey) => {
			const jSlug = slug(journey.name || 'journey');
			const journeySteps = stepsOfJourney(experience, journey.id);
			const stepTransitions: unknown[] = [];
			for (let i = 0; i < journeySteps.length; i++) {
				const step = journeySteps[i];
				const next = journeySteps[i + 1];
				if (next)
					stepTransitions.push({ id: `seq-${step.id}`, from: `act-${step.id}`, to: `act-${next.id}` });
				if (step.linkedScreenId)
					stepTransitions.push({
						id: `lnk-${step.id}`,
						fromAction: `act-${step.id}`,
						toSurface: screenSurfaceId(step.linkedScreenId)
					});
			}
			const actions: UnspaAction[] = journeySteps.map((step) => {
				const ops = operationsOfStep(experience, step.id);
				const reads = dataReadsOfStep(experience, step.id);
				const stepSlug = slug(step.name || 'step');

				const opEvents = ops
					.filter((o) => o.kind === 'event' && o.label.trim())
					.map((o) => eventName(o.label));
				const completed = `${jSlug}.${stepSlug}.completed`;
				const emitted = [...new Set([...opEvents, completed])];
				emitted.forEach((e) => eventNames.add(e));

				const effects: UnspaEffect[] = emitted.map((e, i) => ({
					id: `eff-${step.id}-${i}`,
					type: 'emit_event',
					event: e
				}));

				return {
					id: `act-${step.id}`,
					name: step.name || 'Step',
					intent: stepIntent(step.name, screenName(step.linkedScreenId), ops, reads),
					parameters: [],
					requiredStates: [],
					rules: [],
					invariants: [],
					effects,
					emittedEvents: emitted,
					transitions: []
				};
			});

			return {
				id: `srf-${journey.id}`,
				name: journey.name || 'Journey',
				type: 'workflow',
				description: journeyDescription(journey, roleName),
				stateDefinitions: [],
				rules: [],
				invariants: [],
				transitions: stepTransitions,
				actions
			};
		});

	const roleIds = new Set<string>();
	for (const j of journeys) for (const r of j.actorRoleIds) roleIds.add(r);
	const personas: UnspaPersona[] = [...roleIds].map((id) => ({
		id: `per-${id}`,
		name: roleName(id),
		description: `Actor role from Users & Permissions that performs one or more journeys.`,
		stateOverrides: [],
		parameterOverrides: []
	}));

	const events: UnspaEvent[] = [...eventNames].map((name, i) => ({
		id: `evt-${i}-${slug(name)}`,
		name,
		description: 'Emitted while the experience flow runs.'
	}));

	return { surfaces, personas, events };
}

/** Stable Unspaghettit surface id for a builder screen — the navigation graph's node id. */
const screenSurfaceId = (screenId: string) => `srf-screen-${screenId}`;

/** Preserve an engine-minted action id when a screen action was imported into the builder. */
function builderActionId(element: BuilderElementNode): string {
	return (
		element.kernelActionId ??
		(isFieldBuilderKind(element.elementKind) ? `act-write-${element.id}` : `act-${element.id}`)
	);
}

/**
 * Kernel `set_state` value for a builder setState wiring: the builder stores the
 * value as a raw string, the engine evaluates typed JSON literals — coerce so
 * rules and simulation see `true`/`2`, not `'true'`/`'2'`. A blank value means
 * "flag it" (true), matching how authors wire toggle-like buttons.
 */
const stateLiteral = (raw: string | undefined): unknown => {
	if (raw === undefined || raw === '' || raw === 'true') return true;
	if (raw === 'false') return false;
	const n = Number(raw);
	return Number.isFinite(n) ? n : raw;
};

/** Increment step for an incrementState wiring — blank step defaults to 1 (builder semantics). */
const incrementStep = (raw: string | undefined): number => {
	const n = Number(raw);
	return raw !== undefined && raw !== '' && Number.isFinite(n) ? n : 1;
};

/**
 * Why-note on a derived set_state effect. The kernel effect itself is
 * unconditional; when the builder wiring carries a when-guard, record it here
 * so a reader of the model knows the UI only fires it conditionally.
 */
const uiEffectDescription = (
	label: string,
	trigger: string,
	guard: { path: string; op: string; expected: unknown } | null
): string =>
	`Derived from the ${trigger} wiring of "${label}" in the Experience Builder.` +
	(guard
		? ` The builder applies it only when ${guard.path} ${guard.op} ${JSON.stringify(guard.expected)}.`
		: '');

function buildBuilderBehavior(
	experience: ProjectExperienceDraft,
	roleName: (id: string) => string,
	declaredStates?: ReadonlyMap<string, DeclaredState>
): BuiltBehavior {
	const b = experience.builder;
	if (!b) return { surfaces: [], personas: [], events: [] };
	const eventNames = new Set<string>();
	const roleIds = new Set<string>();
	// Builder roots are screens, but also reusable components, templates, and the
	// app chrome — resolve every owner so a component surface lands in the kernel
	// under its real name, not a generic "Screen".
	const CHROME_SURFACE_NAMES: Record<string, string> = {
		__app_header__: 'App header',
		__app_footer__: 'App footer'
	};
	const screenName = (id: string) =>
		experience.screens.find((s) => s.id === id)?.name ||
		experience.components.find((c) => c.id === id)?.name ||
		experience.templates.find((t) => t.id === id)?.name ||
		CHROME_SURFACE_NAMES[id] ||
		'Screen';

	const seeds = new Map<string, string>();
	for (const s of b.stateSeeds ?? []) if (s.path) seeds.set(s.path, s.value);
	const consumedSeeds = new Set<string>();

	const surfaces: UnspaSurface[] = Object.keys(b.screenRoots).map((screenId) => {
		const elements = Object.values(b.nodes).filter(
			(n): n is BuilderElementNode => n.kind === 'element' && n.surfaceId === screenId
		);
		const actions: UnspaAction[] = [];
		const stateDefinitions: unknown[] = [];
		const navEdges: unknown[] = [];
		for (const el of elements) {
			el.wiring.gate?.personaIds.forEach((id) => roleIds.add(id));
			if (isFieldBuilderKind(el.elementKind)) {
				const path = fieldStatePath(el);
				if (seeds.has(path)) consumedSeeds.add(path);
				stateDefinitions.push(inputStateDef(el, seeds.get(path)));
				actions.push({
					id: builderActionId(el),
					name: `Set ${el.label || 'field'}`,
					intent: `Writes the ${el.label || 'field'} input into state ${path}.`,
					parameters: [
						{
							name: slug(el.label || 'value'),
							type: fieldStateType(el),
							...enumValuesOf(el),
							bindToStatePath: path
						}
					],
					requiredStates: [],
					rules: [],
					invariants: [],
					effects: [],
					emittedEvents: [],
					transitions: [],
					scenarios: [],
					visibility: null
				});
				continue;
			}
			if (!isInteractiveBuilderKind(el.elementKind)) continue;

			const requiredStates: string[] = [];
			const emitted: string[] = [];
			const transitions: unknown[] = [];
			const stateEffects: UnspaEffect[] = [];
			if (el.wiring.binding?.targetKind === 'state' && el.wiring.binding.targetRef)
				requiredStates.push(el.wiring.binding.targetRef);
			if (el.wiring.binding?.targetKind === 'event' && el.wiring.binding.targetRef)
				emitted.push(eventName(el.wiring.binding.targetRef));
			for (const t of el.wiring.transitions) {
				const guard = t.when?.path ? { path: t.when.path, op: t.when.op, expected: t.when.expected ?? null } : null;
				transitions.push({ trigger: t.trigger, kind: t.effect.kind, target: t.effect.target, when: guard });
				// State-writing wirings become real kernel set_state effects (id `eff-ui-*`,
				// Lyriks-owned — see merge-unspa-behavior), so a wired button is executable
				// behavior in the engine, not just a UI annotation.
				if (t.effect.kind === 'setState' && t.effect.target) {
					requiredStates.push(t.effect.target);
					stateEffects.push({
						id: `eff-ui-${el.id}-${t.id}`,
						type: 'set_state',
						path: t.effect.target,
						value: stateLiteral(t.effect.value),
						description: uiEffectDescription(el.label || el.elementKind, t.trigger, guard)
					});
				}
				if (t.effect.kind === 'toggleState' && t.effect.target) {
					requiredStates.push(t.effect.target);
					stateEffects.push({
						id: `eff-ui-${el.id}-${t.id}`,
						type: 'set_state',
						path: t.effect.target,
						value: { kind: 'not', operand: { kind: 'state', path: t.effect.target } },
						description: uiEffectDescription(el.label || el.elementKind, t.trigger, guard)
					});
				}
				if (t.effect.kind === 'incrementState' && t.effect.target) {
					requiredStates.push(t.effect.target);
					stateEffects.push({
						id: `eff-ui-${el.id}-${t.id}`,
						type: 'set_state',
						path: t.effect.target,
						value: {
							kind: 'add',
							left: { kind: 'state', path: t.effect.target },
							right: { kind: 'literal', value: incrementStep(t.effect.value) }
						},
						description: uiEffectDescription(el.label || el.elementKind, t.trigger, guard)
					});
				}
				if (t.effect.kind === 'navigate' && t.effect.target)
					navEdges.push({
						id: `nav-${el.id}-${t.id}`,
						trigger: t.trigger,
						viaAction: builderActionId(el),
						toScreenId: t.effect.target,
						toSurface: screenSurfaceId(t.effect.target),
						when: guard
					});
				if (t.effect.kind === 'navigateBack')
					navEdges.push({ id: `nav-${el.id}-${t.id}`, trigger: t.trigger, viaAction: builderActionId(el), back: true });
			}
			if (el.wiring.binding?.targetKind === 'surface' && el.wiring.binding.targetRef)
				navEdges.push({
					id: `nav-${el.id}-bind`,
					trigger: 'click',
					viaAction: builderActionId(el),
					toScreenId: el.wiring.binding.targetRef,
					toSurface: screenSurfaceId(el.wiring.binding.targetRef)
				});
			emitted.forEach((e) => eventNames.add(e));
			const effects: UnspaEffect[] = [
				...emitted.map((e, i) => ({
					id: `eff-${el.id}-${i}`,
					type: 'emit_event',
					event: e
				})),
				...stateEffects
			];
			actions.push({
				id: builderActionId(el),
				name: el.label || 'Action',
				intent: builderActionIntent(el, screenName(screenId)),
				parameters: [],
				requiredStates: [...new Set(requiredStates)],
				rules: [],
				invariants: [],
				effects,
				emittedEvents: emitted,
				transitions,
				scenarios: builderScenarios(el),
				visibility: visibilityOf(el)
			});
		}
		return {
			id: screenSurfaceId(screenId),
			name: screenName(screenId),
			type: 'screen',
			description: 'Designed surface from the Experience Builder.',
			stateDefinitions,
			rules: [],
			invariants: [],
			transitions: navEdges,
			actions,
			// A builder screen is pure UI/layout — mark it presentation so the engine
			// (unspaghettit ≥ 0.10.0) excludes it from behavior maturity; the journey
			// (workflow) surfaces carry the modeled behavior and stay scored.
			presentation: true
		};
	});

	const leftover = [...seeds].filter(([p]) => !consumedSeeds.has(p));
	if (leftover.length) {
		const entry = surfaces.find((s) => s.id === screenSurfaceId(b.entryScreenId ?? '')) ?? surfaces[0];
		if (entry)
			for (const [path, value] of leftover)
				entry.stateDefinitions.push(seedStateDef(path, value, declaredStates?.get(path)));
	}

	const personas: UnspaPersona[] = [...roleIds].map((id) => ({
		id: `per-${id}`,
		name: roleName(id),
		description: 'Persona that gates one or more builder elements.',
		stateOverrides: [],
		parameterOverrides: []
	}));
	const events: UnspaEvent[] = [...eventNames].map((name, i) => ({
		id: `evt-b-${i}-${slug(name)}`,
		name,
		description: 'Emitted by a builder element.'
	}));
	return { surfaces, personas, events };
}

/**
 * A leftover seed's type, read from its value the way the simulator reads it
 * (parseValue): "72" seeds a number, "false" a boolean, anything else a string.
 * Declaring every seed as a string declared string states that other features
 * write numbers into, which the formal engine rightly refused as a type clash.
 */
function seedStateType(value: string): 'boolean' | 'number' | 'string' {
	const v = parseValue(value);
	return typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string';
}

/**
 * A simulator seed declared as a state on the entry screen. A seed is a value,
 * never a type: when a leaf feature declares the path in its behavior model,
 * the seed carries THAT type (and its enum values), so the mirror never
 * contradicts the model it sits beside; only a path no feature declares is
 * typed from the shape of its value. The default value is the seed in the
 * shape of its type, as the kernel's state definition expects.
 */
function seedStateDef(path: string, value: string, declared: DeclaredState | undefined) {
	const type = declared?.type ?? seedStateType(value);
	return {
		id: `st-seed-${slug(path)}`,
		name: path,
		path,
		type,
		...(declared?.enumValues ? { enumValues: [...declared.enumValues] } : {}),
		required: false,
		seeded: true,
		initial: value,
		defaultValue: seedValue(value, type),
		constraints: []
	};
}

/** The seed value in the shape of its type: `'3'` on a number state is 3, not the text. */
function seedValue(value: string, type: string): string | number | boolean {
	if (type === 'number') {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	}
	if (type === 'boolean') return value === 'true';
	return value;
}

/** The `enumValues` a field's parameter and state definition carry, when it has a closed set. */
function enumValuesOf(el: BuilderElementNode): { enumValues?: string[] } {
	const values = fieldEnumValues(el);
	return values ? { enumValues: values } : {};
}

function inputStateDef(el: BuilderElementNode, seeded?: string) {
	const validations = el.wiring.validations ?? [];
	return {
		id: `st-${el.id}`,
		name: el.label || 'Field',
		path: fieldStatePath(el),
		type: fieldStateType(el),
		...enumValuesOf(el),
		required: validations.some((v) => v.kind === 'required'),
		...(seeded !== undefined ? { seeded: true, initial: seeded } : {}),
		...(el.wiring.visibleWhen?.path ? { visibility: visibilityOf(el) } : {}),
		constraints: validations.map((v) => ({
			kind: v.kind,
			param: v.param ?? null,
			description: v.description?.trim() || validationDescription(v.kind, v.param, el.label),
			message: v.message
		}))
	};
}

function builderScenarios(el: BuilderElementNode): unknown[] {
	const assertions = (list: { path: string; op: string; expected?: string; message: string }[]) =>
		list.map((a) => ({ path: a.path, op: a.op, expected: a.expected ?? null, message: a.message }));
	return el.wiring.scenarios.map((s) => ({
		id: `scn-${el.id}-${s.id}`,
		title: s.title,
		whenTrigger: s.whenTrigger,
		given: assertions(s.given),
		then: assertions(s.then)
	}));
}

function visibilityOf(el: BuilderElementNode): unknown {
	const v = el.wiring.visibleWhen;
	if (!v || !v.path) return null;
	return { path: v.path, op: v.op, expected: v.expected ?? null };
}

function builderActionIntent(el: BuilderElementNode, screen: string): string {
	const bits = [el.label?.trim() || 'Interactive element.', `On screen: ${screen}.`];
	if (el.wiring.binding)
		bits.push(`Bound to ${el.wiring.binding.targetKind}: ${el.wiring.binding.targetRef || '(unset)'}.`);
	if (el.wiring.scenarios.length)
		bits.push(`Scenarios: ${el.wiring.scenarios.map((s) => s.title).join(', ')}.`);
	return bits.join(' ');
}

function dedupeBy<T>(list: T[], key: (t: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of list) {
		const k = key(item);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(item);
	}
	return out;
}

function journeyDescription(journey: Journey, roleName: (id: string) => string): string {
	const actors = journey.actorRoleIds.map(roleName).filter(Boolean);
	const bits = [journey.description?.trim() || `Journey: ${journey.name || '(unnamed)'}.`];
	if (actors.length) bits.push(`Performed by: ${actors.join(', ')}.`);
	return bits.join(' ');
}

function stepIntent(
	name: string,
	screen: string | null,
	ops: { kind: string; label: string }[],
	reads: { mode: string; entityName: string; fields: string[] }[]
): string {
	const bits = [name?.trim() || 'Step in the journey.'];
	if (screen) bits.push(`On screen: ${screen}.`);
	const calls = ops.filter((o) => o.kind !== 'event' && o.label.trim()).map((o) => o.label);
	if (calls.length) bits.push(`Calls: ${calls.join(', ')}.`);
	if (reads.length) {
		const r = reads
			.filter((x) => x.entityName.trim())
			.map((x) => `${x.mode} ${x.entityName}${x.fields.length ? ` {${x.fields.join(', ')}}` : ''}`);
		if (r.length) bits.push(`Data: ${r.join('; ')}.`);
	}
	return bits.join(' ');
}

/** A dotted, lowercase event name (keeps existing dotted labels intact). */
function eventName(label: string): string {
	const cleaned = label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9.]+/g, '.')
		.replace(/\.+/g, '.')
		.replace(/^\.|\.$/g, '');
	return cleaned || 'event';
}

function slug(s: string): string {
	return (
		s
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_|_$/g, '') || 'x'
	);
}
