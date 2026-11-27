import type { WritingView } from '$lib/shared/code-drift-page';

/** What the foot of the report says of Lyriks' writing (criteria a646b474, 5aec3583 of feat-120). */
export interface WritingLine {
	readonly state: 'writing' | 'done' | 'stopped';
	readonly line: string;
	/** Where it stopped and why; null while it writes or once it is done. */
	readonly stop: string | null;
	/** The validated changes not written yet: what Write the remaining N counts. */
	readonly left: number;
}

export function writingLine(w: WritingView): WritingLine {
	const changes = `${w.total} validated ${w.total === 1 ? 'change' : 'changes'}`;
	const left = Math.max(0, w.total - w.written);
	// Every validated change written: what a writing that is just ending also reads.
	if (left === 0) return { state: 'done', line: `Lyriks wrote the ${changes}. Validate the specification in Knowledge.`, stop: null, left };
	if (w.underWay && !w.stop) return { state: 'writing', line: `Lyriks writes the ${changes}. ${w.written} written so far.`, stop: null, left };
	return {
		state: 'stopped',
		line: `Lyriks wrote ${w.written} of the ${changes}.`,
		stop: w.stop ? `It stopped at “${w.stop.title}”: ${w.stop.reason}` : 'The writing stopped before the end: the server stopped while it wrote.',
		left
	};
}
