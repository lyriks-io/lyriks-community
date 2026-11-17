import type { Gap } from '../coherence';
import { checkById } from '../coherence';
import { PROVENANCE_META } from '../coherence/incoherence';
import type { IssueKind } from '../rules';
import { ISSUE_KINDS } from '../rules';

/**
 * The type of a point What Lyriks noticed lists, and what that type means
 * (criterion 4996a6b4): the list groups its points by type, and the type's
 * title explains itself on hover, so "Dead end" or "Missing from the
 * specification" is never a word left for the reader to guess. Never an empty meaning: a type Lyriks
 * knows nothing more about says which check raised it, or at least who says
 * so. Pure.
 */

export interface FindingKind {
	/** The type's title, as the reader reads it ("Dead end", "Missing from the specification"), whatever words its check used. */
	readonly label: string;
	/** What a point of this type means, in a sentence or two. */
	readonly meaning: string;
}

const clean = (s: string | null | undefined) => (s ?? '').trim();

/**
 * The title a type reads under, written for the reader (criterion 72cb0b50).
 * Each check names its points in its own shorthand ("Criterion testing no
 * feature", "Code", "Not reached"): the title the reader sees is written here
 * once, whichever check raised the type. A type not listed keeps its check's
 * words, which are already plain ("Missing rule", "Dead end").
 */
const TYPE_TITLE: Readonly<Record<string, string>> = {
	// The rules register.
	'Unhandled edge': 'Failure with no behavior described',
	'Dead rule': 'Rule that never applies',
	'Unreachable state': 'State nothing reaches',
	Overlap: 'Rules that say the same thing',
	// The behavior engine and its solver.
	'Not reached': 'Action or goal never reached',
	Broken: 'Statement a step can break',
	'Invariant violation': 'Statement a step can break',
	Impossible: 'Statement nothing can satisfy',
	'Always refused': 'Action always refused',
	'Hidden rule': 'Rule hidden by another',
	'Fails its own checks': 'Feature failing its own scenarios',
	'Scenario failure': 'Scenario that fails',
	'Spec gap': 'Behavior too thin to check',
	'Not proven': 'Feature the solver could not check',
	'Dead action': 'Action with no effect',
	'Unreachable goal': 'Goal nothing reaches',
	Capped: 'Not checked yet',
	'Semantic inconsistency': 'Texts that disagree',
	// Project health.
	Completeness: 'Missing from the specification',
	Code: 'Not confirmed by the code',
	Coherence: 'Other point to review',
	// The features, the experience plan, the permissions and the glossary.
	'No feature': 'No feature yet',
	'Behavior not authored': 'Feature without behavior',
	'Behavior record missing': 'Feature whose behavior was lost',
	'Criterion testing no feature': 'Criterion attached to no feature',
	'Screen no step visits': 'Screen no journey step opens',
	'Journey without a screen': 'Journey on no screen',
	'Plan coverage': 'Journey on no screen',
	'Step without a screen': 'Journey step without a screen',
	'Step that says nothing': 'Journey step that says nothing',
	'Step without action': 'Journey step without an action',
	'Core without a journey': 'Core feature no journey covers',
	'Role without a journey': 'Role no journey serves',
	'Unused entity': 'Table no journey step reads',
	'No journey': 'No journey yet',
	'Prose in another language': 'Text in another language',
	'Feature with no user right': 'Feature no profile is granted',
	'Ungranted capability': 'Capability nobody is granted',
	'Matrix not compared': 'Permissions not checked against the rules',
	'Matrix and behaviour disagree': 'Permissions the rules contradict',
	'Term in draft': 'Glossary term still in draft',
	// The coarse kinds a gap falls back on.
	Misalignment: 'Parts that disagree',
	'Broken reference': 'Link to something gone',
	Orphan: 'Part nothing uses',
	Missing: 'Something missing'
};

/** The reader's title for the words a check gave its type. */
export const typeTitle = (label: string): string => TYPE_TITLE[label] ?? label;

/** What each kind of issue of the rules register means. */
const ISSUE_MEANINGS: Readonly<Record<IssueKind, string>> = {
	contradiction: 'Two rules of the specification disagree: they cannot both hold, so a person decides which one says the right behavior.',
	missing_rule: 'A case the product meets that no rule decides: nobody said what should happen, so the code would decide by accident.',
	ambiguity: 'A rule or a term that reads two ways: two people building from it could build two different products.',
	overlap: 'Two rules say the same thing: the day one changes and the other does not, they contradict each other.',
	dead_rule: 'A rule that can never apply: its condition never holds, so it is a leftover or a condition written wrong.',
	unreachable_state: 'A state the specification describes that nothing can bring the product into.',
	unhandled_edge: 'A failure the product can meet with no behavior described for it: what a person sees when it happens is left to chance.'
};

export function issueKind(kind: IssueKind | string): FindingKind {
	const known = ISSUE_KINDS.find((k) => k.code === kind);
	return {
		label: typeTitle(known?.label ?? kind),
		meaning: ISSUE_MEANINGS[kind as IssueKind] ?? 'An issue recorded in the rules register: a decision about the product that still waits for a person.'
	};
}

export const FINAL_CHECK_KIND: FindingKind = {
	label: 'Could not be confirmed',
	meaning:
		'What the final check could not confirm. Lyriks plays every feature step by step and checks each rule after each step; a point here is a rule it could not show holds, and it blocks the project health until it is settled.'
};

export const UNRELATED_TABLES_KIND: FindingKind = {
	label: 'Table related to nothing',
	meaning: 'Tables no other table points at and that point at none: either the product never uses them, or the specification has not captured how they relate yet.'
};

/** The type a check of the catalogue raises, named by the emitter's label: what the check verifies says what breaking it means. */
export function checkKind(label: string, checkId: string): FindingKind {
	const check = checkById(checkId);
	if (!check) return { label: typeTitle(label), meaning: PROVENANCE_META.detected.means };
	return { label: typeTitle(label), meaning: `${PROVENANCE_META[check.provenance].means} The check: ${check.label}. Each point here is a place where it does not hold yet.` };
}

/** The type of a gap of the project health: its emitter's own meaning first, then the check that raised it, then who says so. */
export function gapKind(gap: Gap): FindingKind {
	const label = typeTitle(clean(gap.kindLabel) || 'Coherence');
	const own = clean(gap.kindMeaning);
	if (own) return { label, meaning: own };
	if (gap.checkId && checkById(gap.checkId)) return checkKind(label, gap.checkId);
	return { label, meaning: `${PROVENANCE_META[gap.provenance ?? 'detected'].means} It weighs on the project health until it is settled.` };
}
