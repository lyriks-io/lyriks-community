import type { PersonRef } from './document';

/**
 * Who must validate an element of the Specification 360°: the person who leads
 * the validation (the one who started the retrospecification, else the reader
 * about to start it), and the people whose job owns the element's part of the
 * specification. Product, Design and Tech retain their ownership; Development,
 * QA, Security and Business additionally review their declared topics. Match
 * stable job ids and anchors, never job labels. Nobody holding a matching job
 * (or an install with no jobs, Community) leaves the lead as sole validator.
 */

export type SpecOwner = 'product' | 'design' | 'tech';

/** The id of the team job (Enterprise `TeamJobsPort`) that owns each part. */
export const OWNER_JOB: Readonly<Record<SpecOwner, string>> = {
	product: 'product',
	design: 'design',
	tech: 'tech'
};

/** Additional default reviewers for the stable kinds of Knowledge elements. */
const TOPIC_JOBS: Readonly<Record<string, readonly string[]>> = {
	product: ['business'],
	problem: ['business'],
	target: ['business'],
	permissions: ['security'],
	core: ['business'],
	feature: ['qa', 'business'],
	action: ['development', 'qa'],
	rule: ['development', 'qa'],
	flow: ['development'],
	datamap: ['development'],
	data: ['development'],
	stack: ['development'],
	health: ['qa'],
	requirements: ['development', 'qa'],
	constraint: ['development', 'security'],
	term: ['business']
};

const SECURITY_REQUIREMENTS = new Set(['requirements:security', 'requirements:compliance']);

/** One member of the project's team with the jobs they hold on it. */
export interface TeamMember {
	readonly person: PersonRef;
	readonly jobIds: readonly string[];
	readonly jobNames?: readonly string[];
}

export const samePersonRef = (a: PersonRef, b: PersonRef): boolean => a.id.trim().toLowerCase() === b.id.trim().toLowerCase();

function unique(people: readonly PersonRef[]): PersonRef[] {
	const out: PersonRef[] = [];
	for (const p of people) if (p.id.trim() && !out.some((q) => samePersonRef(p, q))) out.push(p);
	return out;
}

/** The people who hold the job owning this part, in the team's order. */
export function ownersOf(owner: SpecOwner, team: readonly TeamMember[], elementId = ''): PersonRef[] {
	const kind = elementId.split(':', 1)[0];
	const jobs = new Set([OWNER_JOB[owner], ...(TOPIC_JOBS[kind] ?? []), ...(SECURITY_REQUIREMENTS.has(elementId) ? ['security'] : [])]);
	return unique(team.filter((member) => member.jobIds.some((job) => jobs.has(job))).map((member) => member.person));
}

/** The lead first, then the owners; each person once. Empty only when no lead is known and nobody holds the job. */
export function requiredValidators(owner: SpecOwner, lead: PersonRef | null, team: readonly TeamMember[], requested: readonly PersonRef[] = [], elementId = ''): PersonRef[] {
	const reachable = requested.filter((person) => team.some((member) => samePersonRef(member.person, person)));
	return unique([...(lead ? [lead] : []), ...ownersOf(owner, team, elementId), ...reachable]);
}
