import { DATA_CHANGE_PREFIX, isDataChangeRequirement, recordedCodeLine, requirementParts, type ImplementationVerdict, type RequestStage } from '$domain/evolution';

export { requirementParts };

/**
 * The implementation report read the way the Evolution design reads it, on the
 * lines the platform derives from the implementation index after each sync:
 * five categories, each line numbered like the design (E for what the spec
 * asks, A for what the code added, R for what it broke), the opinion a person
 * gives on it, where that opinion puts the line, what goes back to the person's
 * LLM, and the brief that hands it the frozen version in the first place.
 * Pure: it only reads lines and the choices made on the page.
 */
export interface ReportLineLike {
	readonly id: string;
	readonly verdict: ImplementationVerdict;
	readonly decision: string;
	readonly requirement: string;
	readonly filePath: string | null;
	readonly lineRange: string | null;
	/** The touched feature the line was read on, when the derivation knows it. */
	readonly leafId?: string | null;
	readonly specStatement?: string | null;
	readonly codeStatement?: string | null;
	readonly scope?: string;
}

export type Decision = 'undecided' | 'validated' | 'invalidated' | 'adopted' | 'removed';
export type CategoryKey = 'compliant' | 'gap' | 'omission' | 'addition' | 'regression';

export interface Category {
	readonly key: CategoryKey;
	readonly verdict: ImplementationVerdict;
	/** The section title, then the sentence beside it. */
	readonly title: string;
	readonly description: string;
	/** The word of the badge on each of its lines. */
	readonly badge: string;
	/**
	 * Classes: the title and count, the badge, a card's border, the tile of the Issues board. The colours are the
	 * design's statuses (.ly-status): compliant green, a gap orange, an omission red-ink, an addition ink-2, a
	 * regression magenta.
	 */
	readonly text: string;
	readonly pill: string;
	readonly border: string;
	readonly tile: string;
}

/** The sections of the report, in the design's order. */
export const CATEGORIES: readonly Category[] = [
	{ key: 'compliant', verdict: 'conform', title: 'Compliant items', description: 'Implemented as the spec requires.', badge: 'COMPLIANT', text: 'text-green-ink', pill: 'border-green bg-green text-ink', border: 'border-line', tile: 'bg-green-tint' },
	{ key: 'gap', verdict: 'non_conform', title: 'Implementation gaps', description: 'Done, but not as the spec requires.', badge: 'IMPLEMENTATION GAP', text: 'text-orange-ink', pill: 'border-orange bg-orange text-ink', border: 'border-orange', tile: 'bg-orange-tint' },
	{ key: 'omission', verdict: 'missing', title: 'Omissions', description: 'Spec requirements not found in the code.', badge: 'OMISSION', text: 'text-red-ink', pill: 'border-red-ink bg-red-ink text-paper', border: 'border-red', tile: 'bg-red-tint' },
	// An addition is the design's "added" status: ink-2, never a hue.
	{ key: 'addition', verdict: 'out_of_scope', title: 'Unplanned additions', description: 'Code produced outside the spec’s scope: keep it or remove it.', badge: 'ADDITION', text: 'text-ink-3', pill: 'border-ink-2 bg-ink-2 text-paper', border: 'border-ink-3', tile: 'bg-toner-2' },
	// A regression is the design's magenta; its tile the magenta at a sixth, the palette naming no magenta tint.
	{ key: 'regression', verdict: 'regression', title: 'Regressions', description: 'What used to work and no longer does.', badge: 'REGRESSION', text: 'text-magenta-ink', pill: 'border-magenta bg-magenta text-ink', border: 'border-magenta', tile: 'bg-magenta/15' }
];
export const categoryOf = (verdict: ImplementationVerdict): Category => CATEGORIES.find((c) => c.verdict === verdict) ?? CATEGORIES[0];

/** A line this request answers for: what the touched features already held stays out of the report. */
export const ownLines = <L extends Pick<ReportLineLike, 'scope'>>(lines: readonly L[]): L[] => lines.filter((l) => l.scope !== 'inherited');

/**
 * The Verification has something to read: the version is frozen and the code
 * was read against it at least once, or a person decided one of its lines.
 */
export function codeReadOnce(stage: RequestStage, lines: readonly Pick<ReportLineLike, 'scope' | 'verdict' | 'decision'>[]): boolean {
	const frozen = stage === 'implementation' || stage === 'acceptance' || stage === 'delivered';
	const own = ownLines(lines);
	return frozen && own.length > 0 && (stage !== 'implementation' || own.some((l) => l.verdict !== 'missing' || l.decision !== 'undecided'));
}
/** A line the spec asks for (the design's E lines), as opposed to what the code added or broke. */
export const isRequirement = (l: Pick<ReportLineLike, 'verdict'>): boolean => l.verdict === 'conform' || l.verdict === 'non_conform' || l.verdict === 'missing';

/** Each line's label: E1, E2 for what the spec asks, A1 for an addition, R1 for a regression, in report order. */
export function lineLabels(lines: readonly Pick<ReportLineLike, 'id' | 'verdict'>[]): Map<string, string> {
	const seen: Record<string, number> = {};
	return new Map(
		lines.map((l) => {
			const letter = isRequirement(l) ? 'E' : l.verdict === 'out_of_scope' ? 'A' : 'R';
			seen[letter] = (seen[letter] ?? 0) + 1;
			return [l.id, `${letter}${seen[letter]}`];
		})
	);
}

/** The opinion a person gives on a line, as the design offers it per category. */
export type Choice = 'agree' | 'notproblem' | 'later' | 'modif' | 'keep' | 'remove' | 'investigate' | 'manual';
export const OPINIONS: Readonly<Record<CategoryKey, readonly { readonly choice: Choice; readonly label: string }[]>> = {
	compliant: [
		{ choice: 'agree', label: 'Validate' },
		{ choice: 'modif', label: 'I want to edit' }
	],
	gap: [
		{ choice: 'agree', label: 'Fix according to the spec' },
		{ choice: 'notproblem', label: 'Keep as is' },
		{ choice: 'modif', label: 'Adapt the spec to the code' }
	],
	omission: [
		{ choice: 'agree', label: 'Implement now' },
		{ choice: 'manual', label: 'Write the suggestion myself' },
		{ choice: 'later', label: 'Defer to a future evolution' },
		{ choice: 'modif', label: 'Remove from the spec' }
	],
	addition: [
		{ choice: 'keep', label: 'Keep and add it to the spec' },
		{ choice: 'remove', label: 'Remove from code' }
	],
	regression: [
		{ choice: 'agree', label: 'Restore the original behavior' },
		{ choice: 'investigate', label: 'Ask the LLM for an analysis' },
		{ choice: 'modif', label: 'Accept the new behavior' }
	]
};

/**
 * The decision a choice records on the line, or null for a choice that only
 * shapes the page: what goes into the fix prompt (an analysis, a suggestion),
 * or the change of spec the request is reopened for.
 */
export function decisionOf(category: CategoryKey, choice: Choice): Decision | null {
	switch (choice) {
		case 'agree':
			return category === 'compliant' ? 'validated' : 'invalidated';
		case 'notproblem':
		case 'later':
			return 'validated';
		case 'keep':
			return 'adopted';
		case 'remove':
			return 'removed';
		case 'modif':
			// Accepting a regression is a decision the line takes; changing the spec is the reopening of the request.
			return category === 'regression' ? 'validated' : null;
		default:
			return null;
	}
}

/**
 * The choice a recorded decision reads as. A gap, an omission or a regression
 * nobody decided waits for the code to change, the design's default; an
 * addition nobody decided waits for a person.
 */
export function choiceOf(line: Pick<ReportLineLike, 'verdict' | 'decision'>): Choice | null {
	const d = line.decision;
	switch (categoryOf(line.verdict).key) {
		case 'compliant':
			return d === 'invalidated' ? null : 'agree';
		case 'gap':
			return d === 'validated' ? 'notproblem' : d === 'undecided' || d === 'invalidated' ? 'agree' : null;
		case 'omission':
			return d === 'validated' ? 'later' : d === 'undecided' || d === 'invalidated' ? 'agree' : null;
		case 'addition':
			return d === 'adopted' || d === 'validated' ? 'keep' : d === 'removed' || d === 'invalidated' ? 'remove' : null;
		case 'regression':
			return d === 'validated' ? 'modif' : d === 'undecided' || d === 'invalidated' ? 'agree' : null;
	}
}

export type Tone = 'ok' | 'spec' | 'fix' | 'muted';
export const TONE_TEXT: Readonly<Record<Tone, string>> = { ok: 'text-green-ink', spec: 'text-orange-ink', fix: 'text-blue-ink', muted: 'text-ink-3' };

export interface LineReading {
	readonly category: Category;
	readonly choice: Choice | null;
	/** The section the line is listed in: settled lines join the compliant ones. */
	readonly section: CategoryKey;
	readonly tag: string;
	readonly tone: Tone;
	/** Compliant, or settled by a person. */
	readonly resolved: boolean;
	/** Goes into the fix prompt. */
	readonly inFix: boolean;
	/** An omission the person deferred to a future evolution (criterion 975debf9). */
	readonly deferred: boolean;
	/** Listed in the requested changes of the specification. */
	readonly specChange: boolean;
	/** What the LLM is asked to do, as the prompt says it; what the line says after the words that introduce it. */
	readonly fix: string;
	readonly said: string;
	readonly fixLabel: string;
}

export interface ReadContext {
	/** A choice made on the page that no decision records, when there is one. */
	readonly local?: Choice;
	/** Left out of the fix on purpose. */
	readonly excluded?: boolean;
	/** The person's own suggestion, for an omission they describe themselves. */
	readonly suggestion?: string;
	/** The change is live: what was kept is in the spec now. */
	readonly landed?: boolean;
	/** An adoption amended the spec and waits for the impact analysis to run again. */
	readonly rechallenge?: boolean;
	readonly specVersion: number;
}

/** Where a line stands once the person's opinion is read on it, in the design's words. */
export function readLine(line: ReportLineLike, ctx: ReadContext): LineReading {
	const category = categoryOf(line.verdict);
	const choice = ctx.local ?? choiceOf(line);
	const { title } = requirementParts(line.requirement);
	const spec = line.specStatement || line.requirement;
	const included = !ctx.excluded;
	const suggestion = (ctx.suggestion ?? '').trim();
	const base = { category, choice, specChange: false, resolved: false, inFix: false, deferred: false };
	const fixLabel =
		category.key === 'regression'
			? choice === 'investigate'
				? 'Analysis requested from the LLM:'
				: 'Restoration proposed to the LLM:'
			: category.key === 'omission'
				? choice === 'manual'
					? 'Your suggestion, sent to the LLM:'
					: 'To be implemented by the LLM:'
				: 'Fix proposed to the LLM:';
	const toFix = (fix: string, tag = 'In the correction', said = fix): LineReading => ({
		...base,
		section: category.key,
		tag: included ? tag : 'Out of fix scope',
		tone: included ? 'fix' : 'muted',
		inFix: included,
		fix,
		said,
		fixLabel
	});
	const quiet = { fix: '', said: '', fixLabel };
	const settled = (tag: string, section: CategoryKey = 'compliant'): LineReading => ({ ...base, ...quiet, section, tag, tone: 'ok', resolved: true });
	const codeFix = isDataChange(line.requirement)
		? tableFix(spec)
		: category.key === 'omission'
			? `Implement: ${spec}`
			: category.key === 'regression'
				? `Restore the original behavior: ${spec}`
				: `Make the code do what the spec says: ${spec}`;

	switch (choice) {
		case 'agree':
			return category.key === 'compliant' ? settled('Compliant') : toFix(codeFix, 'In the correction', spec);
		case 'notproblem':
			return settled('Gap accepted');
		case 'later':
			// A line on a table a person validated is confirmed in the code, not put off.
			if (isDataChange(line.requirement)) return settled('Confirmed by a person');
			// Settled for the report, yet still absent from the code: it stays an omission (criterion 975debf9).
			return { ...settled('Deferred to a future evolution', category.key), tone: 'muted', deferred: true };
		case 'modif':
			if (category.key === 'regression') return settled('Gap accepted');
			return category.key === 'compliant'
				? { ...base, ...quiet, section: 'compliant', tag: 'Requested change', tone: 'spec', resolved: true, specChange: true }
				: { ...base, ...quiet, section: category.key, tag: 'Spec change requested', tone: 'spec', specChange: true };
		case 'investigate':
			return toFix(`Analyze why ${title} has changed, without modifying the code, and propose two options.`, 'Analysis requested from the LLM');
		case 'manual': {
			const sent = included && suggestion !== '';
			return { ...base, section: category.key, tag: sent ? 'In the correction · your suggestion' : 'Suggestion to write', tone: sent ? 'fix' : 'muted', inFix: sent, fix: suggestion, said: suggestion, fixLabel };
		}
		case 'keep':
			return ctx.landed
				? settled(`Included in spec v${ctx.specVersion}`)
				: { ...base, ...quiet, section: 'addition', tag: 'To integrate into the spec', tone: 'spec', resolved: true, specChange: !!ctx.rechallenge };
		case 'remove': {
			const fix = `Remove from the code: ${line.codeStatement || title}`;
			return { ...base, section: 'addition', tag: 'Will be removed', tone: 'fix', inFix: true, fix, said: fix, fixLabel };
		}
		default:
			// A compliant line sent back is fixed like a gap; an addition nobody decided waits.
			return category.key === 'compliant' ? toFix(codeFix, 'In the correction', spec) : { ...base, ...quiet, section: category.key, tag: 'To decide', tone: 'muted' };
	}
}

/** Where the code of a line is, the way the design writes it: the file, then the line. */
export const whereOf = (l: Pick<ReportLineLike, 'filePath' | 'lineRange'>): string => (l.filePath ? `${l.filePath}${l.lineRange ? ` · l.${l.lineRange}` : ''}` : '');

/** The place in the code a line opens the evidence of (ac-src-code-place, criterion 2670dc31). */
export interface LineCodePlace {
	readonly featureId: string;
	readonly file: string;
	readonly line: number | null;
	/** What the page prints. */
	readonly place: string;
	/** The line of code the report read there; empty on a line that is no requirement, whose statement is not code. */
	readonly recorded: string;
}

/** Null for a line the code does not locate, or one read on no feature: the evidence is held per feature. */
export function codePlaceOf(l: Pick<ReportLineLike, 'verdict' | 'filePath' | 'lineRange' | 'leafId' | 'codeStatement'>): LineCodePlace | null {
	if (!l.filePath || !l.leafId) return null;
	const line = Number.parseInt(l.lineRange ?? '', 10);
	return { featureId: l.leafId, file: l.filePath, line: Number.isNaN(line) ? null : line, place: whereOf(l), recorded: isRequirement(l) ? recordedCodeLine(l.codeStatement ?? '') : '' };
}

/* ───────────────────────── Implementation: the continuous verification ───────────────────────── */

/**
 * Where a requirement stands at Build, read off the last reading of the code.
 * Nothing is "being checked": the report is rebuilt at each index sync, so a
 * line is tested, found but not tested yet, failing, not found yet, waiting for
 * a person, or ruled out by one. Every state says why and what closes it, so a
 * line that moves at the next sync never looks like it fixed itself.
 */
export type BuildState = 'tested' | 'found' | 'failing' | 'todo' | 'yours' | 'decided';

export interface BuildLine {
	readonly state: BuildState;
	/** The word of the pill, and its classes. */
	readonly word: string;
	readonly look: string;
	/** What the last reading of the code says about it. */
	readonly why: string;
	/** What closes it, for a line still open. */
	readonly next: string;
	/** Where the code is: the file, then the line. */
	readonly where: string;
	/** What the spec element is (Rule, State, Criterion...) and where it sits in its feature. */
	readonly kind: string;
	readonly place: string;
	readonly title: string;
	/** The feature it belongs to: its package in the list. */
	readonly feature: string;
}

const KIND_WORDS: Readonly<Record<string, string>> = {
	rule: 'Rule',
	state: 'State',
	criterion: 'Criterion',
	action: 'Action',
	screen: 'Screen',
	surface: 'Screen',
	invariant: 'Invariant',
	transition: 'Transition',
	event: 'Event',
	surface_rule: 'Screen rule',
	surface_invariant: 'Screen invariant'
};

/** The open states: what still moves the line, the code or a person. */
const OPEN: ReadonlySet<BuildState> = new Set(['found', 'failing', 'todo', 'yours']);
export const isOpenLine = (state: BuildState): boolean => OPEN.has(state);

const DATA_CHANGE = DATA_CHANGE_PREFIX;
const isDataChange = isDataChangeRequirement;

/**
 * What a rebrief asks of a line on a table (ac-evo-rebrief-data-line): no sync
 * can close it, so the AI makes the code hold the change only where it does not
 * yet, names the files that hold it, and leaves the line to the person.
 */
const tableFix = (spec: string): string =>
	`Make the code hold this table change if it does not yet, and name the files that hold it (migration, model): ${spec.trim().replace(/\.?$/, '.')} No index sync closes this line, since the index locates no table: the person validates it once the code holds it.`;

/** One requirement as the Build step reads it. */
export function buildLineOf(l: ReportLineLike): BuildLine {
	const data = isDataChange(l.requirement);
	const { title, path } = requirementParts(l.requirement);
	const segments = path.split(' › ').map((p) => p.trim()).filter((p) => p !== '');
	const type = segments.length > 1 ? segments[segments.length - 1] : '';
	const feature = data ? 'Data model' : (segments[0] ?? '');
	const kind = data ? 'Data change' : (KIND_WORDS[type] ?? (type ? type[0].toUpperCase() + type.slice(1) : ''));
	const place = segments.slice(1, -1).join(' › ');
	const code = l.codeStatement ?? '';
	const where = whereOf(l);
	const shown = { kind, place, feature, where, title: data ? l.requirement.slice(DATA_CHANGE.length).trim() : title };
	const state = (s: BuildState, word: string, look: string, why: string, next = '') => ({ ...shown, state: s, word, look, why, next });
	// A passing test run against the real code, never a formal proof: the word says so (owner, 2026-10-29).
	if (l.verdict === 'conform') return state('tested', '✓ Tested', 'border-green bg-green text-ink', where ? 'Found in the code, and its tests pass.' : 'Its test passes.');
	if (l.decision === 'validated')
		return state('decided', l.verdict === 'missing' ? 'Not built' : 'Kept as is', 'border-toner-2 bg-toner-2 text-ink-2', l.verdict === 'missing' ? 'A person ruled that it is not built in this version.' : 'A person accepted the code as it stands.');
	if (l.verdict === 'non_conform') {
		const sync = 'Closes once the index is synced after it.';
		if (code.includes('(unverified'))
			return state('found', 'Found · code moved', 'border-orange bg-orange-tint text-orange-ink', 'Found, but the code at that line no longer matches what was indexed.', `Point the index at the current code (check-index --fix). ${sync}`);
		if (code.includes('(stale)'))
			return state('found', 'Found · stale', 'border-orange bg-orange-tint text-orange-ink', 'Found, but the spec changed since that code was indexed.', `Check the code against the spec again. ${sync}`);
		if (code.startsWith('Its last result failed'))
			return state('failing', '✕ Test fails', 'border-red-ink bg-red-ink text-paper', 'Its last test result failed.', `Make the test pass. ${sync}`);
		if (type === 'state')
			return state('found', 'Found · not tested', 'border-orange bg-orange-tint text-orange-ink', 'Found in the code, but its screen is not fully tested yet.', `Every action of its screen has to pass all its scenarios. ${sync}`);
		return state('found', 'Found · not tested', 'border-orange bg-orange-tint text-orange-ink', 'Found in the code, but no test of it has passed yet.', `A test of its scenarios has to pass. ${sync}`);
	}
	if (data) return state('yours', 'Yours to validate', 'border-blue bg-transparent text-blue-ink', 'A table change is not located in the code: a person validates it.', 'Validate it in Verification once the code holds it.');
	if (type === 'criterion')
		return state('todo', 'No result yet', 'border-toner-2 bg-transparent text-ink-3', 'No test of it has passed yet.', 'A test named after it has to pass. Closes once the index is synced after it.');
	return state('todo', 'Not found yet', 'border-toner-2 bg-transparent text-ink-3', 'Nothing in the synced index points at it yet.', 'The code has to hold it and the index to name it. Closes once the index is synced.');
}

/** One feature of the change as a package of the build, the way a download manager lists one. */
export interface BuildPackage {
	readonly name: string;
	readonly lines: readonly { readonly line: ReportLineLike; readonly read: BuildLine }[];
	readonly total: number;
	/** Tested, or ruled out by a person. */
	readonly settled: number;
	readonly tested: number;
	readonly open: number;
	readonly done: boolean;
}

/**
 * The requirements as packages, one per feature: the package that misses the
 * most verification first, down to the finished ones last, each with its open
 * lines first, so what is furthest from done always sits at the top.
 */
export function buildPackages(lines: readonly ReportLineLike[]): BuildPackage[] {
	const groups = new Map<string, { line: ReportLineLike; read: BuildLine }[]>();
	for (const line of ownLines(lines).filter(isRequirement)) {
		const read = buildLineOf(line);
		const group = groups.get(read.feature) ?? [];
		group.push({ line, read });
		groups.set(read.feature, group);
	}
	const packages = [...groups].map(([name, rows]): BuildPackage => {
		const open = rows.filter((r) => isOpenLine(r.read.state)).length;
		return {
			name,
			lines: [...rows.filter((r) => isOpenLine(r.read.state)), ...rows.filter((r) => !isOpenLine(r.read.state))],
			total: rows.length,
			settled: rows.length - open,
			tested: rows.filter((r) => r.read.state === 'tested').length,
			open,
			done: open === 0
		};
	});
	// Most open lines first; on a tie, the smaller share settled; the report's order otherwise.
	return packages
		.map((p, i) => ({ p, i }))
		.sort((a, b) => b.p.open - a.p.open || a.p.settled / a.p.total - b.p.settled / b.p.total || a.i - b.i)
		.map(({ p }) => p);
}

export interface BuildProgress {
	readonly total: number;
	readonly tested: number;
	readonly found: number;
	readonly failing: number;
	readonly todo: number;
	readonly yours: number;
	readonly decided: number;
	/** What still moves: the code (found, failing, todo) or a person (yours). */
	readonly open: number;
	/** Every requirement tested or ruled out by a person. */
	readonly finished: boolean;
	/** Nothing is simply not found any more: what remains is tested, or decided in Verification. */
	readonly readAll: boolean;
	/** The share of the requirements tested or ruled out: what passing tests show the code satisfies, never what was merely read. */
	readonly percent: number;
	/** The files the verification reads. */
	readonly files: number;
}

export function buildProgress(lines: readonly ReportLineLike[]): BuildProgress {
	const own = ownLines(lines);
	const states = own.filter(isRequirement).map((l) => buildLineOf(l).state);
	const n = (s: BuildState) => states.filter((x) => x === s).length;
	const total = states.length;
	const open = states.filter(isOpenLine).length;
	return {
		total,
		tested: n('tested'),
		found: n('found'),
		failing: n('failing'),
		todo: n('todo'),
		yours: n('yours'),
		decided: n('decided'),
		open,
		finished: total > 0 && open === 0,
		readAll: total > 0 && n('todo') === 0,
		percent: total === 0 ? 0 : Math.floor(((n('tested') + n('decided')) * 100) / total),
		files: new Set(own.map((l) => l.filePath ?? '').filter((f) => f !== '')).size
	};
}

/**
 * What one MCP call of the person's AI says at Build, in the log's words
 * ("Your AI synced the index"); null for a call about another request. A
 * call on the project names the section its address named, an index sync
 * apart from a behaviour batch.
 */
export function aiCallWords(call: { readonly requestId: string; readonly act: 'read' | 'write'; readonly section?: string }, requestId: string): string | null {
	const write = call.act === 'write';
	if (call.requestId === requestId) return write ? 'wrote on the request' : 'read the request';
	if (call.requestId !== '') return null;
	switch (call.section) {
		case 'behavior.implementation':
			return write ? 'synced the index: Lyriks reads the code again' : 'read where the code stands';
		case 'behavior':
			return write ? 'wrote the behaviour' : 'read the spec';
		case undefined:
		case '':
			return write ? 'wrote to the project' : 'read the project';
		default:
			return write ? `wrote ${call.section}` : `read ${call.section}`;
	}
}

/** The files the verification reads, each with how many requirement lines point at it, the busiest first. */
export function buildFiles(lines: readonly ReportLineLike[]): { file: string; lines: number }[] {
	const counts = new Map<string, number>();
	for (const l of ownLines(lines)) if (l.filePath) counts.set(l.filePath, (counts.get(l.filePath) ?? 0) + 1);
	return [...counts].map(([file, n]) => ({ file, lines: n })).sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
}

export type BuildStatusKind = 'complete' | 'sent' | 'building' | 'working' | 'waiting_you' | 'waiting_code';

/**
 * What the Build step says is happening, from facts only: the report, the
 * build click of the person's AI when there is one, and the step their AI in
 * session announces it is on right now (`busy`, outside any click). It never
 * says an AI is at work when nothing is running.
 */
export function buildStatus(
	p: BuildProgress,
	ai: { readonly click: 'waiting' | 'taken' | null; readonly saying: string | null; readonly busy?: boolean },
	lastReadAt: string | null
): { kind: BuildStatusKind; word: string; text: string } {
	if (p.finished) return { kind: 'complete', word: '✓ Implementation complete', text: 'Every requirement is tested or ruled out. The verification is ready.' };
	if (ai.click === 'taken') return { kind: 'building', word: 'Lyriks is building', text: ai.saying ?? 'It says each step here, and every index sync updates the list.' };
	if (ai.busy && ai.saying) return { kind: 'working', word: 'Lyriks is working', text: ai.saying };
	if (ai.click === 'waiting') return { kind: 'sent', word: 'Sent to your AI', text: 'Lyriks takes the build once it is done with the click in hand.' };
	const last = lastReadAt ? ` Last reading at ${lastReadAt}.` : '';
	if (p.open === p.yours)
		return {
			kind: 'waiting_you',
			word: 'Waiting for you',
			text: `The code is tested. ${p.yours === 1 ? 'One line waits' : `${p.yours} lines wait`} for you: a table change the code index cannot locate, so a person confirms the code holds it.${last}`
		};
	return {
		kind: 'waiting_code',
		word: 'Waiting for the code',
		text: `${p.open - p.yours} ${p.open - p.yours === 1 ? 'point is' : 'points are'} not tested yet. Lyriks reads the code again at each index sync.${last}`
	};
}

/* ───────────────────────── The prompts handed to the person's LLM ───────────────────────── */

export interface Subject {
	readonly key: string;
	readonly title: string;
	readonly projectId: string;
	readonly projectName: string;
	readonly requestId: string;
	readonly specVersion: number;
	/** The branch the code is written on, when the project names a deployment branch (feat-evo-code-branch). */
	readonly branch?: { readonly name: string; readonly deploymentBranch: string; readonly bound: boolean } | null;
}

/** Where the code goes, said in a brief: on the request's own branch, committed before the tests run (ac-evo-branch-name). */
function branchLines(s: Subject): string[] {
	const b = s.branch;
	if (!b) return [];
	return [
		'',
		`Work on the branch ${b.name}${b.bound ? '' : `, created from ${b.deploymentBranch}: git switch -c ${b.name} ${b.deploymentBranch}`}. Never commit on ${b.deploymentBranch}: its merge, once the change is validated and approved, is what makes it live.`,
		'Commit the code before running the tests: a result taken on uncommitted code or on another commit proves nothing. Each index sync reports the branch and its last commit of code to Lyriks.'
	];
}

const MOST = 40;

/** The brief that hands the frozen version to the person's LLM: the decisions taken at the impact analysis, then every requirement. */
export function implementationBrief(s: Subject, lines: readonly ReportLineLike[], decisions: readonly { readonly label: string; readonly reason: string }[]): string {
	const asked = ownLines(lines).filter(isRequirement);
	const labels = lineLabels(ownLines(lines));
	return [
		`Implement evolution ${s.key} “${s.title}” (${s.projectName} project).`,
		`Reference spec: Lyriks › ${s.key} v${s.specVersion}, readable via the Lyriks MCP (project ${s.projectId}, request ${s.requestId.slice(0, 8)}).`,
		...branchLines(s),
		...(decisions.length > 0 ? ['', 'Validated decisions:', ...decisions.map((d) => `- ${d.label}: ${d.reason}`)] : []),
		'',
		`Requirements to cover (${asked.length}):`,
		...asked.slice(0, MOST).map((l) => `- ${labels.get(l.id)} ${l.requirement}`),
		...(asked.length > MOST ? [`- and ${asked.length - MOST} more, listed by get_evolution (part "report")`] : []),
		'',
		'Do not modify what the product does outside these requirements.',
		'When you’re done, run sync_implementation_index so Lyriks can verify.'
	].join('\n');
}

/**
 * The brief that hands the points still open at Build to the person's LLM:
 * each with its label on the page and what the last reading of the code says
 * about it, so the LLM starts from where the build stands, not from scratch.
 */
export function remainingBrief(s: Subject, lines: readonly ReportLineLike[]): string {
	const own = ownLines(lines);
	const labels = lineLabels(own);
	const open = own.filter(isRequirement).filter((l) => isOpenLine(buildLineOf(l).state) && buildLineOf(l).state !== 'yours');
	return [
		`Finish evolution ${s.key} “${s.title}” (${s.projectName} project): the points of spec v${s.specVersion} no passing test covers yet.`,
		`Reference spec: Lyriks › ${s.key} v${s.specVersion}, readable via the Lyriks MCP (project ${s.projectId}, request ${s.requestId.slice(0, 8)}).`,
		...branchLines(s),
		'',
		`Points still open (${open.length}), with what the last reading of the code says:`,
		...open.slice(0, MOST).map((l) => {
			const read = buildLineOf(l);
			return `- ${labels.get(l.id)} ${l.requirement}: ${read.why}${read.where ? ` (${read.where})` : ''}`;
		}),
		...(open.length > MOST ? [`- and ${open.length - MOST} more, listed by get_evolution (part "report", scope "request")`] : []),
		'',
		'Cover each one with a test named by its [criterion:…] or [unspa:…] token, record the results with ingest-results.mjs, then sync the index: Lyriks reads the code again at each sync.',
		'Do not modify what the product does outside these requirements.'
	].join('\n');
}

/** One correction the fix prompt carries. */
export interface Correction {
	readonly label: string;
	readonly fix: string;
	readonly where: string;
}

/** The fix prompt: the corrections kept, the person's own instruction, and what must not be touched. */
export function fixPrompt(s: Subject, corrections: readonly Correction[], compliant: readonly string[], instruction: string): string {
	return [
		`Fix the implementation of ${s.key} “${s.title}”.`,
		`Reference spec: Lyriks › ${s.key} v${s.specVersion} (readable via the Lyriks MCP: project ${s.projectId}, request ${s.requestId.slice(0, 8)}).`,
		'',
		...corrections.map((c, i) => `${i + 1}. [${c.label}] ${c.fix}${c.where ? `\n   → ${c.where}` : ''}`),
		...(instruction.trim() ? ['', `Instruction: ${instruction.trim()}`] : []),
		'',
		...(compliant.length > 0 ? [`Do not modify what is compliant: ${compliant.join(', ')}.`] : []),
		'When you’re done, run sync_implementation_index so Lyriks can re-verify.'
	].join('\n');
}
