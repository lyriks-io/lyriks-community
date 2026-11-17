import { EVOLUTION_STEPS, fieldKey, linesOf, personKey, SPEC_STEPS, STAGE_ORDER, type EvolutionStep, type RequestStage } from '$domain/evolution';
import type { DossierReading, ProposalRow, ReportPart } from '$lib/server/evolution-view.server';
import type { ActionReading } from '$lib/server/evolution-spec-actions.server';
import { withPendingAnswer } from './optimistic-answer';
import { withPendingVerdict, type PendingVerdict } from './optimistic-verdict';

/**
 * What an act on a request page changes, read on the page the moment it is
 * sent and before the server has answered (ac-evo-form-edit-optimistic). Each
 * patch is sent on the key of what it changes (`patchKey`), so a later act on
 * the same thing replaces it; `overlayDossier` and its siblings read the
 * request as the server is about to write it. With no patch, everything reads
 * as the server last said.
 */
export type Patch =
	/** An answer written: its new text, waiting for a validation. */
	| { readonly kind: 'text'; readonly value: string }
	/** A verdict on an answer, a step, an action or a path of the journey. */
	| { readonly kind: 'verdict'; readonly verdict: PendingVerdict }
	/** Who asked and where it comes from. */
	| { readonly kind: 'request'; readonly requester?: string; readonly origin?: string }
	/** A whole suggestion decided: it leaves. */
	| { readonly kind: 'decided' }
	/** One line of a list suggestion decided: it leaves the suggestion. */
	| { readonly kind: 'line-decided'; readonly proposalId: string; readonly line: string }
	/** A question asked of the request answered or set aside. */
	| { readonly kind: 'question'; readonly resolution: 'answered' | 'set_aside'; readonly text: string; readonly by: string; readonly at: string }
	/** A gate crossed: the stage reached, and the step the page opens on when the stage does not say it. */
	| { readonly kind: 'stage'; readonly stage: RequestStage; readonly step?: EvolutionStep }
	/** Cancelled, reopened or closed. */
	| { readonly kind: 'status'; readonly status: 'open' | 'cancelled' | 'closed'; readonly reason: string; readonly by: string; readonly at: string }
	/** The reader's AI validating in their name, or no longer. */
	| { readonly kind: 'delegation'; readonly on: boolean; readonly at: string }
	/** A touched feature taken out of the request. */
	| { readonly kind: 'out' }
	/** The decision taken on a line of the implementation report. */
	| { readonly kind: 'line'; readonly decision: string };

export type Patches = Readonly<Record<string, Patch>>;

/** The key each patch is sent on: one thing, one key. */
export const patchKey = {
	text: (path: string, leafId: string | null = null) => `t:${fieldKey(path, leafId)}`,
	verdict: (path: string, leafId: string | null = null) => `v:${fieldKey(path, leafId)}`,
	step: (step: string) => `s:${step}`,
	action: (key: string) => `a:${key}`,
	journeyPath: (key: string) => `j:${key}`,
	request: 'request',
	proposal: (id: string) => `p:${id}`,
	proposalLine: (id: string, line: string) => `pl:${id}:${line}`,
	question: (id: string) => `q:${id}`,
	stage: 'stage',
	status: 'status',
	delegation: (scope: 'request' | 'project') => `d:${scope}`,
	out: (leafId: string) => `o:${leafId}`,
	reportLine: (id: string) => `r:${id}`
} as const;

/** Who acts and how many validations each answer needs, for a verdict to read as the server will count it. */
export interface OverlayContext {
	readonly actor: string;
	readonly needed: number;
}

const ofKind = <K extends Patch['kind']>(patch: Patch | undefined, kind: K): Extract<Patch, { kind: K }> | null =>
	patch?.kind === kind ? (patch as Extract<Patch, { kind: K }>) : null;

/** An answer with the text and the verdict pending on it, the text first: a validation sent after an edit bears on the new text. */
function answerWith<A extends { readonly value: string; readonly trail?: unknown; readonly openQuestion?: boolean }>(row: A, key: string, patches: Patches, ctx: OverlayContext): A {
	const text = ofKind(patches[`t:${key}`], 'text');
	const verdict = ofKind(patches[`v:${key}`], 'verdict');
	const written = text ? withPendingAnswer(row as never, text.value) : row;
	return verdict ? withPendingVerdict(written as never, verdict.verdict, ctx.actor, ctx.needed) : written;
}

type StepValidation = NonNullable<DossierReading['path'][number]['validation']>;

/** A step validated as a whole, with the reader put behind it or taken out. */
function stepWith(validation: StepValidation, verdict: PendingVerdict, ctx: OverlayContext): StepValidation {
	if (verdict.act !== 'validate' && verdict.act !== 'withdraw') return validation;
	const same = (a: string) => personKey(a) === personKey(ctx.actor);
	const others = validation.given.filter((id) => !same(id));
	const given = verdict.act === 'validate' ? [...others, ctx.actor] : others;
	const waited = validation.expected.filter((id) => !validation.gone.includes(id));
	const validated = given.length > 0 && (waited.length > 0 ? waited.every((id) => given.some((g) => personKey(g) === personKey(id))) : given.length >= ctx.needed);
	return { ...validation, given, validated };
}

/** The step a stage opens the page on; the stages of specification open where the request still owes something. */
const STEP_AT: Partial<Record<RequestStage, EvolutionStep>> = {
	coherence: 'impact_analysis',
	implementation: 'build',
	acceptance: 'approval',
	delivered: 'deployment'
};
const nextStageOf = (stage: RequestStage): RequestStage | null => STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1] ?? null;
/** A step nobody validates (the Impact analysis, Build) is behind once the request crossed past its stage. */
const crossedPast = (step: EvolutionStep, stage: RequestStage) =>
	STAGE_ORDER.indexOf(EVOLUTION_STEPS.find((s) => s.code === step)?.stage ?? 'draft') < STAGE_ORDER.indexOf(stage);

/** The answers of a step of prose a text was written on before any was saved: read as written. */
function writtenStepAnswers(d: DossierReading, patches: Patches): DossierReading['stepAnswers'] {
	const held = new Set(d.stepAnswers.map((a) => `step.${a.step}.${a.key}`));
	const described = new Set(d.stepDescriptions.map((s) => `step.${s.step}.description`));
	const added = Object.entries(patches).flatMap(([key, patch]) => {
		const path = key.startsWith('t:step.') ? key.slice(2) : null;
		const m = path && !held.has(path) && !described.has(path) ? /^step\.([a-z_]+)\.([a-z_]+)$/.exec(path) : null;
		return m && patch.kind === 'text' ? [{ step: m[1], key: m[2], value: '' } as DossierReading['stepAnswers'][number]] : [];
	});
	return [...d.stepAnswers, ...added];
}

/**
 * The steps validated answer by answer (the Need, the Solution): validated
 * once every written answer they hold is, read again only when an act just
 * sent bears on one of their answers.
 */
const INPUT_STEPS: Readonly<Record<string, (key: string) => boolean>> = {
	need: (key) => key === patchKey.request || /^[tv]:(00-need\.|request\.)/.test(key),
	solution: (key) => /^[tv]:step\.solution\./.test(key)
};
function inputStepValidated(step: string, answers: readonly { readonly value: string; readonly filled?: boolean; readonly trail?: { readonly validation?: string } | null }[]): boolean {
	const written = answers.filter((a) => a.filled ?? a.value.trim() !== '');
	return written.length > 0 && written.every((a) => a.trail?.validation === 'validated');
}

/**
 * The step the page opens on while the request is specified, read again once
 * the acts just sent validate a step: the first step of specification still
 * owing something, as the server reads it, the Impact analysis once none does.
 */
function specifiedStep(path: DossierReading['path']): EvolutionStep {
	const open = path.find(
		(s) => (SPEC_STEPS as readonly string[]).includes(s.step) && s.progress !== 'not_applicable' && (s.progress !== 'done' || (s.validation !== null && !s.validation.validated))
	);
	return open?.step ?? 'impact_analysis';
}

/** The request as the acts just sent will leave it. */
export function overlayDossier(d: DossierReading, patches: Patches, ctx: OverlayContext): DossierReading {
	if (Object.keys(patches).length === 0) return d;
	const out = new Set(Object.keys(patches).filter((k) => k.startsWith('o:')).map((k) => k.slice(2)));
	const request = ofKind(patches[patchKey.request], 'request');
	const stage = ofKind(patches[patchKey.stage], 'stage');
	const status = ofKind(patches[patchKey.status], 'status');
	const delegated = (scope: 'request' | 'project') => ofKind(patches[patchKey.delegation(scope)], 'delegation');
	const requester = request?.requester ?? (d.requester === 'local-operator' ? '' : (d.requester ?? ''));
	const origin = request?.origin ?? d.origin ?? '';
	const step = stage ? (stage.step ?? STEP_AT[stage.stage]) : undefined;
	const entries = d.customQuestions.entries.map((q) => {
		const resolved = ofKind(patches[patchKey.question(q.id)], 'question');
		return resolved ? { ...q, status: resolved.resolution, resolution: resolved.text, resolvedBy: resolved.by, resolvedAt: resolved.at } : q;
	});
	const journeyPaths = Object.fromEntries(
		Object.entries(d.journeyPaths).map(([key, trail]) => {
			const verdict = ofKind(patches[patchKey.journeyPath(key)], 'verdict');
			return [key, verdict ? withPendingVerdict({ trail }, verdict.verdict, ctx.actor, ctx.needed).trail : trail];
		})
	) as DossierReading['journeyPaths'];
	// A change validated on the Specification on its synthetic field (3.4 data, 3.5 pages and rules) reads at once too (ac-evo-form-edit-optimistic).
	const pendingOn = <E extends { readonly key: string; readonly trail: NonNullable<DossierReading['data']['changes']>[number]['trail'] }>(e: E): E => {
		const verdict = ofKind(patches[patchKey.verdict(e.key)], 'verdict');
		return verdict ? { ...e, trail: withPendingVerdict({ trail: e.trail ?? undefined }, verdict.verdict, ctx.actor, ctx.needed).trail ?? null } : e;
	};
	const requestRows = d.originAnswers.map((a) => {
		const value = a.path.endsWith('requester') ? requester : origin;
		return answerWith(request ? withPendingAnswer(a, value) : a, fieldKey(a.path, null), patches, ctx);
	});
	const needFields = d.need.fields.map((f) => answerWith(f, fieldKey(f.path, null), patches, ctx));
	const stepDescriptions = d.stepDescriptions.map((s) => answerWith(s, `step.${s.step}.description`, patches, ctx));
	const stepAnswers = writtenStepAnswers(d, patches).map((a) => answerWith(a, `step.${a.step}.${a.key}`, patches, ctx));
	const answersOfStep: Readonly<Record<string, () => readonly { value: string; filled?: boolean; trail?: { validation?: string } | null }[]>> = {
		need: () => [...needFields, ...requestRows],
		solution: () => [...stepDescriptions.filter((s) => s.step === 'solution'), ...stepAnswers.filter((a) => a.step === 'solution')]
	};
	const touched = (step: string) => !!INPUT_STEPS[step] && Object.keys(patches).some(INPUT_STEPS[step]);
	const steps = d.path.map((s) => {
		const verdict = ofKind(patches[patchKey.step(s.step)], 'verdict');
		const validation =
			verdict && s.validation
				? stepWith(s.validation, verdict.verdict, ctx)
				: s.validation && touched(s.step)
					? { ...s.validation, validated: inputStepValidated(s.step, answersOfStep[s.step]()) }
					: s.validation;
		return validation === s.validation ? s : { ...s, validation };
	});
	// A validation read at once moves the request on to the step it now stands at, as the server will.
	const revalidated = steps.some((s, i) => s !== d.path[i]) && (d.stage === 'draft' || d.stage === 'specification');
	const opensOn = step ?? (revalidated ? specifiedStep(steps) : undefined);
	return {
		...d,
		...(request ? { requester: request.requester ?? d.requester, origin: (request.origin ?? d.origin) as DossierReading['origin'] } : {}),
		need: { ...d.need, fields: needFields },
		originAnswers: requestRows,
		stepDescriptions,
		stepAnswers,
		fields: d.fields.filter((f) => !f.leafId || !out.has(f.leafId)).map((f) => answerWith(f, fieldKey(f.path, f.leafId), patches, ctx)),
		leaves: d.leaves.filter((l) => !out.has(l.id)),
		leafIds: d.leafIds.filter((id) => !out.has(id)),
		journeyPaths,
		data: d.data.changes ? { ...d.data, changes: d.data.changes.map(pendingOn) } : d.data,
		sectionChanges: { ...d.sectionChanges, entries: d.sectionChanges.entries.map(pendingOn) },
		ruleChanges: { ...d.ruleChanges, entries: d.ruleChanges.entries.map(pendingOn) },
		...(d.findingChanges ? { findingChanges: { ...d.findingChanges, entries: d.findingChanges.entries.map(pendingOn) } } : {}),
		customQuestions: { ...d.customQuestions, entries, open: entries.filter((q) => q.status === 'open').length },
		path: steps.map((s) => ({
			...s,
			...(opensOn ? { current: s.step === opensOn } : {}),
			...(stage && s.validation === null && s.progress !== 'not_applicable' && crossedPast(s.step, stage.stage) ? { progress: 'done' as const } : {})
		})),
		...(stage
			? {
					stage: stage.stage,
					frozen: d.frozen || STAGE_ORDER.indexOf(stage.stage) >= STAGE_ORDER.indexOf('implementation'),
					gate: { ...d.gate, next: nextStageOf(stage.stage), ok: false, reason: null, detail: null }
				}
			: {}),
		...(status
			? {
					status: status.status,
					cancellation: status.status === 'cancelled' ? { reason: status.reason, by: status.by, at: status.at } : null
				}
			: {}),
		aiDelegation: {
			...d.aiDelegation,
			request: delegated('request')?.on ?? d.aiDelegation.request,
			project: delegated('project')?.on ?? d.aiDelegation.project,
			since: delegated('request')?.on || delegated('project')?.on ? (delegated('request')?.at ?? delegated('project')?.at ?? null) : d.aiDelegation.since
		}
	};
}

/** The suggestions still waiting once the decisions just sent are taken: a decided one leaves, a decided line leaves its suggestion. */
export function overlayProposals(rows: readonly ProposalRow[], patches: Patches): ProposalRow[] {
	const lines = Object.values(patches).filter((p): p is Extract<Patch, { kind: 'line-decided' }> => p.kind === 'line-decided');
	return rows.flatMap((row) => {
		if (patches[patchKey.proposal(row.id)]?.kind === 'decided') return [];
		const gone = lines.filter((l) => l.proposalId === row.id).map((l) => l.line);
		if (gone.length === 0) return [row];
		const keep = (list: readonly string[]) => list.filter((l) => !gone.includes(l));
		if ('delta' in row && row.delta) {
			const delta = { ...row.delta, added: keep(row.delta.added), removed: keep(row.delta.removed) };
			return delta.added.length + delta.removed.length === 0 ? [] : [{ ...row, delta }];
		}
		const value = keep(linesOf(row.value)).join('\n');
		return value === '' ? [] : [{ ...row, value }];
	});
}

type Report = NonNullable<ReportPart['report']>;

/** The report with the decisions just taken on its lines. */
export function overlayReport<R extends Report | null>(report: R, patches: Patches): R {
	if (!report) return report;
	const decided = (id: string) => ofKind(patches[patchKey.reportLine(id)], 'line');
	if (!report.lines.some((l) => decided(l.id))) return report;
	return { ...report, lines: report.lines.map((l) => (decided(l.id) ? { ...l, decision: decided(l.id)!.decision as typeof l.decision } : l)) };
}

/** The actions of the specification with the verdicts just given on them. */
export function overlayActions(readings: Readonly<Record<string, ActionReading>>, patches: Patches, ctx: OverlayContext): Record<string, ActionReading> {
	const keys = Object.keys(readings).filter((key) => ofKind(patches[patchKey.action(key)], 'verdict'));
	if (keys.length === 0) return readings as Record<string, ActionReading>;
	return {
		...readings,
		...Object.fromEntries(keys.map((key) => [key, withPendingVerdict(readings[key], ofKind(patches[patchKey.action(key)], 'verdict')!.verdict, ctx.actor, ctx.needed)]))
	};
}
