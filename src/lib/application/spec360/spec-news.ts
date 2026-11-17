import { isNewSince, type FirstSeen } from '$domain/features';
import { requestKeyOf, type EvolutionRequest } from '$domain/evolution';

/**
 * What changed in the specification lately, feature by feature, and what each
 * reader has not opened since (criteria 2a6bff42, b0950115): a feature that
 * entered the spec less than the setting's days ago reads New; a feature a
 * live evolution added reads New and one it changed reads Changed, naming the
 * request, until the reader opens it, whatever the setting says. Nothing is
 * news before the specification was first validated: what a
 * Reverse-Specification writes, and all that comes before that first
 * validation, is the starting point.
 */
export interface SpecNews {
	readonly kind: 'new' | 'changed';
	/** When it appeared or changed: its first save, or when the evolution went live. */
	readonly at: string;
	/** The request that brought it (EVO-012); null for a feature written in the spec directly. */
	readonly by: string | null;
}

/** What one live evolution wrote into the feature tree, and when it went live. */
export interface LandedChange {
	readonly key: string;
	readonly at: string;
	readonly added: readonly string[];
	readonly changed: readonly string[];
}

type Landable = Pick<EvolutionRequest, 'id' | 'status' | 'deployment' | 'code' | 'drafts'>;

/** The evolutions that went live (merged into the deployment branch, or declared live), with the features they wrote. */
export function landedChanges(requests: readonly Landable[]): LandedChange[] {
	return requests.flatMap((r) => {
		const at = r.deployment?.declaredAt ?? r.code?.merged?.at ?? null;
		if (!at || r.status === 'deleted' || r.status === 'cancelled') return [];
		const added = r.drafts.flatMap((d) => (d.kind === 'add' && d.materialisedAs ? [d.materialisedAs] : []));
		const changed = r.drafts.flatMap((d) => (d.kind === 'amend' && d.baseLeafId ? [d.baseLeafId] : []));
		return [{ key: requestKeyOf(requests, r.id) ?? 'EVO', at, added, changed }];
	});
}

/** An evolution's mark wins over the first save it caused, which lands a moment before or after it. */
const SAME_MOMENT_MS = 60_000;

/** When the specification was first validated: the earliest run published; null while it never was. */
export function firstValidatedAt(runs: readonly { readonly publishedAt: string | null }[]): string | null {
	let first: string | null = null;
	for (const r of runs) if (r.publishedAt && (!first || r.publishedAt < first)) first = r.publishedAt;
	return first;
}

/**
 * Every feature and core feature that reads New or Changed for someone who
 * never opened it. `validatedSince` is when the specification was first
 * validated: before it nothing is news, and what was written up to it is the
 * baseline (criterion 2a6bff42).
 */
export function specNews(
	firstSeen: FirstSeen | undefined,
	landed: readonly LandedChange[],
	now: number,
	days: number,
	validatedSince: string | null
): Record<string, SpecNews> {
	const news: Record<string, SpecNews> = {};
	if (!validatedSince) return news;
	const after = (at: string) => at > validatedSince;
	for (const [id, at] of Object.entries(firstSeen ?? {})) if (after(at) && isNewSince(firstSeen, id, now, days)) news[id] = { kind: 'new', at, by: null };
	const mark = (id: string, next: SpecNews) => {
		const held = news[id];
		if (!held || Date.parse(next.at) >= Date.parse(held.at) - SAME_MOMENT_MS) news[id] = next;
	};
	for (const change of [...landed].filter((c) => after(c.at)).sort((a, b) => a.at.localeCompare(b.at))) {
		for (const id of change.added) mark(id, { kind: 'new', at: change.at, by: change.key });
		for (const id of change.changed) mark(id, { kind: 'changed', at: change.at, by: change.key });
	}
	return news;
}

/** When a reader last opened each feature; what they opened after it changed reads plain for them. */
export type SpecSeen = Readonly<Record<string, string>>;

/** The news a reader has not opened since. */
export function unseenNews(news: Readonly<Record<string, SpecNews>>, seen: SpecSeen): Record<string, SpecNews> {
	return Object.fromEntries(Object.entries(news).filter(([id, n]) => !(seen[id] && seen[id] >= n.at)));
}

/** A reader's opened features as stored, read at the edge: what is not a date is dropped. */
export function parseSpecSeen(raw: unknown): SpecSeen {
	const seen = raw && typeof raw === 'object' ? (raw as { seen?: unknown }).seen : null;
	if (!seen || typeof seen !== 'object') return {};
	return Object.fromEntries(Object.entries(seen as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && Number.isFinite(Date.parse(e[1]))));
}
