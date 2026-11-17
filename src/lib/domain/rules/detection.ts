import type { IssueKind, IssueSeverity } from './enums';
import type { ConsolidatedRule } from './draft';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

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

/**
 * The same hidden decisions, as French prose writes them. Matched as whole
 * words, since short French words hide inside longer ones ("vite" in "évite").
 */
const VAGUE_TERMS_FR = [
	'heures ouvrées',
	'heures ouvrables',
	'dès que possible',
	'au plus vite',
	'bientôt',
	'rapidement',
	'vite',
	'lent',
	'lente',
	'plusieurs',
	'beaucoup',
	'certains',
	'certaines',
	'quelques',
	'récemment',
	'raisonnable',
	'environ',
	'approximativement',
	'à peu près',
	'plus tard',
	'etc',
	'et ainsi de suite',
	'grand',
	'grande',
	'petit',
	'petite'
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

/**
 * French negation markers, matched as whole words ("ne" hides in "une"), plus
 * the elided "n'" of "n'est", "n'a".
 */
const NEGATION_TOKENS_FR = ['ne', 'pas', 'jamais', 'sans', 'aucun', 'aucune', 'interdit', 'interdite', 'impossible'];
const ELIDED_NEGATION_FR = /(^|[^\p{L}])n['’]\p{L}/u;

/** French names of the external touchpoints above (the English ones still apply: API, SMS, Stripe). */
const EXTERNAL_KEYWORDS_FR = [
	'paiement',
	'carte',
	'e-mail',
	'courriel',
	'téléversement',
	'téléchargement',
	'exportation',
	'importation',
	'synchronisation',
	'service tiers',
	'intégration',
	'facture',
	'remboursement'
];

/** French words of more than four letters that name no subject. */
const STOPWORDS_FR = new Set([
	'après', 'avant', 'toujours', 'jamais', 'chaque', 'comme', 'dans', 'depuis', 'doivent',
	'doit', 'encore', 'entre', 'leurs', 'lorsque', 'lorsqu', 'peuvent', 'peut', 'quand',
	'cette', 'celui', 'celle', 'ceux', 'selon', 'aussi', 'ainsi', 'autre', 'autres', 'avoir',
	'être', 'faire', 'étape', 'étapes', 'règle', 'règles', 'pendant', 'puis', 'alors',
	'toute', 'toutes', 'votre', 'notre', 'leur', 'même', 'moins', 'plus', 'tous', 'sont',
	'était', 'seront', 'serait', 'pourrait', 'devrait', 'donc', 'parce', 'plutôt', 'vraiment'
]);

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

function salientTokens(s: string, lang: SpecLanguage): Set<string> {
	if (lang === 'fr')
		return new Set(
			norm(s)
				.replace(/[^\p{L}0-9\s]/gu, ' ')
				.split(/\s+/)
				.filter((w) => w.length > 4 && !STOPWORDS.has(w) && !STOPWORDS_FR.has(w))
		);
	return new Set(
		norm(s)
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((w) => w.length > 4 && !STOPWORDS.has(w))
	);
}

function hasNegation(s: string, lang: SpecLanguage): boolean {
	const n = norm(s);
	if (lang === 'fr')
		return ELIDED_NEGATION_FR.test(n) || NEGATION_TOKENS_FR.some((t) => containsWords(n, t));
	return NEGATION_TOKENS.some((t) => n.includes(t));
}

/** Whether `term` appears in `hay` as whole words (letters with accents included). */
function containsWords(hay: string, term: string): boolean {
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, 'u').test(hay);
}

/**
 * Split prose into clauses. A negation only contradicts a shared subject when
 * both sit in the SAME clause: "members can invite guests, but never edit
 * billing" negates billing, not invitations.
 */
function clauses(s: string, lang: SpecLanguage): string[] {
	const splitter =
		lang === 'fr'
			? /[.;:!?]|\bmais\b|\bcependant\b|\btoutefois\b|\balors que\b|\bsauf\b/
			: /[.;:!?]|\bbut\b|\bhowever\b|\bwhereas\b|\bexcept\b/;
	return norm(s)
		.split(splitter)
		.map((c) => c.trim())
		.filter(Boolean);
}

/**
 * Does `text` negate `token` LOCALLY — is there a clause that both mentions the
 * token and carries a negation marker? Testing the whole rule (the previous
 * behavior) meant one stray "never" anywhere flipped its polarity for every
 * token in it.
 */
function negatesLocally(text: string, token: string, lang: SpecLanguage): boolean {
	return clauses(text, lang).some((c) => c.includes(token) && hasNegation(c, lang));
}

/**
 * Run every heuristic over the inventory and return the de-duplicated set of
 * candidate issues.
 */
export function detectIssues(
	inventory: ConsolidatedRule[],
	lang: SpecLanguage = 'en'
): CandidateIssue[] {
	const say = detectionTexts(lang);
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
		const terms = lang === 'fr' ? VAGUE_TERMS_FR : VAGUE_TERMS;
		for (const term of terms) {
			if (lang === 'fr' ? containsWords(hay, term) : hay.includes(term)) {
				push({
					key: `ambiguity::${rule.id}::${term}`,
					kind: 'ambiguity',
					title: say.ambiguityTitle(term, rule.label),
					detail: say.ambiguityDetail(term, rule.statement),
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
	const tokensById = new Map(business.map((r) => [r.id, salientTokens(text(r), lang)]));
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
				(w) => negatesLocally(text(a), w, lang) !== negatesLocally(text(b), w, lang)
			);
			if (!subject) continue;
			push({
				key: `contradiction::${[a.id, b.id].sort().join('::')}`,
				kind: 'contradiction',
				title: say.conflictTitle(a.label, b.label),
				detail: say.conflictDetail(subject, shared.slice(0, 3)),
				severity: 'major',
				relatedRuleIds: [a.id, b.id]
			});
		}
	}

	// H3 — Unhandled edge: a journey touching an external system with no failure rule.
	for (const rule of inventory.filter((r) => r.source === 'journey')) {
		const hay = norm(text(rule));
		const hit =
			(lang === 'fr' ? EXTERNAL_KEYWORDS_FR.find((k) => containsWords(hay, k)) : undefined) ??
			EXTERNAL_KEYWORDS.find((k) => hay.includes(k));
		if (hit) {
			push({
				key: `unhandled_edge::${rule.id}::${hit}`,
				kind: 'unhandled_edge',
				title: say.edgeTitle(hit, rule.label),
				detail: say.edgeDetail(hit, rule.statement),
				severity: 'major',
				relatedRuleIds: [rule.id]
			});
		}
	}

	return out;
}

/**
 * The candidate issues' titles and details in the spec's language. The rule
 * labels, statements and words they quote are kept as they are; the English
 * texts are the historical ones, byte for byte.
 */
interface DetectionTexts {
	ambiguityTitle(term: string, label: string): string;
	ambiguityDetail(term: string, statement: string): string;
	conflictTitle(a: string, b: string): string;
	conflictDetail(subject: string, shared: string[]): string;
	edgeTitle(hit: string, label: string): string;
	edgeDetail(hit: string, statement: string): string;
}

const EN_DETECTION: DetectionTexts = {
	ambiguityTitle: (term, label) => `Define “${term}” in ${label || 'a rule'}`,
	ambiguityDetail: (term, statement) =>
		`“${term}” appears in: “${statement}”. Pin down exactly what it means before the build interprets it.`,
	conflictTitle: (a, b) => `Possible conflict: ${a || 'rule A'} vs ${b || 'rule B'}`,
	conflictDetail: (subject, shared) =>
		`Both rules talk about “${subject}” (shared terms: ${shared.join(', ')}) and one appears to forbid what the other allows. Lexical match only; confirm before treating it as a conflict, and raise it to critical if it is one.`,
	edgeTitle: (hit, label) => `What if “${hit}” fails in ${label || 'this journey'}?`,
	edgeDetail: (hit, statement) =>
		`“${statement}” relies on ${hit}. Describe what happens on failure/decline/timeout; that path is usually left unspecified.`
};

const q = (name: string) => quoteName('fr', name);

const FR_DETECTION: DetectionTexts = {
	ambiguityTitle: (term, label) => `Définir ${q(term)} dans ${label ? q(label) : 'une règle'}`,
	ambiguityDetail: (term, statement) =>
		`${q(term)} apparaît dans${NBSP}: ${q(statement)}. Précisez exactement ce que cela veut dire avant que la réalisation ne l'interprète.`,
	conflictTitle: (a, b) => `Conflit possible${NBSP}: ${a ? q(a) : 'règle A'} contre ${b ? q(b) : 'règle B'}`,
	conflictDetail: (subject, shared) =>
		`Les deux règles parlent de ${q(subject)} (termes communs${NBSP}: ${shared.join(', ')}) et l'une semble interdire ce que l'autre permet. Simple correspondance lexicale${NBSP}; confirmez-le avant de le traiter comme un conflit, et passez-le en critique si c'en est un.`,
	edgeTitle: (hit, label) => `Et si ${q(hit)} échoue dans ${label ? q(label) : 'ce parcours'}${NBSP}?`,
	edgeDetail: (hit, statement) =>
		`${q(statement)} dépend de ${q(hit)}. Décrivez ce qui se passe en cas d'échec, de refus ou de délai dépassé${NBSP}; ce chemin reste souvent non spécifié.`
};

const detectionTexts = (lang: SpecLanguage): DetectionTexts => (lang === 'fr' ? FR_DETECTION : EN_DETECTION);

const EDGE_TITLE_EN = /^What if “(.+)” fails in (.+)\?$/s;
const EDGE_TITLE_FR = new RegExp(`^Et si (.+) échoue dans (.+?)${NBSP}?\\?$`, 's');

/**
 * A missing failure path this detection raised, as the unwanted-behaviour
 * requirement it leaves open: "If “payment” fails in Checkout, then the system
 * shall …", the response being what nobody has decided (criterion ad34b2f4).
 * Read off the title the detection wrote, in either language, so an issue
 * stored before its key existed reads the same; null for any other title.
 */
export function earsOfDetectedEdge(title: string): string | null {
	const text = title.trim();
	const en = EDGE_TITLE_EN.exec(text);
	if (en) return `If “${en[1]}” fails in ${en[2]}, then the system shall …`;
	const fr = EDGE_TITLE_FR.exec(text);
	if (fr) return `Si ${fr[1]} échoue dans ${fr[2]}, alors le système doit …`;
	return null;
}
