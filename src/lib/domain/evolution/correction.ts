import type { ActContext, ActOutcome } from './acts';
import type { DraftLeaf, EvolutionRequest, ImplementationFinding } from './draft';
import { freeze } from './freeze';
import { canCrossToImplementation, canLeaveCoherence } from './gate';
import { ALLOW, firstRefusal, guard, refuse, type Guarded } from './guard';
import { record } from './history';
import { stableId } from './ids';
import { actionsUnreadGate, countsSpecificationActions, specificationGate, specificationLeft, type SpecificationHold } from './specification-hold';
import type { VersionSnapshot } from './versions';

/**
 * Correcting the frozen version in the Build (EVO-012).
 *
 * The build is where a wrong specification shows. What a request proposes (a
 * draft, its behaviour, its criteria, a data, page or rule change) stays
 * editable there: the first edit opens version N+1 "in correction" while the
 * code keeps being built against version N, and only the items the edit
 * changed ask for validation again. Once they stand validated, version N+1 is
 * frozen in the Build and the report is built again against it. The Need, the
 * Solution and the specs are not corrected here: the rebrief sends the request
 * back to Specify for that.
 */

/** The correction a request in Build carries: the version it corrects, and what that version's elements read. */
export interface SpecCorrection {
	/** The frozen version corrected: the code is still built against it until the next freeze. */
	readonly of: number;
	readonly openedAt: string;
	readonly openedBy: string;
	/**
	 * What each element of version N read, keyed like the implementation index
	 * (`<type>:<id>`), as a short print: the freeze compares version N+1 with it
	 * to tell the elements the correction moved from those it left alone. Absent
	 * when the engine did not answer when the correction opened.
	 */
	readonly prints?: Readonly<Record<string, string>>;
	/**
	 * What version N proposed, kept whole when the correction opened: the drafts
	 * the code is still built against, and the criteria typed on them. The brief
	 * and the tests of the frozen version read it until N+1 is frozen.
	 */
	readonly base?: CorrectionBase;
}

/** Version N's drafts and the criteria typed on each, as the correction found them. */
export interface CorrectionBase {
	readonly drafts: readonly DraftLeaf[];
	readonly criteria: Readonly<Record<string, readonly { readonly id: string; readonly text: string }[]>>;
}

/** A correction as stored, read at the edge; anything malformed reads as none. `parseDraft` reads the drafts version N kept. */
export function parseSpecCorrection(raw: unknown, parseDraft?: (raw: Record<string, unknown>, index: number) => DraftLeaf): { correction?: SpecCorrection } {
	if (!raw || typeof raw !== 'object') return {};
	const src = raw as Record<string, unknown>;
	if (typeof src.of !== 'number' || !Number.isInteger(src.of) || src.of < 1) return {};
	const prints =
		src.prints && typeof src.prints === 'object'
			? Object.fromEntries(Object.entries(src.prints as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
			: null;
	const base = parseDraft ? parseBase(src.base, parseDraft) : null;
	return {
		correction: {
			of: src.of,
			openedAt: typeof src.openedAt === 'string' ? src.openedAt : '',
			openedBy: typeof src.openedBy === 'string' ? src.openedBy : '',
			...(prints ? { prints } : {}),
			...(base ? { base } : {})
		}
	};
}

function parseBase(raw: unknown, parseDraft: (raw: Record<string, unknown>, index: number) => DraftLeaf): CorrectionBase | null {
	if (!raw || typeof raw !== 'object') return null;
	const src = raw as Record<string, unknown>;
	const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);
	const criteria = src.criteria && typeof src.criteria === 'object' ? (src.criteria as Record<string, unknown>) : {};
	return {
		drafts: records(src.drafts).map((draft, index) => parseDraft(draft, index)),
		criteria: Object.fromEntries(
			Object.entries(criteria).map(([id, list]) => [
				id,
				records(list)
					.filter((c) => typeof c.id === 'string' && typeof c.text === 'string')
					.map((c) => ({ id: c.id as string, text: c.text as string }))
			])
		)
	};
}

type Standing = Pick<EvolutionRequest, 'frozen' | 'stage' | 'specVersion'> & { readonly correction?: SpecCorrection };

/** Version N+1 is in correction: the request stands in Build, frozen as N, and a change to what it proposes opened N+1. */
export const inCorrection = (request: Standing): boolean =>
	!!request.correction && request.frozen && request.stage === 'implementation' && request.correction.of === request.specVersion;

/** The Specification's actions are read with the engine's graph before the freeze, and again for a version in correction (EVO-012). */
export const readsSpecificationActions = (request: Standing): boolean => countsSpecificationActions(request.stage) || inCorrection(request);

/**
 * The request as the version still built reads it (criterion 3baf05de): while
 * N+1 is in correction, the drafts of version N, so the brief and the tests of
 * the frozen version never hand out drafts nobody validated. As it stands otherwise.
 */
export function asBuilt(request: EvolutionRequest): EvolutionRequest {
	return inCorrection(request) && request.correction?.base ? { ...request, drafts: [...request.correction.base.drafts] } : request;
}

/** The criteria typed on a draft as the version still built reads them. */
export function builtCriteria(
	request: EvolutionRequest,
	draftId: string,
	typed: readonly { readonly id: string; readonly text: string }[]
): readonly { readonly id: string; readonly text: string }[] {
	return inCorrection(request) && request.correction?.base ? (request.correction.base.criteria[draftId] ?? []) : typed;
}

/**
 * While version N+1 is in correction the request does not move into Approval,
 * neither on its own nor by hand, and no waiver crosses it (criterion 2b084172):
 * Approval would carry drafts nobody validated behind the version that was built.
 */
export function correctionHoldsApproval(request: Standing): Guarded {
	const next = correctedVersion(request);
	return guard(
		inCorrection(request),
		`Version ${next} is in correction and waits for its validation: the request moves into Approval once it is frozen.`,
		`Validate what the correction changed; version ${next} is frozen by a person, then the Build goes on against it.`
	);
}

/** The version a correction opens. */
export const correctedVersion = (request: Pick<EvolutionRequest, 'specVersion'>): number => request.specVersion + 1;

/** The correction as a reader reads it (criterion d9a4be34): the version it opens, the one the code is still built against, since when and by whom; null when none is open. */
export function correctionReading(request: Standing): { version: number; builtAgainst: number; openedAt: string; openedBy: string } | null {
	if (!inCorrection(request) || !request.correction) return null;
	return { version: correctedVersion(request), builtAgainst: request.specVersion, openedAt: request.correction.openedAt, openedBy: request.correction.openedBy };
}

const LATER_STAGES: Readonly<Record<string, string>> = { acceptance: 'Approval', delivered: 'Deployment' };

/**
 * What a request proposes is written until the end of its Build, and from
 * Approval on a new request carries a change to it (criteria f1b07892, 02387d5f).
 * A frozen request at any other stage is a state the run never makes; it keeps
 * the refusal it always had.
 */
export function draftsOpen(request: Pick<EvolutionRequest, 'frozen' | 'stage' | 'specVersion'>): Guarded {
	if (!request.frozen || request.stage === 'implementation') return ALLOW;
	const later = LATER_STAGES[request.stage];
	if (later)
		return guard(
			true,
			`This request stands in ${later}: what it proposes is no longer corrected. Open a new request to change it.`,
			'What was approved, or is being approved, is the version that was built; a change to it is carried by a new request (open_request).'
		);
	return guard(
		true,
		`The specification is frozen as version ${request.specVersion}. Rebrief the request before changing what it proposes.`,
		'What a frozen version proposes is part of what was frozen; the code is being written against it.'
	);
}

/**
 * The Need, the Solution and the specs are not corrected in the Build: the
 * rebrief (Reopen the spec for revision vN+1) sends the request back to Specify
 * to rewrite them (criterion ac1e6bb8).
 */
export function textsOpen(request: Pick<EvolutionRequest, 'frozen' | 'specVersion'>): Guarded {
	return guard(
		request.frozen,
		`The specification is frozen as version ${request.specVersion}: the Need, the Solution and the specs are not corrected in the Build. Reopen the spec for revision v${request.specVersion + 1} to rewrite them.`,
		'A correction in the Build changes what the request proposes: a draft, its behaviour or its criteria, a data, page or rule change. Rewriting the Need, the Solution or the specs sends the request back to Specify.'
	);
}

/** What a request proposes, as one comparable print: its drafts, the values typed on them, its data, page, rule and finding changes. */
export function proposalPrint(
	request: Pick<EvolutionRequest, 'drafts' | 'dataDrafts' | 'sectionDrafts' | 'ruleDrafts' | 'findingDrafts'>,
	leafMeta: Readonly<Record<string, unknown>> | undefined
): string {
	const typed = request.drafts.map((d) => leafMeta?.[d.id] ?? null);
	return JSON.stringify([request.drafts, request.dataDrafts, request.sectionDrafts ?? [], request.ruleDrafts ?? [], request.findingDrafts ?? [], typed]);
}

const TEXTS = {
	en: {
		opened: (next: number, built: number) => `Version ${next} in correction: what the request proposes changed in the Build; the code is still built against version ${built}`,
		corrected: (version: number) => `Specification corrected as version ${version}`
	},
	fr: {
		opened: (next: number, built: number) => `Version ${next} en correction : ce que la demande propose a changé pendant la construction ; le code se construit toujours sur la version ${built}`,
		corrected: (version: number) => `Spécification corrigée en version ${version}`
	}
} as const;
const said = (ctx: Pick<ActContext, 'lang'>) => TEXTS[ctx.lang ?? 'en'];

/**
 * The first change to what a request in Build proposes opens version N+1 in
 * correction (criterion d9a4be34): the request stays in Build, frozen as N, and
 * the history says so. `changed` says the act moved what the request proposes;
 * `prints` are what version N's elements read, kept to compare at the freeze.
 */
export function openCorrection(
	ctx: Pick<ActContext, 'actor' | 'at' | 'newId' | 'lang'>,
	before: EvolutionRequest,
	outcome: ActOutcome,
	changed: boolean,
	prints: Readonly<Record<string, string>> | null,
	base: CorrectionBase | null = null
): ActOutcome {
	if (!outcome.ok || !changed) return outcome;
	const after = outcome.request;
	const building = (r: EvolutionRequest) => r.frozen && r.stage === 'implementation';
	if (after.id !== before.id || !building(before) || !building(after) || inCorrection(after)) return outcome;
	if (ctx.actor.role === 'viewer') return refuse('A viewer reads and comments, but does not correct a version.', 'Correcting the frozen version is a write on what the request proposes.');
	const next = correctedVersion(after);
	const opened = record(
		{ ...after, correction: { of: after.specVersion, openedAt: ctx.at, openedBy: ctx.actor.id, ...(prints ? { prints: { ...prints } } : {}), ...(base ? { base } : {}) } },
		{ id: ctx.newId(), type: 'spec_amended', summary: said(ctx).opened(next, after.specVersion), actor: ctx.actor, at: ctx.at }
	);
	return {
		ok: true,
		request: opened,
		summary: `${outcome.summary}. Version ${next} in correction: the code is still built against version ${after.specVersion}, and only what changed asks for validation again`
	};
}

/** What holds the freeze of version N+1, read by the caller (the engine's graph, the readings, the models). */
export interface CorrectionReadings {
	readonly specification: SpecificationHold;
	readonly criticalEmptyCount: number;
	/** The impact and the coherence ran before the last change to the drafts. */
	readonly readingsBehind: boolean;
	/** The drafts whose behaviour model no longer applies, said. */
	readonly staleModels: readonly string[];
}

/**
 * Version N+1 is frozen in the Build once every item the correction changed
 * stands validated and nothing else holds the gate (criterion c3376a9e): the
 * gate of the crossing out of the Impact analysis, read on the request in
 * Build. Never while the engine could not read the actions (the Functional
 * spec's failures), nor on readings older than the correction.
 */
export function correctionFreezeGate(request: EvolutionRequest, readings: CorrectionReadings): Guarded {
	const next = correctedVersion(request);
	return firstRefusal(
		guard(request.status === 'cancelled', 'This request is cancelled: reopen it first.', 'A cancelled request keeps its stage and its version until it is reopened.'),
		guard(request.status === 'closed', 'This request is closed.', 'A closed request has finished its run.'),
		guard(request.status === 'deleted', 'This request is deleted.', 'A deleted dossier is out of the run; nothing moves it.'),
		guard(!inCorrection(request), 'No corrected version waits on this request.', 'A version is corrected in the Build, by a change to what the request proposes.'),
		actionsUnreadGate(readings.specification),
		guard(
			readings.readingsBehind,
			`The impact and the coherence of version ${next} are not read yet.`,
			'They are read again on their own after each change; version N+1 is frozen once they answered.'
		),
		guard(
			readings.staleModels.length > 0,
			`A drafted behaviour no longer applies: ${readings.staleModels.join('; ')}.`,
			'Rework the model with apply_behavior_batch on the draft id; version N+1 is frozen once it applies.'
		),
		canCrossToImplementation(request, readings.criticalEmptyCount),
		canLeaveCoherence(request),
		specificationGate(readings.specification)
	);
}

/** What the coach says of a correction in the Build, and what waits on a person; null when none is open. */
export function correctionNext(request: EvolutionRequest, specification: SpecificationHold | undefined): { say: string; decides: string[] } | null {
	if (!inCorrection(request)) return null;
	const next = correctedVersion(request);
	const left = specification ? specificationLeft(specification) : 0;
	const say = `Version ${next} is in correction: the code is still built against version ${request.specVersion}, and version ${next} is frozen in the Build once what the correction changed stands validated.`;
	if (specification?.unread) return { say: `${say} ${specification.unread} Nothing is frozen until they can be read.`, decides: [] };
	return {
		say,
		decides:
			left > 0
				? [
						`Validate what the correction changed (validate_field on each item get_evolution part "specification" lists as waiting): ${left} of ${specification?.total} left. A person's last validation freezes version ${next}; an AI's never does.`
					]
				: [`Freeze version ${next} (cross_stage): a person's act, never an AI's, once what the correction changed stands validated.`]
	};
}

/**
 * The report while version N+1 is in correction (criterion 6103617d): the
 * report of version N stands as built, and the answer says a corrected version
 * waits for its validation. It is built again against N+1 once that is frozen.
 */
export function reportHeldInCorrectionAct(request: EvolutionRequest): ActOutcome {
	const next = correctedVersion(request);
	return {
		ok: true,
		request,
		summary: `Version ${next} is in correction and waits for its validation: the report reads version ${request.specVersion} until version ${next} is frozen, then it is built again against it.`
	};
}

/** One element's content as a short print, compared between two versions. */
const printOf = (value: unknown): string => stableId('p', JSON.stringify(value ?? null));

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x): x is Row => !!x && typeof x === 'object') : []);
const idOf = (row: Row): string => (typeof row.id === 'string' ? row.id : '');

/**
 * What each element a draft brings reads, keyed like the implementation index
 * (`<type>:<id>`): the feature its behaviour model makes, and its criteria.
 * An action reads with its rules, as its validation does (spec-actions.ts).
 */
export function elementPrints(
	feature: Readonly<Record<string, unknown>> | null,
	criteria: readonly { readonly id: string; readonly text: string }[]
): Record<string, string> {
	const out: Record<string, string> = {};
	const put = (key: string, value: unknown) => {
		if (!key.endsWith(':')) out[key] = printOf(value);
	};
	for (const surface of rows(feature?.surfaces)) {
		const { actions, ...own } = surface;
		put(`surface:${idOf(surface)}`, own);
		for (const state of rows(surface.stateDefinitions)) if (typeof state.path === 'string') put(`state:${state.path}`, state);
		for (const inv of rows(surface.invariants)) put(`surface_invariant:${idOf(inv)}`, inv);
		for (const rule of rows(surface.rules)) put(`surface_rule:${idOf(rule)}`, rule);
		for (const action of rows(actions)) {
			put(`action:${idOf(action)}`, action);
			for (const rule of rows(action.rules)) put(`rule:${idOf(rule)}`, rule);
			for (const inv of rows(action.invariants)) put(`invariant:${idOf(inv)}`, inv);
			for (const t of rows(action.transitions)) put(`transition:${idOf(t)}`, t);
		}
	}
	for (const c of criteria) {
		put(`criterion:ac-leaf-${c.id}`, c.text);
		put(`criterion:${c.id}`, c.text);
	}
	return out;
}

/** The keys whose element reads otherwise in `after` than in `before`, those present on one side only included. */
export function movedKeys(before: Readonly<Record<string, string>>, after: Readonly<Record<string, string>>): Set<string> {
	const moved = new Set<string>();
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) if (before[key] !== after[key]) moved.add(key);
	return moved;
}

/** The data changes a version reads otherwise than the one before: their lines are read again. */
function movedDataLines(before: VersionSnapshot | null, after: VersionSnapshot): Set<string> {
	const was = new Map((before?.data ?? []).map((d) => [d.id, JSON.stringify(d)]));
	return new Set((after.data ?? []).filter((d) => was.get(d.id) !== JSON.stringify(d)).map((d) => `data-line:${d.id}`));
}

/** What the freeze of a correction needs that only the engine reads: what version N+1's elements read, and the keys its drafts bring. */
export interface CorrectionElements {
	readonly prints: Readonly<Record<string, string>>;
	/** Every index key the drafts of version N+1 bring: an entry held on the request that names none of them is released. */
	readonly brought: ReadonlySet<string>;
}

/**
 * Version N+1 frozen in the Build (criteria c3376a9e, 48373b35): the next
 * version through the same freeze, the history saying it was corrected. The
 * lines of the report on elements the correction moved lose their decision, to
 * be read again from the code; every other line keeps its state and its
 * decision. An entry held on the request that names an element the correction
 * removed is released (the risk the Technical spec names). The report itself is
 * built again by the caller, as for any version newer than its lines.
 */
export function freezeCorrection(ctx: Pick<ActContext, 'actor' | 'at' | 'newId' | 'lang'>, request: EvolutionRequest, elements: CorrectionElements): EvolutionRequest {
	const before = request.frozenVersions.find((v) => v.version === request.specVersion)?.snapshot ?? null;
	const basePrints = request.correction?.prints ?? null;
	const { correction: _closed, ...rest } = request;
	const frozen = freeze(rest, ctx.actor, ctx.at);
	const after = frozen.frozenVersions[frozen.frozenVersions.length - 1].snapshot;
	// Without version N's prints (the engine was silent when the correction opened) every element reads moved: nothing is carried on a guess.
	const moved = basePrints ? movedKeys(basePrints, elements.prints) : null;
	const dataMoved = after ? movedDataLines(before, after) : new Set<string>();
	const reread = (line: ImplementationFinding): boolean =>
		dataMoved.has(line.id) || (line.scope !== 'inherited' && (moved === null || (line.key !== undefined && moved.has(line.key))));
	const lines = frozen.implementationFindings.map((line) =>
		line.iteration === frozen.iteration && reread(line) ? { ...line, decision: 'undecided' as const, decidedBy: null, decidedAt: null } : line
	);
	const held = Object.fromEntries(Object.entries(frozen.heldImplementation ?? {}).filter(([key]) => elements.brought.has(key)));
	return record(
		{ ...frozen, implementationFindings: lines, heldImplementation: held },
		{ id: ctx.newId(), type: 'spec_frozen', summary: said(ctx).corrected(frozen.specVersion), actor: ctx.actor, at: ctx.at }
	);
}
