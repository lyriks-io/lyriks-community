import type { EvolutionRequest } from '$domain/evolution';
import type { CodeShift } from '$domain/retrospec';
import type { LastRun } from '$domain/retrospec/last-run';
import type { ActivityReads } from './reads';

/**
 * What one project gives Home (feat-home): its last Reverse-Specification,
 * its evolutions, the code changed outside Lyriks once its specification is
 * validated, and the reader's read marks on it. Read off what the project
 * already records; nothing is kept aside.
 */

/** One change of the code of a feature made outside Lyriks, as Home reads it. */
export interface HomeCodeChange {
	readonly key: string;
	readonly featureId: string;
	readonly featureName: string;
	readonly shift: CodeShift;
	/** "Rule · No order after 6 pm": the element of the specification it touches. */
	readonly elementLabel: string;
	/** What the specification says of that element. */
	readonly specText: string;
	/** The line the code reads now, '' when it is gone or the index recorded none. */
	readonly snippet: string;
	/** Where it is in the code now, or where it was when it is gone. */
	readonly where: string;
	/** What the code reads now: a new value is a new event. */
	readonly code: string;
	/** When Lyriks last read the code of its feature. */
	readonly readAt: string | null;
	/** A person accepted it into the spec or marked it a mistake on Mismatch. */
	readonly decided: boolean;
}

/** The last Reverse-Specification of a project (criterion a0959413), dated by its start. */
export interface HomeRun extends LastRun {
	readonly href: string;
	readonly at: string;
	/** How far it went, 0 to 100: its share read while it reads, the share validated in review. */
	readonly pct: number;
}

export interface HomeSource {
	readonly id: string;
	readonly name: string;
	readonly requests: readonly EvolutionRequest[];
	/** Each request's key ("EVO-077"); one missing reads from `requests`. */
	readonly keys?: Readonly<Record<string, string>>;
	readonly reads: ActivityReads;
	readonly run: HomeRun | null;
	/** The code changes since the validation; null while the specification is a draft. */
	readonly drift: readonly HomeCodeChange[] | null;
	/** Whether the reader may edit this project: only then is a code change theirs to decide. */
	readonly mayEdit: boolean;
}
