import type { RetrospecDocument, RetrospecRun } from './document';
import { shortCommit } from './run-history';
import type { SpecElement } from './spec-validation';

/**
 * What a later run changed in the specification (criterion 03192a6e of
 * feat-ai-session): each element read against what it read before the run,
 * with the fingerprint carried validations are read against, so what this says
 * changed is what goes back to validation. Pure: the elements arrive read.
 */

const KINDS: Readonly<Record<string, string>> = {
	product: 'Product',
	problem: 'Problem',
	target: 'Target',
	role: 'User',
	permissions: 'Permissions',
	core: 'Core feature',
	feature: 'Feature',
	action: 'Action',
	rule: 'Rule',
	flow: 'Flow',
	branding: 'Branding',
	journey: 'Journey',
	component: 'Component',
	datamap: 'Datamap',
	data: 'Data',
	stack: 'Stack',
	health: 'Health',
	requirements: 'Requirement',
	constraint: 'Constraint',
	term: 'Term'
};

export interface DeltaElement {
	readonly id: string;
	readonly kind: string;
	readonly title: string;
	/** Where it sits in the specification. */
	readonly place?: string;
	/** The action a rule belongs to, read even when nothing of it changed. */
	readonly under?: { readonly id: string; readonly title: string };
	/** Its rank in the order of the pages. */
	readonly order?: number;
}

export interface RunDelta {
	/** What it is read against: the specification as the run started, as it was last validated, or nothing recorded. */
	readonly since: 'start' | 'validation' | null;
	readonly added: readonly DeltaElement[];
	readonly changed: readonly DeltaElement[];
	readonly removed: readonly DeltaElement[];
	/** The elements of the specification now. */
	readonly total: number;
	readonly fromCommit: string | null;
	readonly toCommit: string | null;
}

interface Reference {
	readonly since: 'start' | 'validation';
	readonly fingerprints: Readonly<Record<string, string>>;
	readonly titles: Readonly<Record<string, string>>;
}

/**
 * What the run is read against. A run started before Lyriks kept what the
 * specification read falls back on the last validation: its fingerprints, or
 * those of the validations it carried, so what was never validated reads new.
 */
function referenceOf(doc: RetrospecDocument, run: RetrospecRun): Reference | null {
	if (run.atStart) return { since: 'start', ...run.atStart };
	const validated = doc.runs.find((r) => r.id === run.complementary?.fromRunId);
	const fingerprints = validated?.fingerprints ?? Object.fromEntries(Object.entries(run.carried ?? {}).map(([id, c]) => [id, c.fingerprint]));
	if (Object.keys(fingerprints).length === 0) return null;
	return { since: 'validation', fingerprints, titles: Object.fromEntries(Object.entries(validated?.verdicts ?? {}).map(([id, v]) => [id, v.title])) };
}

const kindOf = (id: string): string => KINDS[id.split(':', 1)[0]] ?? 'Element';
/** The kind stands beside the title: a title that opens on it does not say it twice. Its place names the feature a flow belongs to. */
export const deltaRow = (id: string, title: string): DeltaElement => ({ id, kind: kindOf(id), title: id.startsWith('flow:') ? 'Flow of the actions' : title.replace(/^(Term|Journey) · /, '') });

/** An element of the specification as the list reads it, docked on where it sits. */
export function deltaElement(e: SpecElement, titles: ReadonlyMap<string, string>, order: number): DeltaElement {
	const under = e.under && titles.has(e.under) ? { id: e.under, title: titles.get(e.under) as string } : null;
	return { ...deltaRow(e.id, e.title), order, ...(e.place ? { place: e.place } : {}), ...(under ? { under } : {}) };
}

/** What a later run changed; `since` null when no element can be read against anything. */
export function runDelta(doc: RetrospecDocument, run: RetrospecRun, elements: readonly SpecElement[] | null): RunDelta {
	const commits = { fromCommit: run.complementary?.fromCommit ? shortCommit(run.complementary.fromCommit) : null, toCommit: run.commit ? shortCommit(run.commit.sha) : null };
	const reference = elements && referenceOf(doc, run);
	if (!reference) return { since: null, added: [], changed: [], removed: [], total: elements?.length ?? 0, ...commits };
	const read = elements.filter((e) => e.fingerprint);
	const now = new Set(read.map((e) => e.id));
	const titles = new Map(elements.map((e) => [e.id, e.title]));
	const row = (e: SpecElement) => deltaElement(e, titles, elements.indexOf(e));
	return {
		since: reference.since,
		added: read.filter((e) => !(e.id in reference.fingerprints)).map(row),
		changed: read.filter((e) => e.id in reference.fingerprints && reference.fingerprints[e.id] !== e.fingerprint).map(row),
		removed: Object.keys(reference.fingerprints)
			.filter((id) => !now.has(id))
			.map((id) => deltaRow(id, reference.titles[id] || kindOf(id))),
		total: elements.length,
		...commits
	};
}

export type DeltaStatus = 'new' | 'changed' | 'removed';
export interface DeltaEntry extends DeltaElement {
	readonly status: DeltaStatus;
}

/** An element the run touched, or an action only named because a rule of it was: its status is then null. */
export interface DeltaBlock {
	readonly head: DeltaElement & { readonly status: DeltaStatus | null };
	readonly rules: readonly DeltaEntry[];
}

export interface DeltaPlace {
	readonly place: string;
	readonly blocks: readonly DeltaBlock[];
}

export const NO_LONGER_THERE = 'No longer in the specification';

/**
 * The list docked on the specification (criterion 03192a6e): each place that
 * changed in the order of the pages, each rule under the action it belongs to.
 * What is gone has no place left and closes the list.
 */
export function deltaPlaces(delta: RunDelta): DeltaPlace[] {
	const entries: DeltaEntry[] = [...delta.added.map((e) => ({ ...e, status: 'new' as const })), ...delta.changed.map((e) => ({ ...e, status: 'changed' as const }))].toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const statusOf = new Map(entries.map((e) => [e.id, e.status]));
	const places = new Map<string, Map<string, { head: DeltaBlock['head']; rules: DeltaEntry[] }>>();
	for (const entry of entries) {
		const name = entry.place ?? entry.kind;
		const blocks = places.get(name) ?? new Map<string, { head: DeltaBlock['head']; rules: DeltaEntry[] }>();
		places.set(name, blocks);
		const headId = entry.under?.id ?? entry.id;
		const block = blocks.get(headId) ?? { head: entry.under ? { id: entry.under.id, kind: 'Action', title: entry.under.title, status: statusOf.get(entry.under.id) ?? null } : entry, rules: [] };
		blocks.set(headId, block);
		if (entry.under) block.rules.push(entry);
	}
	const read = [...places].map(([place, blocks]): DeltaPlace => ({ place, blocks: [...blocks.values()] }));
	if (delta.removed.length === 0) return read;
	return [...read, { place: NO_LONGER_THERE, blocks: delta.removed.map((e) => ({ head: { ...e, status: 'removed' as const }, rules: [] })) }];
}

export const deltaSize = (delta: RunDelta): number => delta.added.length + delta.changed.length + delta.removed.length;

/** How much changed and since when, or why it cannot be said. */
export function deltaLine(delta: RunDelta): string {
	if (delta.since === null) return 'Lyriks did not record what the specification read before this run, so it cannot list what changed.';
	if (deltaSize(delta) === 0) return 'This run changed nothing in the specification: what it read still holds.';
	const parts = ([[delta.added.length, 'new'], [delta.changed.length, 'changed'], [delta.removed.length, 'removed']] as const).filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`);
	const counted = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
	return `${delta.since === 'start' ? 'Since this run started' : 'Since the last validation'}: ${counted}, out of ${delta.total} ${delta.total === 1 ? 'element' : 'elements'}.`;
}

/** The commits the run read between, when its AI reported the one it read. */
export function deltaCommits(delta: RunDelta): string | null {
	if (!delta.toCommit) return null;
	return delta.fromCommit ? `From commit ${delta.fromCommit} to ${delta.toCommit}.` : `Read up to commit ${delta.toCommit}.`;
}
