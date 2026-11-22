/**
 * What a section names its elements, in the plural, with the singular each one reads under a count of one: written
 * out for every kind, never built by dropping a final "s" ("1 technology", not "1 technologie"). The section controls
 * of Knowledge and of a change's Specification say how many elements they validate with it.
 */
const ONE = {
	actions: 'action',
	changes: 'change',
	components: 'component',
	constraints: 'constraint',
	'core features': 'core feature',
	'data facts': 'data fact',
	elements: 'element',
	facts: 'fact',
	features: 'feature',
	findings: 'finding',
	'health facts': 'health fact',
	journeys: 'journey',
	profiles: 'profile',
	requirements: 'requirement',
	rules: 'rule',
	technologies: 'technology',
	terms: 'term',
	users: 'user'
} as const;

/** The elements of a section, as it names them in the plural. */
export type SectionElements = keyof typeof ONE;

/** `count` elements of a section in words: "1 technology", "3 technologies", "0 rules". */
export const countOf = (count: number, what: SectionElements): string => `${count} ${count === 1 ? ONE[what] : what}`;
