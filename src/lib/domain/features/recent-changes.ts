import { EARLIER, type FirstSeen } from './first-seen';

/**
 * What the empty search lists under Recently changed (criterion e11bf80b): the
 * last core features and features added to the specification or changed in
 * it, newest first. Added is the moment the element first entered the
 * specification; Changed is the moment its behavior was last written, once it
 * is later than its arrival. Pure.
 */
export interface RecentChange {
	readonly id: string;
	readonly name: string;
	/** A core feature (an area of the product) or one of its features. */
	readonly kind: 'core' | 'feature';
	readonly change: 'added' | 'changed';
	readonly at: string;
}

export const RECENT_CHANGES_MAX = 5;

/** A write this close to the arrival is the arrival itself: creating a feature also writes its behavior. */
const SAME_MOMENT_MS = 60_000;

/**
 * One save of the features section rewrites many features at the same
 * millisecond; such a moment says the section was saved, not that each of them
 * changed, so it names none of them.
 */
const BULK_SAVE_AT = 3;

export function recentChanges(input: {
	readonly cores: readonly { readonly id: string; readonly name: string; readonly features: readonly { readonly id: string; readonly name: string }[] }[];
	readonly firstSeen: FirstSeen | undefined;
	/** When each feature's behavior was last written, by feature id. */
	readonly changedAt: Readonly<Record<string, string>>;
	readonly limit?: number;
}): RecentChange[] {
	const sharing = new Map<string, number>();
	for (const at of Object.values(input.changedAt)) sharing.set(at, (sharing.get(at) ?? 0) + 1);
	const time = (at: string | undefined) => (at ? Date.parse(at) : Number.NaN);
	const changes: RecentChange[] = [];
	const consider = (id: string, name: string, kind: RecentChange['kind']) => {
		const seen = input.firstSeen?.[id];
		const added = seen && seen !== EARLIER ? seen : null;
		const written = kind === 'feature' ? input.changedAt[id] : undefined;
		const changed = written && (sharing.get(written) ?? 0) < BULK_SAVE_AT && (!added || time(written) - time(added) > SAME_MOMENT_MS) ? written : null;
		if (changed && Number.isFinite(time(changed))) changes.push({ id, name, kind, change: 'changed', at: changed });
		else if (added && Number.isFinite(time(added))) changes.push({ id, name, kind, change: 'added', at: added });
	};
	for (const core of input.cores) {
		consider(core.id, core.name, 'core');
		for (const f of core.features) consider(f.id, f.name, 'feature');
	}
	return changes.sort((a, b) => time(b.at) - time(a.at)).slice(0, input.limit ?? RECENT_CHANGES_MAX);
}
