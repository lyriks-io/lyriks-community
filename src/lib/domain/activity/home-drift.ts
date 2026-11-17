import type { HomeCodeChange, HomeSource } from './home-source';
import { plain, quoted, shortLine, strong, type ActivityNotice } from './notice';
import { isUnread } from './reads';

/**
 * A feature whose code changed outside Lyriks, as a card of Home's feed
 * (feat-home, criterion d18e3e74): one card per feature with changes still to
 * decide, in a project the reader may edit, dated at the last reading of its
 * code; level DRIFT under CODE WATCH, its picture what the specification says
 * beside what the code does now, its action opening Mismatch, where the change
 * is decided. A new reading of the code is a new card. Pure.
 */

export interface DriftNotice {
	/** The card's own id in its project, so the bell's read marks hold it. */
	readonly id: string;
	readonly at: string;
	readonly unread: boolean;
	readonly href: string;
	readonly notice: ActivityNotice;
}

/** How many changes the picture shows; the others are counted under it. */
export const DRIFT_ROWS_SHOWN = 3;

/** A short, stable fingerprint of what a card stands for, so a new reading of the code is a new card. */
function fingerprint(text: string): string {
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
	return (h >>> 0).toString(36);
}

function noticeOf(featureName: string, changes: readonly HomeCodeChange[]): ActivityNotice {
	const n = changes.length;
	return {
		section: 'Code watch',
		level: 'drift',
		title: 'A change was made outside the process.',
		body: [
			plain('The code of '),
			strong(quoted(featureName, 'a feature')),
			plain(' changed outside Lyriks: '),
			strong(String(n)),
			plain(n === 1 ? ' element of the specification no longer matches it.' : ' elements of the specification no longer match it.')
		],
		line: shortLine(`${featureName}: ${n} ${n === 1 ? 'element no longer matches' : 'elements no longer match'} the code`),
		action: { label: 'Review on Mismatch', icon: 'go' },
		visual: {
			kind: 'speccode',
			rows: changes.slice(0, DRIFT_ROWS_SHOWN).map((c) => ({
				spec: c.specText.trim() || c.elementLabel,
				code: c.shift === 'gone' ? '' : c.snippet.trim() || c.code,
				where: c.where,
				gone: c.shift === 'gone'
			})),
			more: Math.max(0, n - DRIFT_ROWS_SHOWN)
		}
	};
}

/** The cards of one project: none while its specification is a draft or for a reader who may not edit it. */
export function driftNotices(p: HomeSource, fallbackAt: string): DriftNotice[] {
	if (!p.mayEdit || !p.drift?.length) return [];
	const byFeature = new Map<string, HomeCodeChange[]>();
	for (const c of p.drift) if (!c.decided) byFeature.set(c.featureId, [...(byFeature.get(c.featureId) ?? []), c]);
	return [...byFeature.values()].map((changes) => {
		const first = changes[0];
		const at = changes.map((c) => c.readAt ?? '').sort().at(-1) || fallbackAt;
		const id = `drift:${first.featureId}:${fingerprint(changes.map((c) => `${c.key}=${c.code}`).join('|'))}`;
		return {
			id,
			at,
			unread: isUnread({ id, at }, p.reads),
			href: `/projects/${encodeURIComponent(p.id)}/drift`,
			notice: noticeOf(first.featureName, changes)
		};
	});
}
