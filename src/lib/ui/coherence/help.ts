import type { HelpEntry } from '$ui/design-system';

/**
 * Plain-language definitions for the Maturity page's four readings plus the
 * per-step "local coherence" concept. Authored as `HelpEntry` objects so the
 * shared `HelpTip` renders them the same way everywhere. No scoring is redefined
 * here — this only explains the existing scores in words a product manager reads
 * without opening technical docs.
 */
export const SCORE_HELP = {
	coverage: {
		title: 'Coverage',
		what: 'Breadth: how much of the expected specification is present and connected. It is the average completeness across every area except behavior maturity.',
		value: 'A high Coverage with low Coherence means the spec is filled in but the pieces disagree; a low Coverage means whole areas are still empty.'
	},
	coherence: {
		title: 'Coherence',
		what: 'Correctness: whether the parts of the spec agree with each other. It drops when the checks find contradictions, gaps, or ambiguities across areas.',
		value: 'This is where AI hallucinations die: a coherent spec gives generation a single, non-contradictory source of truth.'
	},
	readiness: {
		title: 'Build readiness',
		what: 'Buildability: whether the specification has enough structural coverage and behavior depth to hand to implementation. It is the composite score used by the generation threshold.',
		value: 'Build Readiness is a gate, not a maturity reading. Blocking Coherence issues can still prevent generation when this score is high.'
	},
	maturity: {
		title: 'Behavior maturity',
		what: 'Depth: how far the authored product behavior has progressed, read as one of five spec maturity stages (Idea, Outlined, Specified, Simulated, Complete). It measures the spec only; whether code exists is the implementation coverage.',
		value: 'Use Behavior Maturity to see whether features have real surfaces, actions, rules, scenarios, and evidence rather than structural shells.'
	},
	localCoherence: {
		title: 'Local coherence',
		what: 'The same correctness check, scoped to a single step such as Foundation or Users. Each step shows its own local coherence in its save bar.',
		value: 'Fix problems where they are authored: the global Coherence on this page is the whole-spec roll-up of every step’s local coherence.'
	}
} as const satisfies Record<string, HelpEntry>;

/**
 * The coexistence explainer the platform review asks to show "prominently":
 * strong Readiness and critical Coherence are not a contradiction.
 */
export const READINESS_VS_COHERENCE: HelpEntry = {
	title: 'Readiness vs Coherence',
	what: 'These two scores are independent. Build Readiness measures whether enough structure and behavior are present; Coherence measures whether those parts agree. A spec can be ready in breadth and depth while still containing contradictions.',
	how: [
		'Read Build Readiness to decide if there is enough detail to build.',
		'Read Coherence to decide if that detail is self-consistent.',
		'Resolve critical Coherence issues before generating, even when Readiness is strong.'
	]
};
