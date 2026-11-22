import { isDraftLeafId, type EvolutionRequest, type ImplementationFinding, type Iteration } from './draft';
import { deriveVerdict } from './implementation';
import { stableId } from './ids';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

/**
 * The implementation report, DERIVED (ac-evo-impl-2, -3, -4, -9).
 *
 * The input is what the behaviour engine holds for each touched feature after
 * the implementation index was synced from a checkout: which specified entities
 * were expected, which were located in code and where, which tags in the code
 * match nothing in the spec. The lines follow from that crossing alone; nobody's
 * account of the work is read.
 *
 * The payload is taken structurally, in the engine's own vocabulary, because
 * the platform relays it verbatim everywhere else.
 */
export interface LocatedSpan {
	readonly file: string;
	readonly line?: number;
	readonly snippet?: string;
	readonly unverified?: boolean;
	readonly stale?: boolean;
}

export interface StatusEntity {
	readonly entityType: string;
	readonly entityId: string;
	readonly entityName?: string;
	readonly tag?: string;
	readonly locations?: readonly LocatedSpan[];
}

export interface StatusRow {
	readonly actionId?: string;
	readonly actionName?: string;
	readonly surfaceId?: string;
	readonly surfaceName?: string;
	readonly expectedEntities?: readonly StatusEntity[];
	readonly foundEntities?: readonly StatusEntity[];
	readonly missingEntities?: readonly StatusEntity[];
	readonly extraTags?: readonly { readonly tag: string; readonly locations?: readonly LocatedSpan[] }[];
	/**
	 * `verifiedAt` is stamped when every scenario of the action passed against
	 * the real code; `testFile` only names a file and proves nothing.
	 */
	readonly auditMeta?: { readonly testFile?: string; readonly verifiedAt?: string };
}

export interface FeatureStatus {
	readonly actions?: readonly StatusRow[];
	readonly surfaces?: readonly StatusRow[];
	/**
	 * Every acceptance criterion with how it last went: `verified` (a passing
	 * result), `failing`, `unverified` (indexed, nothing ran) or `none`.
	 */
	readonly criteria?: readonly { readonly criterionId: string; readonly title?: string; readonly state?: string }[];
}

/**
 * What the spec declares on a feature, read from the feature itself: the floor
 * of the report. Without it a feature nobody indexed yet reports no line at all,
 * and an empty report reads like work done.
 */
export interface SpecElements {
	readonly surfaces: readonly { readonly id: string; readonly name: string }[];
	readonly actions: readonly { readonly id: string; readonly name: string; readonly surfaceName: string }[];
	/**
	 * Every other element the feature declares, keyed the way the engine keys
	 * the entities of a status row (`rule:<id>`, `state:<id>`, `event:<name>`...).
	 * What a baseline is taken of when nothing was indexed yet.
	 */
	readonly elementKeys?: readonly string[];
	/**
	 * The actions of its screen that read or write each state, by state id: what
	 * proves the state once each passed all its scenarios (criterion ad059df9).
	 */
	readonly stateTouchedBy?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The state paths an action reads or writes: an effect's path, a state read by a
 * rule or an expression, a required state, a parameter bound to a state. Its
 * scenarios set and assert states without the action touching them, so they
 * are left out.
 */
function statePathsOf(action: Readonly<Record<string, unknown>>): Set<string> {
	const paths = new Set<string>();
	const walk = (value: unknown): void => {
		if (Array.isArray(value)) return value.forEach(walk);
		if (!value || typeof value !== 'object') return;
		for (const [key, inner] of Object.entries(value)) {
			if (key === 'scenarios') continue;
			if ((key === 'path' || key === 'left' || key === 'bindToStatePath') && typeof inner === 'string') paths.add(inner);
			else if (key === 'requiredStates' && Array.isArray(inner)) {
				for (const p of inner) if (typeof p === 'string') paths.add(p);
			} else walk(inner);
		}
	};
	walk(action);
	return paths;
}

/** The surfaces and actions a feature snapshot declares, structurally. */
export function specElementsOf(feature: Readonly<Record<string, unknown>> | null | undefined): SpecElements {
	const surfaces: { id: string; name: string }[] = [];
	const actions: { id: string; name: string; surfaceName: string }[] = [];
	const elementKeys = new Set<string>();
	const stateTouchedBy: Record<string, string[]> = {};
	const rows = (value: unknown): Record<string, unknown>[] =>
		Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
	const keyAll = (type: string, value: unknown) => {
		for (const row of rows(value)) if (typeof row?.id === 'string' && row.id) elementKeys.add(`${type}:${row.id}`);
	};
	for (const surface of rows(feature?.surfaces)) {
		const id = typeof surface?.id === 'string' ? surface.id : '';
		if (!id) continue;
		const name = typeof surface.name === 'string' && surface.name ? surface.name : id;
		surfaces.push({ id, name });
		keyAll('state', surface.stateDefinitions);
		keyAll('surface_rule', surface.rules);
		keyAll('surface_invariant', surface.invariants);
		const states = rows(surface.stateDefinitions).filter((sd) => typeof sd.id === 'string' && typeof sd.path === 'string');
		for (const action of rows(surface.actions)) {
			const actionId = typeof action?.id === 'string' ? action.id : '';
			if (!actionId) continue;
			actions.push({ id: actionId, name: typeof action.name === 'string' && action.name ? action.name : actionId, surfaceName: name });
			const touched = statePathsOf(action);
			for (const sd of states) if (touched.has(sd.path as string)) (stateTouchedBy[sd.id as string] ??= []).push(actionId);
			keyAll('rule', action.rules);
			keyAll('invariant', action.invariants);
			keyAll('transition', action.transitions);
			for (const event of Array.isArray(action.emittedEvents) ? action.emittedEvents : [])
				if (typeof event === 'string' && event) elementKeys.add(`event:${event}`);
		}
	}
	return { surfaces, actions, elementKeys: [...elementKeys], stateTouchedBy };
}

export interface ReportDerivationInput {
	readonly request: Pick<EvolutionRequest, 'id' | 'iteration' | 'specVersion' | 'leafIds'>;
	/** The engine status of each touched feature; null when the feature has no synced index. */
	readonly statuses: Readonly<Record<string, FeatureStatus | null>>;
	/** The engine status of the other features, to detect what the change disturbed. */
	readonly neighbours: Readonly<Record<string, FeatureStatus | null>>;
	readonly leafNames: Readonly<Record<string, string>>;
	/**
	 * The elements the touched features held at the request's first freeze
	 * (`<entityType>:<entityId>`). A line on one of them is inherited; null or
	 * absent, every line is the request's.
	 */
	readonly baseline?: ReadonlySet<string> | null;
	/**
	 * What the request's drafts bring or change on each touched feature
	 * (`<entityType>:<entityId>`, see broughtKeys): where it is known, a line is
	 * the request's on those elements only, and anything else the feature holds,
	 * a direct change made after the freeze included, is inherited (criterion
	 * 28d5a69c). A feature absent or null here falls back to the baseline.
	 */
	readonly brought?: Readonly<Record<string, ReadonlySet<string> | null>>;
	/** What the spec declares on each touched feature; a feature the index has no row for still reports. */
	readonly spec?: Readonly<Record<string, SpecElements | null>>;
	/** The language of the spec: the statements are stored, so they are written in it. */
	readonly lang?: SpecLanguage;
}

/** What a report line says, in the language of the spec. Names and entity types stay as they are. */
const LINE_TEXTS = {
	en: {
		requirement: (leaf: string, owner: string, type: string, name: string) => `${leaf} › ${owner} › ${type} "${name}"`,
		declares: (type: string, name: string, owner: string) => `The spec declares the ${type} "${name}" on ${owner}.`,
		located: 'located',
		unverified: ' (unverified: the signature no longer matches)',
		stale: ' (stale)',
		unproven: ' (no passing result proves it yet)',
		screenProvenState: ' (proven by its screen: every action of the screen passed all its scenarios)',
		touchProvenState: ' (proven by the actions that read or write it: each passed all its scenarios)',
		screenProvenCheck: " (proven by its screen: the engine checks it in every scenario of the screen's actions, and they all passed)",
		nothingLocated: 'Nothing was located for it in the synced index.',
		extraRequirement: (leaf: string, tag: string) => `${leaf} › tag "${tag}" in the code`,
		notAsked: 'Nothing in the spec asks for this.',
		carriesTag: (tag: string) => `The code carries the tag ${tag}.`,
		anchoredElsewhere: (other: string, name: string) => `Another feature, ${other}, anchors "${name}" in this file.`,
		disturbed: (unverified: boolean) =>
			`Its span is ${unverified ? 'unverified' : 'stale'} since the change touched the file.`
	},
	fr: {
		requirement: (leaf: string, owner: string, type: string, name: string) =>
			`${leaf} › ${owner} › ${type} ${quoteName('fr', name)}`,
		declares: (type: string, name: string, owner: string) =>
			`La spec déclare l'élément ${type} ${quoteName('fr', name)} pour ${quoteName('fr', owner)}.`,
		located: 'localisé',
		unverified: ` (non vérifié${NBSP}: la signature ne correspond plus)`,
		stale: ' (périmé)',
		unproven: " (aucun résultat réussi ne le prouve encore)",
		screenProvenState: ` (prouvé par son écran${NBSP}: chaque action de l'écran a réussi tous ses scénarios)`,
		touchProvenState: ` (prouvé par les actions qui le lisent ou l'écrivent${NBSP}: chacune a réussi tous ses scénarios)`,
		screenProvenCheck: ` (prouvé par son écran${NBSP}: le moteur le vérifie dans chaque scénario des actions de l'écran, et tous ont réussi)`,
		nothingLocated: "Rien n'a été localisé pour cet élément dans l'index synchronisé.",
		extraRequirement: (leaf: string, tag: string) => `${leaf} › balise ${quoteName('fr', tag)} dans le code`,
		notAsked: 'Rien dans la spec ne demande cela.',
		carriesTag: (tag: string) => `Le code porte la balise ${tag}.`,
		anchoredElsewhere: (other: string, name: string) =>
			`Une autre fonctionnalité, ${quoteName('fr', other)}, ancre ${quoteName('fr', name)} dans ce fichier.`,
		disturbed: (unverified: boolean) =>
			`Son emplacement ${unverified ? "n'est plus vérifié" : 'est périmé'} depuis que le changement a touché ce fichier.`
	}
} as const;

/** The line of code a located line's statement opens on, its standing taken off; empty when it holds none. */
export function recordedCodeLine(statement: string): string {
	const texts = Object.values(LINE_TEXTS);
	const standings = texts.flatMap((t) => [t.unverified, t.stale, t.unproven, t.screenProvenState, t.screenProvenCheck, t.touchProvenState]);
	const standing = standings.find((s) => statement.endsWith(s)) ?? '';
	const line = statement.slice(0, statement.length - standing.length).trim();
	return texts.some((t) => line === t.located || line === t.nothingLocated) ? '' : line;
}

/**
 * The touched features the baseline does not cover yet (ac-evo-impl-baseline):
 * all of them before the first freeze, then each feature a rebrief added. A
 * request baselined before the covered features were recorded reads its first
 * frozen version: the features it amended were photographed then.
 */
export function leavesOutsideBaseline(
	request: Pick<EvolutionRequest, 'leafIds' | 'baselineKeys' | 'baselineLeafIds' | 'frozenVersions'>
): string[] {
	const leaves = request.leafIds.filter((id) => !isDraftLeafId(id));
	if (!request.baselineKeys) return leaves;
	const first = [...(request.frozenVersions ?? [])].sort((a, b) => a.version - b.version)[0];
	const covered = new Set(
		request.baselineLeafIds ?? (first?.snapshot?.subjects ?? []).map((s) => s.baseLeafId).filter((id): id is string => id !== null)
	);
	return leaves.filter((id) => !covered.has(id));
}

/** The keys a baseline is taken of: every element the engine expects on these statuses. */
export function baselineKeysOf(
	statuses: readonly (FeatureStatus | null)[],
	specs: readonly (SpecElements | null)[] = []
): string[] {
	const keys = new Set<string>();
	// The spec first: what the features declared is inherited whether or not
	// any code was indexed at the first freeze (ac-evo-impl-baseline).
	for (const spec of specs) {
		for (const s of spec?.surfaces ?? []) keys.add(`surface:${s.id}`);
		for (const a of spec?.actions ?? []) keys.add(`action:${a.id}`);
		for (const key of spec?.elementKeys ?? []) keys.add(key);
	}
	for (const status of statuses) for (const c of status?.criteria ?? []) keys.add(`criterion:${c.criterionId}`);
	for (const status of statuses)
		for (const row of rowsOf(status))
			for (const entity of [
				...(row.expectedEntities ?? []),
				...(row.foundEntities ?? []),
				...(row.missingEntities ?? [])
			])
				keys.add(`${entity.entityType}:${entity.entityId}`);
	return [...keys].sort();
}

const rowsOf = (status: FeatureStatus | null): StatusRow[] => [
	...(status?.actions ?? []),
	...(status?.surfaces ?? [])
];

const ownerOf = (row: StatusRow): string =>
	row.actionName ?? row.surfaceName ?? row.actionId ?? row.surfaceId ?? '';

const firstLocation = (entity: StatusEntity | undefined): LocatedSpan | null =>
	entity?.locations?.find((l) => l.file.trim() !== '') ?? null;

/** Something is at the location, whether or not it still matches the signature. */
const located = (entity: StatusEntity | undefined): boolean => firstLocation(entity) !== null;

/** Proven only when a test is attached AND the located span still matches its signature. */
const proven = (entity: StatusEntity | undefined, testPassing: boolean): boolean => {
	const at = firstLocation(entity);
	return testPassing && at !== null && !at.unverified && !at.stale;
};

function line(
	request: ReportDerivationInput['request'],
	key: string,
	fields: Omit<
		ImplementationFinding,
		'id' | 'iteration' | 'specVersion' | 'decision' | 'decidedBy' | 'decidedAt'
	>
): ImplementationFinding {
	return {
		id: stableId('line', request.id, String(request.iteration), key),
		iteration: request.iteration,
		specVersion: request.specVersion,
		decision: 'undecided',
		decidedBy: null,
		decidedAt: null,
		...fields
	};
}

/**
 * One line per specified entity of the touched features (conform, non-conform
 * or missing), one per code tag the spec never asked for (out of scope), and one
 * per neighbouring entity whose located span went stale or unverified in a file
 * the change touches (regression).
 */
export function deriveImplementationReport(input: ReportDerivationInput): ImplementationFinding[] {
	const { request } = input;
	const say = LINE_TEXTS[input.lang ?? 'en'];
	const lines: ImplementationFinding[] = [];
	const touchedFiles = new Set<string>();

	for (const leafId of request.leafIds) {
		const leaf = input.leafNames[leafId] ?? leafId;
		const status = input.statuses[leafId] ?? null;
		const brought = input.brought?.[leafId] ?? null;
		const scopeOf = (key: string) =>
			(brought ? (brought.has(key) ? 'request' : 'inherited') : input.baseline?.has(key) ? 'inherited' : 'request') as 'inherited' | 'request';
		// The floor: every surface and action the spec declares that the index has
		// no row for is missing, so a feature nobody indexed yet is all to build.
		const rowed = new Set(rowsOf(status).flatMap((r) => [r.actionId ? `action:${r.actionId}` : '', r.surfaceId ? `surface:${r.surfaceId}` : '']));
		const spec = input.spec?.[leafId] ?? null;
		for (const element of [
			...(spec?.surfaces ?? []).map((s) => ({ key: `surface:${s.id}`, kind: 'screen', name: s.name, owner: s.name })),
			...(spec?.actions ?? []).map((a) => ({ key: `action:${a.id}`, kind: 'action', name: a.name, owner: a.surfaceName }))
		]) {
			if (rowed.has(element.key)) continue;
			lines.push(
				line(request, `${leafId}:${element.key}`, {
					verdict: 'missing',
					leafId,
					key: element.key,
					requirement: `${leaf} › ${element.kind} "${element.name}"`,
					filePath: '',
					lineRange: '',
					specStatement: `The spec declares the ${element.kind} "${element.name}" on ${element.owner || leaf}.`,
					codeStatement: 'Nothing was located for it: sync the implementation index from the checkout.',
					hasRequirementAnchor: true,
					anchorForeignLeaf: false,
					acceptanceTestPassing: false,
					scope: scopeOf(element.key)
				})
			);
		}
		// Every acceptance criterion, read off what last ran against it.
		for (const criterion of status?.criteria ?? []) {
			const key = `criterion:${criterion.criterionId}`;
			const passed = criterion.state === 'verified';
			lines.push(
				line(request, `${leafId}:${key}`, {
					verdict: passed ? 'conform' : criterion.state === 'failing' ? 'non_conform' : 'missing',
					leafId,
					key,
					requirement: `${leaf} › criterion "${criterion.title ?? criterion.criterionId}"`,
					filePath: '',
					lineRange: '',
					specStatement: criterion.title ?? criterion.criterionId,
					codeStatement: passed
						? 'The synced index reports a passing result; the platform did not run the test itself.'
						: criterion.state === 'failing'
							? 'Its last result failed.'
							: criterion.state === 'unverified'
								? 'It is indexed, but nothing has proved it yet.'
								: 'Nothing proves it yet.',
					hasRequirementAnchor: true,
					anchorForeignLeaf: false,
					acceptanceTestPassing: passed,
					scope: scopeOf(key)
				})
			);
		}
		// What a screen declares (its states, its rules, its always-true statements)
		// is proven by the screen: no scenario names it on its own, but the engine
		// runs the screen's rules and checks its always-true statements in every
		// scenario of its actions, and no sync ever stamps a screen row itself
		// (criterion:127dba2b).
		const verifiedActions = new Set(rowsOf(status).filter((r) => r.actionId && r.auditMeta?.verifiedAt).map((r) => r.actionId as string));
		const screenProven = (row: StatusRow): boolean => {
			if (row.actionId || !row.surfaceId) return false;
			const actions = new Set([
				...rowsOf(status).filter((r) => r.actionId && r.surfaceId === row.surfaceId).map((r) => r.actionId as string),
				...(spec?.actions ?? []).filter((a) => a.surfaceName === row.surfaceName).map((a) => a.id)
			]);
			return actions.size > 0 && [...actions].every((id) => verifiedActions.has(id));
		};
		for (const row of rowsOf(status)) {
			const owner = row.actionId ? `action:${row.actionId}` : row.surfaceId ? `surface:${row.surfaceId}` : undefined;
			const found = new Map((row.foundEntities ?? []).map((e) => [`${e.entityType}:${e.entityId}`, e]));
			for (const e of row.foundEntities ?? [])
				for (const l of e.locations ?? []) if (l.file) touchedFiles.add(l.file);
			const expected =
				row.expectedEntities && row.expectedEntities.length > 0
					? row.expectedEntities
					: [...(row.foundEntities ?? []), ...(row.missingEntities ?? [])];
			// A result, never a file name (ac-evo-impl-scenario-proof).
			const rowPassing = typeof row.auditMeta?.verifiedAt === 'string' && row.auditMeta.verifiedAt !== '';
			const screenPassing = screenProven(row);
			for (const entity of expected) {
				const key = `${entity.entityType}:${entity.entityId}`;
				const hit = found.get(key);
				// A state the screen's actions read or write is proven by those actions alone (criterion ad059df9).
				const touching = entity.entityType === 'state' ? (spec?.stateTouchedBy?.[entity.entityId] ?? []) : [];
				const touchPassing = touching.length > 0 && touching.every((id) => verifiedActions.has(id));
				const testPassing = rowPassing || (touching.length > 0 ? touchPassing : screenPassing);
				const at = firstLocation(hit);
				const name = entity.entityName ?? hit?.entityName ?? entity.entityId;
				const byScreen = rowPassing
					? ''
					: touching.length > 0
						? touchPassing
							? say.touchProvenState
							: ''
						: screenPassing
							? entity.entityType === 'state'
								? say.screenProvenState
								: say.screenProvenCheck
							: '';
				lines.push(
					line(request, `${leafId}:${key}`, {
						verdict: deriveVerdict({
							hasRequirementAnchor: true,
							anchorForeignLeaf: false,
							locatedInCode: located(hit),
							acceptanceTestPassing: proven(hit, testPassing)
						}),
						leafId,
						key,
						...(owner ? { owner } : {}),
						requirement: say.requirement(leaf, ownerOf(row), entity.entityType, name),
						filePath: at?.file ?? '',
						lineRange: at?.line !== undefined ? String(at.line) : '',
						specStatement: say.declares(entity.entityType, name, ownerOf(row) || leaf),
						codeStatement: at
							? `${at.snippet?.trim() || say.located}${
									at.unverified ? say.unverified : at.stale ? say.stale : proven(hit, testPassing) ? byScreen : say.unproven
								}`
							: say.nothingLocated,
						hasRequirementAnchor: true,
						anchorForeignLeaf: false,
						acceptanceTestPassing: proven(hit, testPassing),
						scope: scopeOf(key)
					})
				);
			}
			for (const extra of row.extraTags ?? []) {
				const at = extra.locations?.find((l) => l.file.trim() !== '') ?? null;
				lines.push(
					line(request, `${leafId}:extra:${extra.tag}`, {
						verdict: 'out_of_scope',
						leafId,
						key: `extra:${extra.tag}`,
						...(owner ? { owner } : {}),
						requirement: say.extraRequirement(leaf, extra.tag),
						filePath: at?.file ?? '',
						lineRange: at?.line !== undefined ? String(at.line) : '',
						specStatement: say.notAsked,
						codeStatement: at?.snippet?.trim() || say.carriesTag(extra.tag),
						hasRequirementAnchor: false,
						anchorForeignLeaf: false,
						acceptanceTestPassing: false
					})
				);
			}
		}
	}

	for (const [otherId, status] of Object.entries(input.neighbours)) {
		if (request.leafIds.includes(otherId)) continue;
		const other = input.leafNames[otherId] ?? otherId;
		for (const row of rowsOf(status)) {
			for (const entity of row.foundEntities ?? []) {
				const disturbed = (entity.locations ?? []).find(
					(l) => touchedFiles.has(l.file) && (l.unverified || l.stale)
				);
				if (!disturbed) continue;
				const name = entity.entityName ?? entity.entityId;
				lines.push(
					line(request, `${otherId}:${entity.entityType}:${entity.entityId}`, {
						verdict: 'regression',
						requirement: say.requirement(other, ownerOf(row), entity.entityType, name),
						filePath: disturbed.file,
						lineRange: disturbed.line !== undefined ? String(disturbed.line) : '',
						specStatement: say.anchoredElsewhere(other, name),
						codeStatement: say.disturbed(Boolean(disturbed.unverified)),
						hasRequirementAnchor: true,
						anchorForeignLeaf: true,
						acceptanceTestPassing: false
					})
				);
			}
		}
	}

	const order: Record<ImplementationFinding['verdict'], number> = {
		regression: 0,
		missing: 1,
		non_conform: 2,
		out_of_scope: 3,
		conform: 4
	};
	return oneLinePerElement(lines).sort((a, b) => order[a.verdict] - order[b.verdict] || a.requirement.localeCompare(b.requirement));
}

/**
 * One line per element (criterion:46dc1372). Two rows may carry the same
 * element, an event two actions emit: it is one requirement, proven once any of
 * them proves it. Two lines under one id were counted twice by the summary and
 * kept once by the dossier, which reads one line per id.
 */
function oneLinePerElement(lines: readonly ImplementationFinding[]): ImplementationFinding[] {
	const proof: Record<ImplementationFinding['verdict'], number> = { conform: 0, non_conform: 1, missing: 2, out_of_scope: 3, regression: 3 };
	const kept = new Map<string, ImplementationFinding>();
	for (const l of lines) {
		const before = kept.get(l.id);
		if (!before || proof[l.verdict] < proof[before.verdict]) kept.set(l.id, l);
	}
	return [...kept.values()];
}

/**
 * The request carrying a freshly derived report for its current iteration. Lines
 * of earlier iterations stay; the decisions already taken on a line that is still
 * derived survive the re-run (same id, same decision).
 */
export function withDerivedReport(
	request: EvolutionRequest,
	lines: readonly ImplementationFinding[],
	at: string
): EvolutionRequest {
	const previous = new Map(
		request.implementationFindings
			.filter((l) => l.iteration === request.iteration)
			.map((l) => [l.id, l])
	);
	const merged = lines.map((l) => {
		const before = previous.get(l.id);
		// A line sent back is judged again on the new build; every other decision stays.
		return before && before.decision !== 'undecided' && before.decision !== 'invalidated'
			? { ...l, decision: before.decision, decidedBy: before.decidedBy, decidedAt: before.decidedAt }
			: l;
	});
	const iterations: Iteration[] = request.iterations.some((i) => i.number === request.iteration)
		? request.iterations.map((i) =>
				i.number === request.iteration && i.reportStatus !== 'closed'
					? { ...i, reportStatus: 'ready' }
					: i
			)
		: [
				...request.iterations,
				{
					number: request.iteration,
					startedAt: at,
					brief: '',
					protectedLineIds: [],
					reportStatus: 'ready'
				}
			];
	return {
		...request,
		iterations,
		implementationFindings: [
			...request.implementationFindings.filter((l) => l.iteration !== request.iteration),
			...merged
		]
	};
}
