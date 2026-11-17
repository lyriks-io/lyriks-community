import type { ProjectRulesDraft } from '../rules';

/**
 * How an issue of What Lyriks noticed is rejected (kept as it is) and taken
 * back (criterion e0f69b3c). A rejection resolves the issue and adds one line
 * to its note saying who kept it and when; that line is what tells a rejected
 * issue from one settled any other way (fixed by an evolution, resolved in the
 * rules register), and what Undo takes away. Pure.
 */

type Issue = ProjectRulesDraft['issues'][number];

const KEPT_PREFIX = 'Kept as it is by ';

/** "Kept as it is by Ana Lopez on 2026-11-01." */
export function keptLine(by: string, at: string): string {
	return `${KEPT_PREFIX}${by.trim() || 'a project editor'} on ${at.slice(0, 10)}.`;
}

const lines = (note: string) => note.split('\n');

/** Resolved by a rejection from the Specification 360°, and nothing settled it since. */
export function isKeptIssue(issue: Pick<Issue, 'status' | 'resolutionNote'>): boolean {
	return issue.status === 'resolved' && lines(issue.resolutionNote).some((l) => l.trim().startsWith(KEPT_PREFIX));
}

/** The note with the keep line added under what it already said. */
export function noteWithKeep(note: string, by: string, at: string): string {
	const kept = keptLine(by, at);
	return note.trim() ? `${note.trim()}\n${kept}` : kept;
}

/** The note as it was before the last rejection: its last keep line taken away. */
export function noteWithoutKeep(note: string): string {
	const all = lines(note);
	const last = all.map((l) => l.trim().startsWith(KEPT_PREFIX)).lastIndexOf(true);
	if (last < 0) return note;
	return all
		.filter((_, i) => i !== last)
		.join('\n')
		.trim();
}
