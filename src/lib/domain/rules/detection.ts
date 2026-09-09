import type { IssueKind, IssueSeverity } from './enums';
import type { ConsolidatedRule } from './draft';

/**
 * Local, deterministic heuristics that surface candidate issues from the rule
 * inventory — the v3 stand-in for the Rust DPO engine's contradiction/gap
 * analysis. Intentionally conservative: every hit is a *candidate* the team
 * reviews, never an auto-resolution. Each carries a stable `key` so the
 * use-case can skip ones already on the board.
 */
export interface CandidateIssue {
	key: string;
	kind: IssueKind;
	title: string;
	detail: string;
	severity: IssueSeverity;
	relatedRuleIds: string[];
}

/** Words that almost always hide an undefined decision. */
const VAGUE_TERMS = [
	'business hours',
	'asap',
	'as soon as possible',
	'soon',
	'quickly',
	'fast',
	'slow',
	'several',
	'many',
	'some',
	'a few',
	'recently',
	'reasonable',
	'approximately',
	'roughly',
	'later',
	'etc',
	'and so on',
	'large',
	'small'
];

/** Negation markers used to spot two rules that may pull in opposite directions. */
const NEGATION_TOKENS = ['no ', 'not ', 'never', 'without', 'cannot', "can't", "won't", 'forbidden', 'disallow'];

/** External touchpoints whose failure path is easy to forget. */
const EXTERNAL_KEYWORDS = [
	'payment',
	'stripe',
	'card',
	'api',
	'email',
	'sms',
	'webhook',
	'upload',
	'download',
	'export',
	'import',
	'sync',
	'third-party',
	'third party',
	'integration',
	'invoice',
	'refund'
];

const STOPWORDS = new Set([
	'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'on', 'in', 'is', 'are', 'be', 'by',
	'with', 'must', 'should', 'can', 'will', 'rule', 'when', 'then', 'all', 'any', 'this',
	'that', 'each', 'per', 'via', 'after', 'before', 'than', 'every',
	// Generic prose that names no subject. A mandatory-description culture
	// produces a lot of it, and pairing rules on these words is what made H2 fire
	// on two dozen unrelated journeys ('steps', 'shared', 'actually', 'guardian').
	'actually', 'about', 'above', 'again', 'against', 'along', 'already', 'also',
	'although', 'always', 'among', 'another', 'because', 'been', 'being', 'below',
	'between', 'both', 'could', 'define', 'described', 'description', 'does',
	'during', 'either', 'enough', 'especially', 'exactly', 'first', 'from',
	'further', 'given', 'goes', 'here', 'however', 'into', 'instead', 'itself',
	'just', 'keep', 'kept', 'last', 'later', 'least', 'less', 'like', 'made',
	'make', 'making', 'many', 'more', 'most', 'much', 'need', 'needs',
	'next', 'once', 'only', 'onto', 'other', 'others', 'over', 'own', 'part',
	'possible', 'rather', 'really', 'same', 'says', 'since', 'some', 'something',
	'step', 'steps', 'still', 'such', 'sure', 'take', 'takes', 'their', 'them',
	'there', 'these', 'they', 'thing', 'things', 'those', 'through', 'together',
	'toward', 'under', 'until', 'upon', 'used', 'uses', 'using', 'usually',
	'very', 'want', 'wants', 'well', 'were', 'what', 'where', 'whether', 'which',
	'while', 'whole', 'whose', 'would', 'your'
]);

/**
 * How many salient tokens two rules must share before H2 will even consider
 * them related. One shared word is noise; two about the same subject is a
 * signal worth a human look.
 */
const MIN_SHARED_SUBJECTS = 2;

function norm(s: string): string {
	return s.toLowerCase();
}

function salientTokens(s: string): Set<string> {
	return new Set(
		norm(s)
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((w) => w.length > 4 && !STOPWORDS.has(w))
	);
}

function hasNegation(s: string): boolean {
	const n = norm(s);
	return NEGATION_TOKENS.some((t) => n.includes(t));
}

/**
 * Split prose into clauses. A negation only contradicts a shared subject when
 * both sit in the SAME clause: "members can invite guests, but never edit
 * billing" negates billing, not invitations.
 */
function clauses(s: string): string[] {
	return norm(s)
		.split(/[.;:!?]|\bbut\b|\bhowever\b|\bwhereas\b|\bexcept\b/)
		.map((c) => c.trim())
		.filter(Boolean);
}

/**
 * Does `text` negate `token` LOCALLY — is there a clause that both mentions the
 * token and carries a negation marker? Testing the whole rule (the previous
 * behavior) meant one stray "never" anywhere flipped its polarity for every
 * token in it.
 */
function negatesLocally(text: string, token: string): boolean {
	return clauses(text).some((c) => c.includes(token) && hasNegation(c));
}

/**
 * Run every heuristic over the inventory and return the de-duplicated set of
 * candidate issues.
 */
export function detectIssues(inventory: ConsolidatedRule[]): CandidateIssue[] {
	const out: CandidateIssue[] = [];
	const seen = new Set<string>();
	const push = (c: CandidateIssue) => {
		if (seen.has(c.key)) return;
		seen.add(c.key);
		out.push(c);
	};

	const text = (r: ConsolidatedRule) => `${r.label} ${r.statement}`;

	// H1 — Ambiguity: a vague term hiding an undefined decision.
	for (const rule of inventory) {
		const hay = norm(text(rule));
		for (const term of VAGUE_TERMS) {
			if (hay.includes(term)) {
				push({
					key: `ambiguity::${rule.id}::${term}`,
					kind: 'ambiguity',
					title: `Define “${term}” in ${rule.label || 'a rule'}`,
					detail: `“${term}” appears in: “${rule.statement}”. Pin down exactly what it means before the build interprets it.`,
					severity: 'minor',
					relatedRuleIds: [rule.id]
				});
			}
		}
	}

	// H2 — Contradiction: two business rules disagree about the SAME subject.
	//
	// This is a lexical heuristic over prose, so it cannot prove a contradiction
	// — and it used to be rated `critical`, which put it straight onto the
	// completion gate (see `can-advance` and `coherence`). Because descriptions
	// are mandatory and good ones are rewarded, better prose produced MORE
	// blockers: one build reported ~two dozen blocking "conflicts" pairing
	// unrelated journeys on shared English words. That is a perverse incentive
	// sitting directly on the gate.
	//
	// So: demand real evidence, and never block on a guess.
	//   • at least MIN_SHARED_SUBJECTS shared salient tokens, so one incidental
	//     word is not a conflict;
	//   • the negation must be LOCAL to a shared token (same clause), not merely
	//     present somewhere in the rule;
	//   • severity is `major` — prominent on the Issues board, but a human decides
	//     whether it is real and escalates it. Only an authored critical blocks.
	const business = inventory.filter((r) => r.category === 'business');
	const tokensById = new Map(business.map((r) => [r.id, salientTokens(text(r))]));
	for (let i = 0; i < business.length; i++) {
		for (let j = i + 1; j < business.length; j++) {
			const a = business[i];
			const b = business[j];
			// Two rules restating one source are not two rules in conflict.
			if (a.sourceRefId && a.sourceRefId === b.sourceRefId) continue;
			const tb = tokensById.get(b.id)!;
			const shared = [...tokensById.get(a.id)!].filter((w) => tb.has(w));
			if (shared.length < MIN_SHARED_SUBJECTS) continue;
			// The disagreement must be ABOUT a shared subject: one rule negates it
			// in the clause that mentions it, the other does not.
			const subject = shared.find(
				(w) => negatesLocally(text(a), w) !== negatesLocally(text(b), w)
			);
			if (!subject) continue;
			push({
				key: `contradiction::${[a.id, b.id].sort().join('::')}`,
				kind: 'contradiction',
				title: `Possible conflict: ${a.label || 'rule A'} vs ${b.label || 'rule B'}`,
				detail: `Both rules talk about “${subject}” (shared terms: ${shared.slice(0, 3).join(', ')}) and one appears to forbid what the other allows. Lexical match only; confirm before treating it as a conflict, and raise it to critical if it is one.`,
				severity: 'major',
				relatedRuleIds: [a.id, b.id]
			});
		}
	}

	// H3 — Unhandled edge: a journey touching an external system with no failure rule.
	for (const rule of inventory.filter((r) => r.source === 'journey')) {
		const hay = norm(text(rule));
		const hit = EXTERNAL_KEYWORDS.find((k) => hay.includes(k));
		if (hit) {
			push({
				key: `unhandled_edge::${rule.id}::${hit}`,
				kind: 'unhandled_edge',
				title: `What if “${hit}” fails in ${rule.label || 'this journey'}?`,
				detail: `“${rule.statement}” relies on ${hit}. Describe what happens on failure/decline/timeout; that path is usually left unspecified.`,
				severity: 'major',
				relatedRuleIds: [rule.id]
			});
		}
	}

	return out;
}
