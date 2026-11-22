import type { LandingChoice } from './touched-validation';
import { draftChangeNodes, type GraphNodeLike } from './decision-figures';
import { NEED_KEYS, type NeedKey } from './blocks';
import { STEP_QUESTIONS, type DraftCriterion, type DraftLeafKind, type EvolutionRequest, type RequestNeed, type StepAnswers, type StepDescriptions } from './draft';
import type { DataDraft } from './data-drafts';
import { RULES_PAGE_NAME, type RuleDraft } from './rule-drafts';
import { FINDINGS_BLOCK_NAME, type FindingDraft } from './finding-drafts';
import { SPEC_PAGES, type SectionDraft } from './section-drafts';

/**
 * What a frozen version held, kept whole (ac-evo-freeze-5), and what changed
 * from one version to the next (ac-evo-freeze-diff).
 *
 * A version number with nothing behind it promised a readable version it could
 * not show: once the request was reopened its drafts moved on and version 1
 * existed nowhere. The freeze now keeps a copy of what it froze, and that copy
 * never changes afterwards.
 */

/** One subject of the request as a version froze it. */
export interface SnapshotSubject {
	readonly id: string;
	readonly kind: DraftLeafKind;
	readonly baseLeafId: string | null;
	readonly name: string;
	readonly description: string;
	readonly changeSummary: string;
	readonly objective: string;
	readonly problem: string;
	readonly expectedEffect: string;
	readonly value: string;
	readonly criteria: readonly DraftCriterion[];
	readonly retiredCriteria: readonly string[];
	readonly rewordedCriteria: readonly DraftCriterion[];
	/** What its behaviour model creates, changes and removes, element by element. */
	readonly elements: readonly GraphNodeLike[];
}

export interface VersionSnapshot {
	readonly need: RequestNeed;
	readonly steps: StepDescriptions;
	/** The answers the Functional spec gave (ac-evo-func-prose); absent on copies kept before they existed. */
	readonly answers?: StepAnswers;
	readonly subjects: readonly SnapshotSubject[];
	/** The data changes the version proposed (ac-evo-draft-data); absent on copies kept before they existed. */
	readonly data?: readonly SnapshotData[];
	/** The changes to the other pages of the spec (ac-evo-draft-section-version); absent on copies kept before they existed. */
	readonly sections?: readonly SnapshotSection[];
	/** The changes to the rules the whole product keeps (ac-evo-draft-section-version); absent on copies kept before they existed. */
	readonly rules?: readonly SnapshotRule[];
	/** The findings of Project health the version settles (ac-evo-draft-findings); absent on copies kept before they existed. */
	readonly findings?: readonly SnapshotFinding[];
	/** The elements set to Validate at the landing when it froze (EVO-003); absent on copies kept before they existed. */
	readonly landingChoices?: Readonly<Record<string, LandingChoice>>;
}

/** One section change as a version froze it. */
export type SnapshotSection = Pick<SectionDraft, 'id' | 'page' | 'summary' | 'edits'>;
/** One change to the rules as a version froze it. */
export type SnapshotRule = Pick<RuleDraft, 'id' | 'summary' | 'operations'>;
/** One finding a version settles, as it froze it. */
export type SnapshotFinding = Pick<FindingDraft, 'id' | 'findingId' | 'title' | 'featureRef' | 'blocking' | 'outcome' | 'reason'>;

const counting = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** A section change in one line a person reads: what it says, and how many edits carry it. */
export const describeSectionChange = (d: SnapshotSection): string => `${d.summary} (${counting(d.edits.length, 'edit')})`;
/** A change to the rules in one line a person reads. */
export const describeRuleChange = (d: SnapshotRule): string => `${d.summary} (${counting(d.operations.length, 'operation')})`;
/** A finding the request settles in one line a person reads: the finding, and what becomes of it. */
export const describeFindingLine = (d: SnapshotFinding): string =>
	`${d.title}: ${d.outcome === 'fixed' ? `fixed${d.reason ? ` (${d.reason})` : ''}` : d.outcome === 'kept' ? `kept as it is (${d.reason})` : 'outcome not chosen yet'}`;

/** One data change as a version froze it. */
export type SnapshotData = Pick<DataDraft, 'id' | 'kind' | 'entityId' | 'name' | 'description' | 'addFields' | 'changeFields' | 'removeFields'>;

/** A data change in one line a person reads: what it does to which table. */
export function describeDataChange(d: SnapshotData, tableName: (id: string) => string = (id) => id): string {
	const fields = (list: readonly { name: string; type: string }[]) => list.map((f) => `${f.name} (${f.type})`).join(', ');
	if (d.kind === 'add') return `Adds table "${d.name}"${d.addFields.length ? `: ${fields(d.addFields)}` : ''}`;
	const table = d.name || (d.entityId ? tableName(d.entityId) : 'a table');
	if (d.kind === 'remove') return `Removes table "${table}"`;
	const parts = [
		d.addFields.length ? `adds ${fields(d.addFields)}` : '',
		d.changeFields.length ? `changes ${d.changeFields.length} field${d.changeFields.length === 1 ? '' : 's'}` : '',
		d.removeFields.length ? `removes ${d.removeFields.length} field${d.removeFields.length === 1 ? '' : 's'}` : ''
	].filter(Boolean);
	return `Amends table "${table}"${parts.length ? `: ${parts.join('; ')}` : ''}`;
}

/** What the request holds right now, in the shape a freeze keeps. */
export function snapshotOf(
	request: Pick<EvolutionRequest, 'need' | 'stepDescriptions' | 'drafts'> & {
		readonly dataDrafts?: readonly DataDraft[];
		readonly stepAnswers?: StepAnswers;
		readonly sectionDrafts?: readonly SectionDraft[];
		readonly ruleDrafts?: readonly RuleDraft[];
		readonly findingDrafts?: readonly FindingDraft[];
		readonly landingChoices?: Readonly<Record<string, LandingChoice>>;
	}
): VersionSnapshot {
	return {
		...(request.landingChoices && Object.keys(request.landingChoices).length > 0 ? { landingChoices: { ...request.landingChoices } } : {}),
		// The other pages of the spec and the rules are part of what a version froze (ac-evo-draft-section-version).
		sections: (request.sectionDrafts ?? []).map((d) => ({ id: d.id, page: d.page, summary: d.summary, edits: d.edits.map((e) => ({ ...e })) })),
		rules: (request.ruleDrafts ?? []).map((d) => ({ id: d.id, summary: d.summary, operations: d.operations.map((o) => ({ ...o })) })),
		findings: (request.findingDrafts ?? []).map(({ id, findingId, title, featureRef, blocking, outcome, reason }) => ({ id, findingId, title, featureRef, blocking, outcome, reason })),
		...(request.stepAnswers
			? { answers: { solution: { ...request.stepAnswers.solution }, functional_spec: { ...request.stepAnswers.functional_spec }, technical_spec: { ...request.stepAnswers.technical_spec } } }
			: {}),
		data: (request.dataDrafts ?? []).map((d) => ({
			id: d.id,
			kind: d.kind,
			entityId: d.entityId,
			name: d.name,
			description: d.description,
			addFields: d.addFields.map((f) => ({ ...f })),
			changeFields: d.changeFields.map((c) => ({ ...c })),
			removeFields: [...d.removeFields]
		})),
		need: { ...request.need },
		steps: { ...request.stepDescriptions },
		subjects: request.drafts.map((d) => ({
			id: d.id,
			kind: d.kind,
			baseLeafId: d.baseLeafId,
			name: d.name,
			description: d.description,
			changeSummary: d.changeSummary ?? '',
			objective: d.objective,
			problem: d.problem,
			expectedEffect: d.expectedEffect,
			value: d.value,
			criteria: d.acceptanceCriteria.map((c) => ({ id: c.id, text: c.text })),
			retiredCriteria: [...(d.retireCriteria ?? [])],
			rewordedCriteria: (d.changeCriteria ?? []).map((c) => ({ id: c.id, text: c.text })),
			elements: draftChangeNodes([{ ...d, kind: 'amend' }])
		}))
	};
}

export type VersionChangeKind = 'need' | 'step' | 'subject' | 'subject_field' | 'criterion' | 'behaviour' | 'data' | 'section' | 'rule' | 'finding';

/** One difference between two versions, before and after side by side. */
export interface VersionChange {
	readonly kind: VersionChangeKind;
	/** Added to the version, removed from it, or reworded. */
	readonly status: 'added' | 'removed' | 'changed';
	/** What it is, in a few words. */
	readonly label: string;
	/** The subject it belongs to, when it belongs to one. */
	readonly where?: string;
	readonly before?: string;
	readonly after?: string;
}

const NEED_LABEL: Record<NeedKey, string> = {
	description: 'Description',
	situation: 'Current situation',
	symptoms: 'Observed symptoms',
	cost: 'What it costs',
	objectives: 'Objectives',
	measures: 'Measures'
};
const STEP_LABEL: Record<string, string> = { solution: 'Solution', functional_spec: 'Functional spec', technical_spec: 'Technical spec' };
const SUBJECT_FIELDS: readonly [keyof SnapshotSubject, string][] = [
	['name', 'Name'],
	['description', 'Description'],
	['changeSummary', 'What it changes'],
	['objective', 'Objective'],
	['problem', 'Problem'],
	['value', 'Value'],
	['expectedEffect', 'Measurable effect']
];
const ELEMENT_VERB: Record<string, string> = { added: 'creates', changed: 'changes', removed: 'removes' };

/** A text before and after: absent from one side reads as added or removed. */
function textChange(kind: VersionChangeKind, label: string, before: string, after: string, where?: string): VersionChange | null {
	const b = before.trim();
	const a = after.trim();
	if (b === a) return null;
	return {
		kind,
		status: b === '' ? 'added' : a === '' ? 'removed' : 'changed',
		label,
		...(where ? { where } : {}),
		...(b !== '' ? { before: b } : {}),
		...(a !== '' ? { after: a } : {})
	};
}

/** Resolves an existing feature's id to its name; the id itself when unknown. */
export type LeafNames = (leafId: string) => string;
const ownName: LeafNames = (id) => id;
const subjectName = (s: SnapshotSubject, names: LeafNames) => s.name || (s.baseLeafId ? names(s.baseLeafId) : '') || 'New feature';

/**
 * What changed from one version to the next, by kind: need answers and step
 * descriptions rewritten, subjects added or removed, their fields rewritten,
 * acceptance criteria added, removed or reworded, behaviour elements the
 * change now does or no longer does. Empty when both hold the same content.
 */
export function versionDiff(before: VersionSnapshot, after: VersionSnapshot, names: LeafNames = ownName): VersionChange[] {
	const out: VersionChange[] = [];
	const push = (c: VersionChange | null) => {
		if (c) out.push(c);
	};

	for (const key of NEED_KEYS) push(textChange('need', NEED_LABEL[key], before.need[key] ?? '', after.need[key] ?? ''));
	for (const step of Object.keys(STEP_LABEL)) {
		push(textChange('step', STEP_LABEL[step], before.steps[step as keyof StepDescriptions] ?? '', after.steps[step as keyof StepDescriptions] ?? ''));
	}
	for (const q of STEP_QUESTIONS) {
		push(textChange('step', `${STEP_LABEL[q.step]}: ${q.label.toLowerCase()}`, before.answers?.[q.step]?.[q.key] ?? '', after.answers?.[q.step]?.[q.key] ?? ''));
	}

	// Data changes: one row per table change added, removed or reworded (ac-evo-draft-data).
	const dataBefore = new Map((before.data ?? []).map((d) => [d.id, d]));
	const dataAfter = new Map((after.data ?? []).map((d) => [d.id, d]));
	for (const [id, d] of dataAfter) {
		const prev = dataBefore.get(id);
		if (!prev) out.push({ kind: 'data', status: 'added', label: 'Data change', after: describeDataChange(d, names) });
		else if (JSON.stringify(prev) !== JSON.stringify(d)) out.push({ kind: 'data', status: 'changed', label: 'Data change', before: describeDataChange(prev, names), after: describeDataChange(d, names) });
	}
	for (const [id, d] of dataBefore) if (!dataAfter.has(id)) out.push({ kind: 'data', status: 'removed', label: 'Data change', before: describeDataChange(d, names) });

	// The other pages of the spec and the rules, one row per change added, removed or rewritten (ac-evo-draft-section-version).
	const byId = <T extends { id: string }>(list: readonly T[] | undefined) => new Map((list ?? []).map((d) => [d.id, d]));
	const changesOf = <T extends { id: string }>(kind: 'section' | 'rule' | 'finding', was: readonly T[] | undefined, is: readonly T[] | undefined, label: (d: T) => string, say: (d: T) => string) => {
		const [b, a] = [byId(was), byId(is)];
		for (const [id, d] of a) {
			const prev = b.get(id);
			if (!prev) out.push({ kind, status: 'added', label: label(d), after: say(d) });
			else if (JSON.stringify(prev) !== JSON.stringify(d)) out.push({ kind, status: 'changed', label: label(d), before: say(prev), after: say(d) });
		}
		for (const [id, d] of b) if (!a.has(id)) out.push({ kind, status: 'removed', label: label(d), before: say(d) });
	};
	changesOf('section', before.sections, after.sections, (d) => `${SPEC_PAGES[d.page]?.name ?? d.page} change`, describeSectionChange);
	changesOf('rule', before.rules, after.rules, () => `${RULES_PAGE_NAME} change`, describeRuleChange);
	changesOf('finding', before.findings, after.findings, () => FINDINGS_BLOCK_NAME, describeFindingLine);

	const was = new Map(before.subjects.map((s) => [s.id, s]));
	const is = new Map(after.subjects.map((s) => [s.id, s]));
	for (const s of after.subjects) if (!was.has(s.id)) out.push({ kind: 'subject', status: 'added', label: subjectName(s, names), after: s.description || s.changeSummary || undefined });
	for (const s of before.subjects) if (!is.has(s.id)) out.push({ kind: 'subject', status: 'removed', label: subjectName(s, names), before: s.description || s.changeSummary || undefined });

	for (const s of after.subjects) {
		const prev = was.get(s.id);
		if (!prev) continue;
		const where = subjectName(s, names);
		for (const [field, label] of SUBJECT_FIELDS) push(textChange('subject_field', label, String(prev[field] ?? ''), String(s[field] ?? ''), where));

		const criteria = (list: readonly DraftCriterion[]) => new Map(list.map((c) => [c.id, c.text]));
		for (const [lists, verb] of [
			[[prev.criteria, s.criteria], 'Criterion'],
			[[prev.rewordedCriteria, s.rewordedCriteria], 'Rewording of an existing criterion']
		] as const) {
			const [b, a] = [criteria(lists[0]), criteria(lists[1])];
			// A criterion that lost its id but kept its text is the same criterion, never removed then added.
			const added = [...a].filter(([id]) => !b.has(id)).map(([, text]) => text);
			const removed = [...b].filter(([id]) => !a.has(id)).map(([, text]) => text);
			const unmatched = (list: string[], other: string[]) => {
				const pool = other.map((t) => t.trim());
				return list.filter((t) => {
					const i = pool.indexOf(t.trim());
					if (i === -1) return true;
					pool.splice(i, 1);
					return false;
				});
			};
			for (const [id, text] of a) {
				if (b.has(id) && b.get(id)!.trim() !== text.trim()) out.push({ kind: 'criterion', status: 'changed', label: verb, where, before: b.get(id), after: text });
			}
			for (const text of unmatched(added, removed)) out.push({ kind: 'criterion', status: 'added', label: verb, where, after: text });
			for (const text of unmatched(removed, added)) out.push({ kind: 'criterion', status: 'removed', label: verb, where, before: text });
		}
		const retiredBefore = new Set(prev.retiredCriteria);
		const retiredAfter = new Set(s.retiredCriteria);
		for (const id of retiredAfter) if (!retiredBefore.has(id)) out.push({ kind: 'criterion', status: 'added', label: 'Retires an existing criterion', where, after: id });
		for (const id of retiredBefore) if (!retiredAfter.has(id)) out.push({ kind: 'criterion', status: 'removed', label: 'No longer retires a criterion', where, before: id });

		// Behaviour compared as what the change does, element by element, counted.
		const tally = (list: readonly GraphNodeLike[]) => {
			const m = new Map<string, { node: GraphNodeLike; n: number }>();
			for (const node of list) {
				const key = `${node.status}|${node.kind}|${node.label}`;
				m.set(key, { node, n: (m.get(key)?.n ?? 0) + 1 });
			}
			return m;
		};
		const [b, a] = [tally(prev.elements), tally(s.elements)];
		for (const [key, { node, n }] of a) {
			for (let i = b.get(key)?.n ?? 0; i < n; i++) out.push({ kind: 'behaviour', status: 'added', label: `${ELEMENT_VERB[node.status] ?? node.status} ${node.kind}`, where, after: node.label });
		}
		for (const [key, { node, n }] of b) {
			for (let i = a.get(key)?.n ?? 0; i < n; i++) out.push({ kind: 'behaviour', status: 'removed', label: `${ELEMENT_VERB[node.status] ?? node.status} ${node.kind}`, where, before: node.label });
		}
	}
	return out;
}

/** One version as the page and the MCP read it: its copy, and what changed from the one before. */
export interface VersionReading {
	readonly version: number;
	readonly at: string;
	readonly by: string;
	/** Null for a version frozen before copies were kept. */
	readonly snapshot: VersionSnapshot | null;
	/** Null for the first version, or when either side has no copy. */
	readonly changes: readonly VersionChange[] | null;
}

/**
 * Every frozen version, newest first, each with what changed from the version
 * before; and, on a request reopened since its last freeze, what changed since
 * then that is not frozen yet.
 */
export function readVersions(
	request: Pick<EvolutionRequest, 'frozenVersions' | 'frozen' | 'need' | 'stepDescriptions' | 'drafts' | 'dataDrafts'> &
		Partial<Pick<EvolutionRequest, 'sectionDrafts' | 'ruleDrafts' | 'findingDrafts' | 'stepAnswers' | 'correction'>>,
	names: LeafNames = ownName
): { versions: VersionReading[]; sinceLast: VersionChange[] | null } {
	const versions = request.frozenVersions.map((v, i) => {
		const previous = i > 0 ? (request.frozenVersions[i - 1].snapshot ?? null) : null;
		const snapshot = v.snapshot ?? null;
		return {
			version: v.version,
			at: v.at,
			by: v.by,
			snapshot,
			changes: snapshot && previous ? versionDiff(previous, snapshot, names) : null
		};
	});
	const last = request.frozenVersions.at(-1);
	// A version in correction in the Build reads what it changed since the version still built (EVO-012).
	const moving = !request.frozen || (request.correction !== undefined && request.correction.of === last?.version);
	const sinceLast = moving && last?.snapshot ? versionDiff(last.snapshot, snapshotOf(request), names) : null;
	return { versions: versions.reverse(), sinceLast };
}
