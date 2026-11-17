import { specVersionOf, type Baseline } from '../baselines';
import type { EvolutionRequest } from './draft';
import { REQUEST_KEY_PREFIX } from './request-ref';
import { complianceSentence, type RequirementCompliance } from './report-compliance';

/**
 * What a closed request leaves behind (the design's closing block): what it
 * changed in the specification, row by row, and the message a team posts on
 * the ticket the change came from.
 *
 * Every row is read off the request: the features its drafts add, change or
 * remove, the screens, actions and rules their behaviour operations write, and
 * the tables and fields its data changes declare. Nothing is counted that the
 * request does not carry: it holds no access changes, so no permission row is
 * ever listed.
 */

export type ChangeSign = '+' | '~' | '-';
export type ChangeKind = 'Feature' | 'Screen' | 'Action' | 'Rule' | 'Data';
/** What a row counts, for the one-line summary. */
export type ChangeNoun = 'feature' | 'screen' | 'action' | 'rule' | 'table' | 'field';

export interface ClosingChange {
	readonly sign: ChangeSign;
	readonly kind: ChangeKind;
	readonly label: string;
	readonly count: number;
	readonly noun: ChangeNoun;
}

/** How the specification names what a request points at by id. */
export interface ClosingNames {
	readonly featureName: (id: string) => string | null;
	readonly entityName: (id: string) => string | null;
	readonly fieldName: (id: string) => string | null;
}

const SIGN_OF: Readonly<Record<string, ChangeSign>> = { add: '+', update: '~', remove: '-' };
/** The behaviour operations a reader of the specification names; states, scenarios and effects stay inside them. */
const ELEMENT_OF: Readonly<Record<string, { readonly kind: ChangeKind; readonly noun: ChangeNoun }>> = {
	surface: { kind: 'Screen', noun: 'screen' },
	action: { kind: 'Action', noun: 'action' },
	rule: { kind: 'Rule', noun: 'rule' },
	action_rule: { kind: 'Rule', noun: 'rule' },
	surface_rule: { kind: 'Rule', noun: 'rule' }
};

/** The words an operation names its element by, the way the decision card reads them. */
function labelOf(op: Readonly<Record<string, unknown>>, fallback: string): string {
	const nested = (key: string) => (op[key] && typeof op[key] === 'object' ? (op[key] as Record<string, unknown>).description : undefined);
	return [op.name, op.text, op.title, nested('rule'), op.description, op.path, op.id].find((v): v is string => typeof v === 'string' && v.trim() !== '') ?? fallback;
}

function featureRows(request: Pick<EvolutionRequest, 'drafts'>, names: ClosingNames): ClosingChange[] {
	return request.drafts.map((d) => {
		const name = d.name || (d.baseLeafId ? (names.featureName(d.baseLeafId) ?? d.baseLeafId) : 'New feature');
		return { sign: d.kind === 'add' ? '+' : d.kind === 'amend' ? '~' : '-', kind: 'Feature', label: name, count: 1, noun: 'feature' };
	});
}

/** The screens, actions and rules the drafts' behaviour writes, each once, under the first thing done to it. */
function elementRows(request: Pick<EvolutionRequest, 'drafts'>): ClosingChange[] {
	const seen = new Map<string, ClosingChange>();
	for (const draft of request.drafts) {
		const ops = [...(draft.behaviourModel?.landed?.operations ?? []), ...(draft.behaviourModel?.operations ?? [])];
		for (const op of ops) {
			const match = /^(add|update|remove)_(.+)$/.exec(String(op.kind ?? op.op ?? ''));
			const element = match ? ELEMENT_OF[match[2]] : undefined;
			if (!match || !element) continue;
			const label = labelOf(op, element.kind);
			const key = `${element.kind}:${label}`;
			if (!seen.has(key)) seen.set(key, { sign: SIGN_OF[match[1]], kind: element.kind, label, count: 1, noun: element.noun });
		}
	}
	return [...seen.values()];
}

function dataRows(request: Pick<EvolutionRequest, 'dataDrafts'>, names: ClosingNames): ClosingChange[] {
	const rows: ClosingChange[] = [];
	for (const d of request.dataDrafts) {
		const table = d.name || (d.entityId ? (names.entityName(d.entityId) ?? d.entityId) : 'New table');
		if (d.kind === 'add') {
			const fields = d.addFields.map((f) => `${table}.${f.name}`);
			rows.push({ sign: '+', kind: 'Data', label: [`${table} table`, ...fields].join(' · '), count: 1, noun: 'table' });
			continue;
		}
		if (d.kind === 'remove') {
			rows.push({ sign: '-', kind: 'Data', label: `${table} table`, count: 1, noun: 'table' });
			continue;
		}
		if (d.addFields.length > 0)
			rows.push({ sign: '+', kind: 'Data', label: d.addFields.map((f) => `${table}.${f.name}`).join(' · '), count: d.addFields.length, noun: 'field' });
		if (d.changeFields.length > 0)
			rows.push({
				sign: '~',
				kind: 'Data',
				label: d.changeFields.map((c) => `${table}.${c.name || names.fieldName(c.fieldId) || c.fieldId}`).join(' · '),
				count: d.changeFields.length,
				noun: 'field'
			});
		if (d.removeFields.length > 0) {
			// A field already removed from the Data section is no longer there to be named: the row counts it.
			const named = d.removeFields.map((id) => names.fieldName(id));
			rows.push({
				sign: '-',
				kind: 'Data',
				label: named.every((n) => n !== null) ? named.map((n) => `${table}.${n}`).join(' · ') : `${table}: ${d.removeFields.length} ${d.removeFields.length === 1 ? 'field' : 'fields'}`,
				count: d.removeFields.length,
				noun: 'field'
			});
		}
	}
	return rows;
}

/** Every change the request makes to the specification: features, then their screens, actions and rules, then the data. */
export function closingChanges(request: Pick<EvolutionRequest, 'drafts' | 'dataDrafts'>, names: ClosingNames): ClosingChange[] {
	return [...featureRows(request, names), ...elementRows(request), ...dataRows(request, names)];
}

const VERB: Readonly<Record<ChangeSign, string>> = { '+': 'added', '~': 'changed', '-': 'removed' };
const NOUNS: readonly ChangeNoun[] = ['feature', 'screen', 'action', 'rule', 'table', 'field'];
const SIGNS: readonly ChangeSign[] = ['+', '~', '-'];

/** "2 features added, 2 rules changed, 2 fields added"; empty when the request changed nothing. */
export function changesSummary(changes: readonly ClosingChange[]): string {
	const parts: string[] = [];
	for (const noun of NOUNS)
		for (const sign of SIGNS) {
			const n = changes.filter((c) => c.noun === noun && c.sign === sign).reduce((sum, c) => sum + c.count, 0);
			if (n > 0) parts.push(`${n} ${n === 1 ? noun : `${noun}s`} ${VERB[sign]}`);
		}
	return parts.join(', ');
}

/** The version of the Specification 360° before and after the close, when the specification was ever validated. */
export interface VersionStep {
	readonly from: string;
	readonly to: string;
}

/**
 * The step the close moved the Specification 360° by: its version just before
 * the baseline the close captured, and at it. Null when the specification was
 * never validated, or when the close captured no baseline after the validation.
 */
export function versionStepAt(baselines: readonly Baseline[], validatedBaselineId: string | null, closingBaselineId: string | null | undefined): VersionStep | null {
	const closing = closingBaselineId ? baselines.find((b) => b.id === closingBaselineId) : undefined;
	if (!closing) return null;
	const version = specVersionOf(
		baselines.filter((b) => b.createdAt <= closing.createdAt),
		validatedBaselineId
	);
	return version?.previous && version.baselineId === closing.id ? { from: version.previous, to: version.label } : null;
}

export interface ClosingMessageInput {
	readonly key: string;
	readonly title: string;
	readonly compliance: RequirementCompliance;
	readonly version: VersionStep | null;
	readonly changes: readonly ClosingChange[];
	/** Where the report is read, in full. */
	readonly reportUrl: string;
}

/** The message a team posts on the ticket once the evolution is closed, one line per fact. */
export function closingMessage(input: ClosingMessageInput): string {
	const summary = changesSummary(input.changes);
	const version = input.version ? `: ${input.version.from} → ${input.version.to}` : '';
	const spec = version || summary ? `Specification updated${version}${summary ? ` (${summary})` : ''}.` : '';
	return [
		`✅ ${input.key} · ${input.title || 'Untitled request'} is closed in Lyriks.`,
		complianceSentence(input.compliance),
		spec,
		`Full report: ${input.reportUrl}`
	]
		.filter(Boolean)
		.join('\n');
}

const KEY = '[A-Z][A-Z0-9]{1,9}-\\d{1,7}';
/** A tracker's address of one ticket: Jira's browse, Linear's issue. */
const TICKET_URL = new RegExp(`/(?:browse|issue)/(${KEY})\\b`);
/** A title that opens on its ticket's key, the way trackers name a ticket. */
const LEADING_KEY = new RegExp(`^\\s*\\[?(${KEY})\\]?(?:[\\s:·]|$)`);
const ISSUE_URL = /\/(?:issues|pull|work_items)\/(\d+)\b/;

/**
 * The ticket a request came from, when what it cites names one: a tracker's
 * address of a ticket, a title that opens on a ticket key (PROJ-123), or an
 * issue number in an address. The request's own key is never taken for a
 * ticket's.
 */
export function ticketKeyIn(texts: readonly string[]): string | null {
	const own = (key: string | undefined) => (key && !key.startsWith(`${REQUEST_KEY_PREFIX}-`) ? key : null);
	for (const read of [(t: string) => TICKET_URL.exec(t)?.[1], (t: string) => LEADING_KEY.exec(t)?.[1]])
		for (const text of texts) {
			const key = own(read(text));
			if (key) return key;
		}
	for (const text of texts) {
		const issue = ISSUE_URL.exec(text)?.[1];
		if (issue) return `#${issue}`;
	}
	return null;
}

/** What the request cites, its title first: where a ticket key would be read. */
export function citedTexts(
	request: Pick<EvolutionRequest, 'title' | 'drafts' | 'proposals'>,
	sources: readonly { readonly id: string; readonly title: string; readonly url: string }[]
): string[] {
	const cited = new Set([...request.drafts.flatMap((d) => d.sourceIds), ...request.proposals.flatMap((p) => p.citedSourceIds)]);
	return [request.title, ...sources.filter((s) => cited.has(s.id)).flatMap((s) => [s.title, s.url])];
}
