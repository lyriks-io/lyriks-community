import type { ComponentColor, DataMode, OperationKind } from './enums';
import { emptyPrototype, type ExperiencePrototype, type BindTargetKind } from './prototype';
import {
	emptyBuilder,
	fieldStatePath,
	isFieldBuilderKind,
	STATE_EFFECT_KINDS,
	type BuilderElementNode,
	type ExperienceBuilder
} from './builder';
import { defaultBrand, type ProjectBrand } from './brand';

/* ── Entities — mirror of Unspaghettit feature 1bf10f8f ─────────────── */

/**
 * One authored user journey laid over the macro flow. Sits under exactly one
 * Core (mirrored read-only from Step 04) and is performed by one or more actor
 * Roles authored in Step 03. Its ordered Steps live in `steps`, keyed by id.
 */
export interface Journey {
	readonly id: string;
	coreId: string;
	name: string;
	description: string;
	order: number;
	/** Step-03 Role ids that perform this journey. */
	actorRoleIds: string[];
}

/**
 * One ordered step inside a Journey: a user-facing interaction that optionally
 * links a Library Screen. Its two invisible underlays (Events Flow, Data
 * Consumed) live in `stepOperations` / `stepDataReads`, keyed by stepId.
 */
export interface JourneyStep {
	readonly id: string;
	journeyId: string;
	name: string;
	order: number;
	linkedScreenId: string | null;
}

/** One entry in a Step's Events-Flow underlay — an API call, cache op or event. */
export interface StepOperation {
	readonly id: string;
	stepId: string;
	order: number;
	kind: OperationKind;
	label: string;
}

/** One entry in a Step's Data-Consumed underlay — an Entity read or written. */
export interface StepDataRead {
	readonly id: string;
	stepId: string;
	order: number;
	entityName: string;
	mode: DataMode;
	fields: string[];
}

/* ── Library blueprints (Template → Screen → Component → Element) ──────── */
/* Named with a `Library` prefix to avoid clashing with the DOM `Screen`,    */
/* `Element` globals that the SvelteKit `dom` lib brings into scope.         */

/** A reusable screen blueprint (layout/shell) that Screens inherit from. */
export interface LibraryTemplate {
	readonly id: string;
	name: string;
	description: string;
}

/** A Library Screen blueprint; the link target for Journey Steps. May inherit a Template. */
export interface LibraryScreen {
	readonly id: string;
	name: string;
	templateId: string | null;
	description: string;
	/** Grouping bucket on the Screens view; null = auto (by core / Transverse). */
	category: string | null;
	/** Explicit parent screen id for the Landscape tree (drag-drop override). */
	parentScreen: string | null;
	/** URL route for the web-app simulator (e.g. "/expenses/new"); '' = auto from name. */
	path: string;
	/** Device layout this screen is viewed on (sizes the simulator window). */
	device: import('./device').DeviceKind;
	/** Custom device width/height (used when device = 'custom'). */
	deviceW: number;
	deviceH: number;
}

/** A url-safe slug from arbitrary text. */
export function slugifyPath(s: string): string {
	return (
		s
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'screen'
	);
}

/** A screen's route — its explicit `path`, else a slug of its name. Always leading-slash. */
export function screenPath(screen: LibraryScreen): string {
	const p = (screen.path || '').trim();
	if (p) return p.startsWith('/') ? p : `/${p}`;
	return `/${slugifyPath(screen.name || 'screen')}`;
}

/** A plausible app domain from the product name (e.g. "Expensa" → "expensa.app"). */
export function appDomain(productName: string): string {
	const slug = slugifyPath(productName || 'app');
	return `${slug}.app`;
}

/** A reusable UI component reused across Screens. */
export interface LibraryComponent {
	readonly id: string;
	name: string;
	description: string;
	/** Accent color shown on the Components view (the mockup's COLOR_MAP). */
	color: ComponentColor;
}

/** A reusable atomic UI element reused across Components / Screens. */
export interface LibraryElement {
	readonly id: string;
	name: string;
	description: string;
}

/**
 * A Core mirrored read-only from Step 04. The macro stages of the flow;
 * journeys attach via `coreId`. Recomputed on load, never authored here.
 */
export interface DerivedCore {
	readonly id: string;
	name: string;
	order: number;
	/** Visual tone mirrored from Step 04, used by UI adapters to keep journeys colour-linked. */
	tone: string;
	/** Id of the upstream Step-04 Core this row mirrors. */
	sourceRefId: string;
}

/**
 * The persisted content of Step 05. Journeys-over-cores plus the per-step
 * underlays and the reusable Library. `derivedCores` is a mirror of the Step
 * 04 core set — refreshed on every load, persisted only so a reload before the
 * next save still renders the macro flow.
 */
export interface ProjectExperienceDraft {
	projectId: string;
	journeys: Journey[];
	steps: JourneyStep[];
	stepOperations: StepOperation[];
	stepDataReads: StepDataRead[];
	templates: LibraryTemplate[];
	screens: LibraryScreen[];
	components: LibraryComponent[];
	elements: LibraryElement[];
	derivedCores: DerivedCore[];
	/** The designless runnable prototype (legacy; migrated into `builder`). */
	prototype: ExperiencePrototype;
	/** The Experience Builder — per-screen layout trees + wiring + run state. */
	builder: ExperienceBuilder;
	/**
	 * Brand & Design — the visual-language brief (identity, tokens, markers,
	 * per-component styling, page principles, examples). Decoupled from the
	 * simulator's live `builder.theme`; pure LLM-brief documentation.
	 */
	brand: ProjectBrand;
	lastSavedAt: string | null;
}

export function createEmptyExperienceDraft(projectId: string): ProjectExperienceDraft {
	return {
		projectId,
		journeys: [],
		steps: [],
		stepOperations: [],
		stepDataReads: [],
		templates: [],
		screens: [],
		components: [],
		elements: [],
		derivedCores: [],
		prototype: emptyPrototype(),
		builder: emptyBuilder(),
		brand: defaultBrand(),
		lastSavedAt: null
	};
}

function newId(): string {
	return crypto.randomUUID();
}

/** Next order value among siblings — the items already filtered to one parent. */
function nextOrder(siblings: readonly { order: number }[]): number {
	return siblings.reduce((max, s) => Math.max(max, s.order), -1) + 1;
}

export function createJourney(coreId: string, order: number, overrides: Partial<Journey> = {}): Journey {
	return { id: newId(), coreId, name: '', description: '', order, actorRoleIds: [], ...overrides };
}

export function createStep(journeyId: string, order: number, overrides: Partial<JourneyStep> = {}): JourneyStep {
	return { id: newId(), journeyId, name: '', order, linkedScreenId: null, ...overrides };
}

export function createOperation(
	stepId: string,
	order: number,
	overrides: Partial<StepOperation> = {}
): StepOperation {
	return { id: newId(), stepId, order, kind: 'api', label: '', ...overrides };
}

export function createDataRead(
	stepId: string,
	order: number,
	overrides: Partial<StepDataRead> = {}
): StepDataRead {
	return { id: newId(), stepId, order, entityName: '', mode: 'read', fields: [], ...overrides };
}

export function createTemplate(overrides: Partial<LibraryTemplate> = {}): LibraryTemplate {
	return { id: newId(), name: '', description: '', ...overrides };
}

export function createScreen(overrides: Partial<LibraryScreen> = {}): LibraryScreen {
	return {
		id: newId(),
		name: '',
		templateId: null,
		description: '',
		category: null,
		parentScreen: null,
		path: '',
		device: 'auto',
		deviceW: 1024,
		deviceH: 768,
		...overrides
	};
}

export function createComponent(overrides: Partial<LibraryComponent> = {}): LibraryComponent {
	return { id: newId(), name: '', description: '', color: 'violet', ...overrides };
}

export function createElement(overrides: Partial<LibraryElement> = {}): LibraryElement {
	return { id: newId(), name: '', description: '', ...overrides };
}

/* ── Pure selectors ───────────────────────────────────────────────────── */

/** Journeys under one Core, ordered. */
export function journeysUnderCore(draft: ProjectExperienceDraft, coreId: string): Journey[] {
	return draft.journeys.filter((j) => j.coreId === coreId).sort((a, b) => a.order - b.order);
}

/** Steps of one Journey, ordered. */
export function stepsOfJourney(draft: ProjectExperienceDraft, journeyId: string): JourneyStep[] {
	return draft.steps.filter((s) => s.journeyId === journeyId).sort((a, b) => a.order - b.order);
}

/** One stop on a guided journey run — an ordered step that lands on a real screen. */
export interface JourneyScreenStop {
	stepId: string;
	name: string;
	screenId: string;
}

/** Ordered steps of a journey that link to an existing screen (the runnable path). */
export function journeyScreenStops(
	draft: ProjectExperienceDraft,
	journeyId: string
): JourneyScreenStop[] {
	const screenIds = new Set(draft.screens.map((s) => s.id));
	return stepsOfJourney(draft, journeyId)
		.filter((s) => s.linkedScreenId && screenIds.has(s.linkedScreenId))
		.map((s) => ({ stepId: s.id, name: s.name, screenId: s.linkedScreenId as string }));
}

/** Journeys that have at least one runnable screen stop (followable in the runner). */
export function runnableJourneys(draft: ProjectExperienceDraft): Journey[] {
	return [...draft.journeys]
		.sort((a, b) => a.order - b.order)
		.filter((j) => journeyScreenStops(draft, j.id).length > 0);
}

/** Events-flow operations of one Step, ordered. */
export function operationsOfStep(draft: ProjectExperienceDraft, stepId: string): StepOperation[] {
	return draft.stepOperations.filter((o) => o.stepId === stepId).sort((a, b) => a.order - b.order);
}

/** Data-consumed entries of one Step, ordered. */
export function dataReadsOfStep(draft: ProjectExperienceDraft, stepId: string): StepDataRead[] {
	return draft.stepDataReads.filter((d) => d.stepId === stepId).sort((a, b) => a.order - b.order);
}

/* ── Binding suggestions ──────────────────────────────────────────────── */
/** One pickable value for an element binding, with a human hint of its origin. */
export interface BindSuggestion {
	value: string;
	hint: string;
}

/**
 * Candidate refs to bind an element to, for a given target kind — sourced from
 * what's already authored elsewhere in the draft so the user picks instead of
 * guessing a string:
 *   action → Step-05 API operations · event → Event operations · entity →
 *   entities named in any step's Data-Consumed underlay · state → seeded state
 *   paths, state written by transitions, input field paths, and visibility paths.
 * Refs already used by other element bindings of the same kind are folded in too.
 * `surface` is intentionally omitted — screens are picked from a dedicated list.
 */
export function bindingSuggestions(
	draft: ProjectExperienceDraft,
	kind: BindTargetKind
): BindSuggestion[] {
	const out = new Map<string, string>(); // value → hint (first wins)
	const add = (value: string | undefined | null, hint: string) => {
		const v = value?.trim();
		if (v && !out.has(v)) out.set(v, hint);
	};

	const elements = Object.values(draft.builder.nodes).filter(
		(n): n is BuilderElementNode => n.kind === 'element'
	);
	// Refs already bound on other elements of this kind — reuse beats re-typing.
	for (const el of elements) {
		const b = el.wiring.binding;
		if (b?.targetKind === kind) add(b.targetRef, `used by "${el.label}"`);
	}

	if (kind === 'action') {
		for (const op of draft.stepOperations)
			if (op.kind === 'api') add(op.label, 'API operation · step flow');
	} else if (kind === 'event') {
		for (const op of draft.stepOperations)
			if (op.kind === 'event') add(op.label, 'Event · step flow');
	} else if (kind === 'entity') {
		for (const c of draft.builder.collections) add(c.name, 'collection · fake backend');
		for (const d of draft.stepDataReads) add(d.entityName, 'entity · data consumed');
	} else if (kind === 'state') {
		for (const s of draft.builder.stateSeeds) add(s.path, 'seeded state');
		for (const el of elements) {
			if (isFieldBuilderKind(el.elementKind)) add(fieldStatePath(el), `${el.elementKind} "${el.label}"`);
			for (const t of el.wiring.transitions) {
				if (STATE_EFFECT_KINDS.includes(t.effect.kind)) add(t.effect.target, 'written by a flow');
				// `selectRecord` publishes the clicked row under a path PREFIX; suggest the
				// prefix so the fields it writes (`<prefix>.<field>`) are discoverable.
				if (t.effect.kind === 'selectRecord' && t.effect.target)
					add(t.effect.target, 'selected record (row → state)');
			}
			if (el.wiring.visibleWhen) add(el.wiring.visibleWhen.path, 'visibility condition');
			// Action/event bindings emit a `action.<ref>` / `event.<ref>` run-state
			// counter when fired, so they're observable as state (e.g. visibleWhen).
			const b = el.wiring.binding;
			if ((b?.targetKind === 'action' || b?.targetKind === 'event') && b.targetRef)
				add(`${b.targetKind}.${b.targetRef}`, `emitted by "${el.label}"`);
		}
	}

	return [...out.entries()]
		.map(([value, hint]) => ({ value, hint }))
		.sort((a, b) => a.value.localeCompare(b.value));
}

export { nextOrder };
