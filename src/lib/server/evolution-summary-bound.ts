/**
 * The dossier an AI client reads in short, kept under the answer cap whatever
 * the request holds (ac-evo-llm-summary-bound). The page reads the full
 * summary; a tool answer is capped by the agent runtime, so every list that
 * grows with the request comes counted here, with a preview cut to a fixed
 * number of rows or characters, and names the part that reads it whole. A text
 * cut in the preview says so and gives its full length, so a client never takes
 * an excerpt for the answer. Pure: shaped from the summary, saving nothing.
 */

type Row = Record<string, unknown>;

/**
 * Characters the dossier in short may take. The MCP caps a tool answer at
 * 24 000 characters; the answer around the dossier (the fields a proposal may
 * target, the origins) and the links the MCP makes whole take the rest.
 */
export const SUMMARY_BUDGET = 18_000;

/** How much of each growing list and text a preview keeps. */
interface Limits {
	/** Characters of a text (an answer of the Need, a step's description or answer). */
	readonly text: number;
	/** Characters of a label (a change, a finding, a line of the impact). */
	readonly label: number;
	readonly rows: {
		readonly subjects: number;
		readonly changes: number;
		readonly findings: number;
		readonly points: number;
		readonly direct: number;
		readonly history: number;
		readonly dataDrafts: number;
		readonly journeys: number;
		readonly versions: number;
		readonly observations: number;
		readonly customQuestions: number;
		readonly cross: number;
		readonly used: number;
		readonly criticalEmpty: number;
	};
}

/**
 * The previews, from the roomiest to the barest: the first that fits the
 * budget is the one sent, so a request holding more than usual is read
 * shorter, never cut off by the cap.
 */
export const PREVIEW_LEVELS: readonly Limits[] = [
	{ text: 100, label: 80, rows: { subjects: 20, changes: 5, findings: 3, points: 3, direct: 3, history: 3, dataDrafts: 10, journeys: 5, versions: 5, observations: 5, customQuestions: 5, cross: 5, used: 10, criticalEmpty: 10 } },
	{ text: 50, label: 60, rows: { subjects: 10, changes: 3, findings: 2, points: 2, direct: 2, history: 2, dataDrafts: 5, journeys: 3, versions: 2, observations: 2, customQuestions: 3, cross: 2, used: 5, criticalEmpty: 5 } },
	{ text: 0, label: 40, rows: { subjects: 5, changes: 1, findings: 1, points: 1, direct: 1, history: 1, dataDrafts: 2, journeys: 1, versions: 1, observations: 1, customQuestions: 1, cross: 1, used: 2, criticalEmpty: 2 } }
];

/** The parts that read in full what the preview cuts. */
export const BOUND_PARTS = ['texts', 'coherence', 'points'] as const;
export type BoundPart = (typeof BOUND_PARTS)[number];

const read = (part: string) => `get_evolution part="${part}"`;
const list = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const obj = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});

/** A text cut to `max` characters, saying so with its full length. */
export function excerptOf(value: unknown, max: number): { value: unknown; length?: number; cut?: true } {
	const text = Array.isArray(value) ? value.join('\n') : value;
	if (typeof text !== 'string' || text.length <= max) return { value };
	return { value: max > 0 ? `${text.slice(0, max).trimEnd()}…` : '', length: text.length, cut: true };
}

/** A thread in short: the reader is told how much was said; the messages are one part away. */
function threadInShort(row: Row): Row {
	if (!row.thread) return row;
	const thread = obj(row.thread);
	return { ...row, thread: { id: thread.id, state: thread.state, messageCount: list(thread.messages).length } };
}

/** One text of the request in short: its value cut, its thread counted. */
function textInShort(row: Row, max: number): Row {
	const { value, length, cut } = excerptOf(row.value, max);
	return threadInShort({ ...row, value, ...(cut ? { length, cut } : {}) });
}

function countBy(rows: Row[], key: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const r of rows) {
		const k = String(r[key] ?? 'none');
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
}

/** A frozen version in short: its number, when and by whom; its copy is read with part "versions". */
const versionInShort = (v: Row): Row => Object.fromEntries(Object.entries(v).filter(([, value]) => value === null || typeof value !== 'object'));

/** The dossier in short under one level of preview. */
function shortened(s: Row, limits: Limits): Row {
	const { rows } = limits;
	const short = (v: unknown, max = limits.label) => excerptOf(v, max).value;
	const more = (all: Row[], keep: number, part: string) => (all.length > keep ? { read: read(part) } : {});
	const need = obj(s.need);
	const coherence = obj(s.coherence);
	const docking = obj(s.docking);
	const drafts = obj(s.drafts);
	const data = obj(s.data);
	const maturity = obj(s.maturity);
	const custom = obj(s.customQuestions);
	const impact = obj(s.impact);

	// What blocks first: a finding that holds the gate, then the request's own, then what the product already carried.
	const findings = [...list(coherence.findings)].sort(
		(a, b) => Number(b.holdsGate === true) - Number(a.holdsGate === true) || Number(a.scope === 'inherited') - Number(b.scope === 'inherited')
	);
	// A point that does not fit reads before the ones that do.
	const points = [...list(docking.points)].sort((a, b) => Number(a.qualification === 'fits') - Number(b.qualification === 'fits'));
	const changes = list(drafts.changes);
	const subjects = list(s.leaves);
	const direct = list(impact.direct);
	const history = list(s.history);
	const dataDrafts = list(data.drafts);
	const journeys = Object.entries(obj(s.journeyPaths));
	const versions = list(s.frozenVersions);
	const criticalEmpty = list(maturity.criticalEmptyFields);
	const customEntries = list(custom.entries);
	const observations = list(s.observations);
	const crossEvolutions = list(s.crossEvolutions);
	const used = list(s.used);

	return {
		...s,
		need: { ...need, fields: list(need.fields).map((f) => textInShort(f, limits.text)) },
		stepDescriptions: list(s.stepDescriptions).map((r) => textInShort(r, limits.text)),
		stepAnswers: list(s.stepAnswers).map((r) => textInShort(r, limits.text)),
		// Where the texts the previews cut are read whole, with their threads.
		texts: { read: read('texts') },
		customQuestions: { ...custom, entries: customEntries.slice(0, rows.customQuestions).map((q) => textInShort(q, limits.text)), total: customEntries.length },
		docking: {
			...docking,
			points: points.slice(0, rows.points).map((p) => ({ nodeId: p.nodeId, label: short(p.label), section: p.section, qualification: p.qualification })),
			...more(points, rows.points, 'points')
		},
		crossEvolutions: { shown: crossEvolutions.slice(0, rows.cross), total: crossEvolutions.length },
		journeyPaths: { total: journeys.length, validated: journeys.filter(([, t]) => obj(t).validation === 'validated').length, shown: Object.fromEntries(journeys.slice(0, rows.journeys)) },
		used: { shown: used.slice(0, rows.used), total: used.length },
		// The touched features by id and name; what each draft says and changes is read with part "drafts".
		leaves: subjects.slice(0, rows.subjects).map((l) => ({ id: l.id, name: l.name, change: l.change, ...(l.drafted ? { drafted: true } : {}), ...(l.draftId ? { draftId: l.draftId } : {}) })),
		leavesTotal: subjects.length,
		drafts: {
			...drafts,
			changes: changes.slice(0, rows.changes).map((c) => ({ ...c, label: short(c.label) })),
			changesTotal: changes.length,
			changesByStatus: countBy(changes, 'status'),
			read: read('drafts')
		},
		data: {
			drafts: dataDrafts.slice(0, rows.dataDrafts).map((d) => ({
				id: d.id,
				kind: d.kind,
				entityId: d.entityId,
				name: d.name,
				addFields: list(d.addFields).map((f) => f.name),
				changeFields: list(d.changeFields).length,
				removeFields: list(d.removeFields).length
			})),
			total: dataDrafts.length,
			read: read('data')
		},
		frozenVersions: { shown: versions.slice(-rows.versions).map(versionInShort), total: versions.length, read: read('versions') },
		maturity: { ...maturity, criticalEmptyFields: criticalEmpty.slice(0, rows.criticalEmpty), criticalEmptyTotal: criticalEmpty.length },
		coherence: {
			...coherence,
			findings: findings.slice(0, rows.findings).map((f) => ({ id: f.id, severity: f.severity, title: short(f.title), scope: f.scope, holdsGate: f.holdsGate })),
			findingsTotal: findings.length,
			findingsByScope: countBy(findings, 'scope'),
			...more(findings, rows.findings, 'coherence'),
			// Project health now and after in counts; which findings leave, stay and come is read whole with part "coherence" (ac-evo-coh-after).
			...(coherence.health ? { health: healthInShort(obj(coherence.health), rows.findings, short) } : {})
		},
		// The findings of Project health the request settles, counted by outcome; every line is read with part "coherence" (ac-evo-draft-findings).
		...(s.findingChanges ? { findingChanges: findingChangesInShort(obj(s.findingChanges), rows.changes, short) } : {}),
		impact: {
			...impact,
			plain: Array.isArray(impact.plain) ? impact.plain.map((line) => short(line, limits.label + 40)) : impact.plain,
			direct: direct.slice(0, rows.direct).map((f) => ({ id: f.id, section: f.section, label: short(f.label), depth: f.depth })),
			directTotal: direct.length,
			read: read('impact')
		},
		observations: { shown: observations.slice(0, rows.observations).map((o) => ({ ...o, body: short(o.body) })), total: observations.length },
		history: history.slice(0, rows.history),
		historyRead: read('history')
	};
}

/** Project health now and after in short: both headlines whole, each list counted with a preview. */
function healthInShort(health: Row, keep: number, short: (v: unknown) => unknown): Row {
	const preview = (rows: Row[]) => ({ total: rows.length, shown: rows.slice(0, keep).map((r) => short(r.title)) });
	return {
		now: health.now,
		after: health.after,
		undecided: health.undecided,
		leaving: preview(list(health.leaving)),
		expectedToLeave: preview(list(health.expectedToLeave)),
		coming: preview(list(health.coming)),
		read: read('coherence')
	};
}

/** The findings a request settles in short: counted by outcome and by validation, a few lines shown. */
function findingChangesInShort(changes: Row, keep: number, short: (v: unknown) => unknown): Row {
	const entries = list(changes.entries);
	return {
		total: changes.total,
		landed: changes.landed,
		undecided: changes.undecided,
		byOutcome: countBy(entries, 'outcome'),
		validated: entries.filter((e) => obj(e.trail).validation === 'validated').length,
		shown: entries.slice(0, keep).map((e) => ({ id: e.id, title: short(e.title), outcome: e.outcome })),
		read: read('coherence')
	};
}

/**
 * The dossier in short: the roomiest preview that fits SUMMARY_BUDGET, else the
 * barest one, which keeps every count and every link to the parts.
 */
export function boundSummary<S extends { readonly id: string }>(full: S): Row & { readonly id: string } {
	const s = full as unknown as Row;
	let answer: Row = s;
	for (const limits of PREVIEW_LEVELS) {
		answer = shortened(s, limits);
		if (JSON.stringify(answer).length <= SUMMARY_BUDGET) break;
	}
	return { ...answer, id: full.id };
}

export interface BoundPartOptions {
	readonly offset?: number;
	readonly limit?: number;
	/** coherence: the request's own findings, or what the product already carried. */
	readonly scope?: string;
}

/** A part that reads in full what the bounded summary cuts, paged like every list part. */
export function boundPart<S extends { readonly id: string }>(summary: S, part: BoundPart, opts: BoundPartOptions = {}): Row & { readonly id: string } {
	const full = summary as unknown as Row;
	const offset = Math.max(0, Math.floor(opts.offset ?? 0));
	const limit = Math.max(1, Math.floor(opts.limit ?? 150));
	const head = { id: summary.id, title: full.title, stage: full.stage, status: full.status };
	switch (part) {
		case 'texts': {
			// Every text written on the request, whole, with its trail and its thread.
			const rows: Row[] = [
				...list(obj(full.need).fields).map((f) => ({ ...f, step: 'need', key: f.path })),
				...list(full.stepDescriptions).map((d) => ({ ...d, key: `${d.step}.description` })),
				...list(full.stepAnswers).map((a) => ({ ...a, key: `${a.step}.${a.key}` })),
				...list(obj(full.customQuestions).entries).map((q) => ({ ...q, key: `question:${q.id}` }))
			];
			return { ...head, texts: { total: rows.length, offset, limit, entries: rows.slice(offset, offset + limit) } };
		}
		case 'coherence': {
			const coherence = obj(full.coherence);
			const findings = list(coherence.findings).filter((f) => !opts.scope || (f.scope ?? 'request') === opts.scope);
			return {
				...head,
				coherence: {
					overall: coherence.overall,
					delta: coherence.delta,
					blockingUndecided: coherence.blockingUndecided,
					scope: opts.scope ?? null,
					total: findings.length,
					offset,
					limit,
					findings: findings.slice(offset, offset + limit),
					// Project health now and after, whole (ac-evo-coh-after).
					...(coherence.health ? { health: coherence.health } : {})
				},
				// Every finding of Project health the request settles, paged with the same offset and limit (ac-evo-draft-findings).
				...(full.findingChanges
					? (() => {
							const settles = list(obj(full.findingChanges).entries);
							return { settles: { total: settles.length, offset, limit, entries: settles.slice(offset, offset + limit) } };
						})()
					: {})
			};
		}
		case 'points': {
			const docking = obj(full.docking);
			const points = list(docking.points);
			return { ...head, points: { counts: docking.counts, held: docking.total, total: points.length, offset, limit, entries: points.slice(offset, offset + limit) } };
		}
	}
}
