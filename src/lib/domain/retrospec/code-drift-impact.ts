import type { CodeChange } from './code-drift';

/**
 * The impact of a code change made outside Lyriks, read from the
 * specification alone (criterion 94d2468a): the feature, the action, the rule
 * it touches, who may perform the action, the data it writes and the
 * scenarios that check it, and a rating by a fixed rule, so the same change
 * always reads the same impact and the reader can check it against the spec.
 * No AI is asked. Pure.
 */

export type DriftRisk = 'high' | 'medium' | 'low';

/** What the specification says around the element a change touches, gathered by the caller. */
export interface DriftSpecReading {
	readonly featureName: string;
	/** The action the element belongs to, as the specification declares it; null when it declares none. */
	readonly action: {
		readonly name: string;
		/** The profiles that may perform it, by name. */
		readonly who: readonly string[];
		/** What its effects write, by state path. */
		readonly writes: readonly string[];
		/** The scenarios that check it, by name. */
		readonly scenarios: readonly string[];
	} | null;
	/** The rule or invariant the change touches, in the specification's words; null when it touches none. */
	readonly rule: string | null;
}

export type DriftImpactKey = 'feature' | 'action' | 'rule' | 'profile' | 'data' | 'tests';

export interface DriftImpactRow {
	readonly key: DriftImpactKey;
	readonly value: string;
}

export interface DriftImpact {
	readonly risk: DriftRisk;
	/** One sentence: why the rating, then how far the change reaches. */
	readonly summary: string;
	readonly rows: readonly DriftImpactRow[];
}

type Change = Pick<CodeChange, 'shift' | 'codeElement'>;

const GUARDS = new Set(['rule', 'invariant']);

/** The fixed rule: what was lost or what guards data weighs most; a move weighs least. */
export function driftRisk(change: Change, writesData: boolean): DriftRisk {
	const { kind } = change.codeElement;
	if (change.shift === 'moved') return 'low';
	if (change.shift === 'gone') return GUARDS.has(kind) || kind === 'action' ? 'high' : 'medium';
	if (GUARDS.has(kind)) return writesData ? 'high' : 'medium';
	if (kind === 'action') return writesData ? 'medium' : 'low';
	return 'low';
}

function why(change: Change): string {
	const { kind } = change.codeElement;
	if (change.shift === 'moved') return 'The code moved to another file: what it does may be unchanged.';
	if (change.shift === 'gone') {
		if (GUARDS.has(kind)) return 'A guard of the spec is no longer found in the code: what it refused may now go through.';
		if (kind === 'action') return 'An action of the spec is no longer found in the code: the people who perform it may have lost it.';
		return 'An element of the spec is no longer found in the code.';
	}
	if (GUARDS.has(kind)) return 'A guard reads differently in the code: what it lets through may have changed.';
	if (kind === 'action') return 'The code of an action changed: what it does may differ from the spec.';
	return 'The code of this element changed.';
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Ana, Bob and Cleo" */
function listed(names: readonly string[]): string {
	if (names.length <= 1) return names.join('');
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** At most a few names, then how many more: a row stays one line or two. */
function shortList(names: readonly string[], max = 3): string {
	if (names.length <= max) return names.join(' · ');
	return `${names.slice(0, max).join(' · ')} and ${names.length - max} more`;
}

function reach(action: NonNullable<DriftSpecReading['action']>): string {
	const who = action.who.length > 0 ? `${listed(action.who)} may perform “${action.name}”` : `No profile is granted “${action.name}” in the spec`;
	const writes = action.writes.length > 0 ? `it writes ${count(action.writes.length, 'field', 'fields')}` : 'it writes no data';
	const tests = action.scenarios.length > 0 ? `${count(action.scenarios.length, 'scenario checks', 'scenarios check')} it` : 'no scenario checks it';
	return `${who}; ${writes}; ${tests}.`;
}

export function driftImpact(change: Change, spec: DriftSpecReading): DriftImpact {
	const { action } = spec;
	const risk = driftRisk(change, (action?.writes.length ?? 0) > 0);
	const rows: DriftImpactRow[] = [{ key: 'feature', value: spec.featureName }];
	if (action) rows.push({ key: 'action', value: action.name });
	if (spec.rule) rows.push({ key: 'rule', value: spec.rule });
	if (action) {
		rows.push(
			{ key: 'profile', value: action.who.length > 0 ? action.who.join(', ') : 'No profile is granted this action in the spec' },
			{ key: 'data', value: action.writes.length > 0 ? action.writes.join(', ') : 'Writes no data' },
			{ key: 'tests', value: action.scenarios.length > 0 ? `${count(action.scenarios.length, 'scenario', 'scenarios')} to run again: ${shortList(action.scenarios)}` : 'No scenario checks this action' }
		);
	}
	return { risk, summary: action ? `${why(change)} ${reach(action)}` : why(change), rows };
}
