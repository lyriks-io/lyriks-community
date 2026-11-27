/**
 * Which jobs review each element of a specification (criterion e3296696 of
 * feat-164, action 49fd4fc9): every element belongs to one topic, and a job
 * validates the topics an owner or admin ticked for it, else a starting job's
 * defaults, else nothing. Matched by stable job ids and element anchors, never
 * by a job's name: nothing is guessed from what a job is called.
 */

/** The jobs a workspace starts with: their ids are the ones the defaults below read. */
export const BUILT_IN_JOBS: readonly { readonly id: string; readonly name: string }[] = [
	{ id: 'product', name: 'Product' },
	{ id: 'design', name: 'Design' },
	{ id: 'tech', name: 'Tech' },
	{ id: 'development', name: 'Development' },
	{ id: 'qa', name: 'QA' },
	{ id: 'security', name: 'Security & compliance' },
	{ id: 'business', name: 'Business' }
];

/** A topic of a specification a job can validate, and the part of Knowledge it belongs to. */
export interface ReviewTopic {
	readonly id: string;
	readonly label: string;
	readonly part: ReviewPart;
}

export const REVIEW_PARTS = ['Product', 'Features', 'Experience', 'Tech & data', 'Requirements'] as const;
export type ReviewPart = (typeof REVIEW_PARTS)[number];

/** Every topic, in the order Knowledge reads them. */
export const REVIEW_TOPICS: readonly ReviewTopic[] = [
	{ id: 'overview', label: 'Overview', part: 'Product' },
	{ id: 'role', label: 'user profiles', part: 'Product' },
	{ id: 'permissions', label: 'permissions', part: 'Product' },
	{ id: 'core', label: 'core features', part: 'Features' },
	{ id: 'feature', label: 'features', part: 'Features' },
	{ id: 'action', label: 'actions', part: 'Features' },
	{ id: 'rule', label: 'rules', part: 'Features' },
	{ id: 'flow', label: 'feature flows', part: 'Features' },
	{ id: 'branding', label: 'branding', part: 'Experience' },
	{ id: 'journey', label: 'journeys', part: 'Experience' },
	{ id: 'component', label: 'components', part: 'Experience' },
	{ id: 'datamap', label: 'data map', part: 'Tech & data' },
	{ id: 'data', label: 'data', part: 'Tech & data' },
	{ id: 'stack', label: 'stack', part: 'Tech & data' },
	{ id: 'health', label: 'operations', part: 'Tech & data' },
	{ id: 'requirements:runtime', label: 'platform requirements', part: 'Requirements' },
	{ id: 'requirements:languages', label: 'language requirements', part: 'Requirements' },
	{ id: 'requirements:security', label: 'security requirements', part: 'Requirements' },
	{ id: 'requirements:compliance', label: 'compliance requirements', part: 'Requirements' },
	{ id: 'requirements:accessibility', label: 'accessibility requirements', part: 'Requirements' },
	{ id: 'constraint', label: 'technical constraints', part: 'Tech & data' },
	{ id: 'term', label: 'glossary', part: 'Product' }
];

const TOPIC_IDS = new Set(REVIEW_TOPICS.map((topic) => topic.id));
const REQUIREMENT_TOPICS = REVIEW_TOPICS.filter((topic) => topic.part === 'Requirements').map((topic) => topic.id);

/** Whether an id names a topic of a specification. */
export const isReviewTopic = (id: string): boolean => TOPIC_IDS.has(id);

/** What each starting job validates while nobody chose otherwise. */
export const DEFAULT_JOB_TOPICS: Readonly<Record<string, readonly string[]>> = {
	product: ['overview', 'role', 'permissions', 'core', 'feature', 'action', 'rule', 'term'],
	design: ['flow', 'branding', 'journey', 'component', 'requirements:accessibility'],
	tech: ['datamap', 'stack', 'health', ...REQUIREMENT_TOPICS],
	development: ['action', 'rule', 'flow', 'data', 'constraint'],
	qa: ['feature', 'action', 'rule', 'journey', 'health', ...REQUIREMENT_TOPICS],
	security: ['permissions', 'data', 'constraint', 'requirements:security', 'requirements:compliance'],
	business: ['overview', 'core', 'feature', 'term']
};

/** The topics each job validates where the workspace chose them, by job id. */
export type JobTopics = Readonly<Record<string, readonly string[]>>;

/** What a job validates: the topics the workspace chose for it, else a starting job's defaults, else nothing. */
export function topicsOfJob(jobId: string, chosen: JobTopics = {}): readonly string[] {
	return chosen[jobId] ?? DEFAULT_JOB_TOPICS[jobId] ?? [];
}

/** What a job of the list validates, its own topics standing over the defaults. */
export const jobTopicsOf = (job: { readonly id: string; readonly topics?: readonly string[] }): readonly string[] =>
	job.topics ?? topicsOfJob(job.id);

/** Topics in reading order, each once, unknown ones dropped. */
export const orderedTopics = (topics: readonly string[]): string[] => REVIEW_TOPICS.filter((topic) => topics.includes(topic.id)).map((topic) => topic.id);

const OVERVIEW_KINDS = new Set(['product', 'problem', 'target']);

/** The topic an element belongs to, read from its anchor; null for a kind no topic names. */
export function topicOf(elementId: string): string | null {
	const [kind, group] = elementId.split(':', 2);
	if (OVERVIEW_KINDS.has(kind)) return 'overview';
	const id = kind === 'requirements' ? `${kind}:${group ?? ''}` : kind;
	return TOPIC_IDS.has(id) ? id : null;
}

/** An anchor of a kind no topic names reads as the product's own. */
const UNKNOWN_KIND_JOBS: readonly string[] = ['product'];

/**
 * The jobs an element waits on, each once: the starting jobs first in their
 * order, then the jobs the workspace added, each where its topics hold the
 * element's (rules 7e1c7ae3, c2cd2e50 and ce768b66).
 */
export function reviewJobsOf(elementId: string, chosen: JobTopics = {}): readonly string[] {
	const topic = topicOf(elementId);
	if (!topic) return UNKNOWN_KIND_JOBS;
	const jobs = [...new Set([...BUILT_IN_JOBS.map((job) => job.id), ...Object.keys(chosen)])];
	return jobs.filter((job) => topicsOfJob(job, chosen).includes(topic));
}

/** `a, b and c`. */
function listed(items: readonly string[]): string {
	return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * What these topics make a person validate, read as a list (`the data map,
 * stack, operations and requirements`), the five groups of requirements read
 * as one when all are there; null when there is none.
 */
export function whatTopicsValidate(topics: readonly string[]): string | null {
	const held = new Set(topics);
	const every = REQUIREMENT_TOPICS.every((id) => held.has(id));
	const labels: string[] = [];
	for (const topic of REVIEW_TOPICS) {
		if (!held.has(topic.id)) continue;
		if (every && topic.part === 'Requirements') {
			if (!labels.includes('requirements')) labels.push('requirements');
		} else labels.push(topic.label);
	}
	return labels.length > 0 ? `the ${listed(labels)}` : null;
}

/** What holding these jobs makes a person validate, or null when none of them validates anything. */
export function whatJobsValidate(jobIds: readonly string[], chosen: JobTopics = {}): string | null {
	return whatTopicsValidate(jobIds.flatMap((id) => topicsOfJob(id, chosen)));
}
