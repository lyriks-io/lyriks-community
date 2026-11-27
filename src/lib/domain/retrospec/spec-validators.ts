import type { PersonRef } from './document';
import { reviewJobsOf, type JobTopics } from './review-jobs';

/**
 * Who must validate an element of the Specification 360°, as seats to fill
 * (criteria e3296696 and f02f078b of feat-164): the person who leads the
 * validation (the one who started the retrospecification, else the reader
 * about to start it), one seat per job the element's kind waits on that some
 * reachable person holds, filled by any one holder like a code owner team, and
 * one seat per person asked by name. Match stable job ids and anchors, never
 * job labels; a job validates the topics its workspace chose, else its
 * defaults. Nobody holding a matching job (or an install with no jobs,
 * Community) leaves the lead as sole validator.
 */

/** One member of the project's team with the jobs they hold on it. */
export interface TeamMember {
	readonly person: PersonRef;
	readonly jobIds: readonly string[];
	readonly jobNames?: readonly string[];
	/** What each job they hold validates, as the workspace chose it; a job left out validates its defaults. */
	readonly jobTopics?: JobTopics;
	/** Their role in the workspace (owner, admin, designer, viewer), when the roster says it. */
	readonly role?: string;
}

/** What the team's jobs validate, as their workspace chose it. */
const teamJobTopics = (team: readonly TeamMember[]): JobTopics => Object.assign({}, ...team.map((member) => member.jobTopics ?? {}));

/** A validation the element needs: from one person in particular (`job` null), or from any holder of a job. */
export interface ReviewSeat {
	readonly job: string | null;
	readonly people: readonly PersonRef[];
}

export const samePersonRef = (a: PersonRef, b: PersonRef): boolean => a.id.trim().toLowerCase() === b.id.trim().toLowerCase();

function unique(people: readonly PersonRef[]): PersonRef[] {
	const out: PersonRef[] = [];
	for (const p of people) if (p.id.trim() && !out.some((q) => samePersonRef(p, q))) out.push(p);
	return out;
}

/**
 * The seats of one element: the lead first, then each matching job held by
 * somebody the project names as a validator (everybody who can open it while it
 * names nobody, an older project), in the matrix's order with its holders in the
 * team's order, then each reachable person asked by name who is not the lead.
 * One validation may fill several seats: the lead's gives every job the lead holds.
 */
export function reviewSeats(
	lead: PersonRef | null,
	team: readonly TeamMember[],
	requested: readonly PersonRef[] = [],
	elementId = '',
	validators: readonly PersonRef[] | null = null
): ReviewSeat[] {
	const seats: ReviewSeat[] = lead?.id.trim() ? [{ job: null, people: [lead] }] : [];
	const validating = validators ? team.filter((member) => validators.some((v) => samePersonRef(v, member.person))) : team;
	for (const job of reviewJobsOf(elementId, teamJobTopics(team))) {
		const holders = unique(validating.filter((member) => member.jobIds.includes(job)).map((member) => member.person));
		if (holders.length > 0) seats.push({ job, people: holders });
	}
	const asked = unique(requested.filter((person) => team.some((member) => samePersonRef(member.person, person))));
	for (const person of asked) if (!lead || !samePersonRef(person, lead)) seats.push({ job: null, people: [person] });
	return seats;
}

/** Everyone who may fill a seat of the element, the lead first, each person once. */
export function eligibleValidators(seats: readonly ReviewSeat[]): PersonRef[] {
	return unique(seats.flatMap((seat) => seat.people));
}
