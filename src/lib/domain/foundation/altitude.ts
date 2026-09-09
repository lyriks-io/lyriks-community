/**
 * Foundation states the BET: the pain, the outcome, the numbers that prove it,
 * and what the business commits to. Executable behaviour — a scenario, a
 * capability, a validation, a screen mechanic — sits at a different altitude and
 * is owned by the Rules, Features and Experience contexts.
 *
 * Programmatic authors (an LLM driving the MCP) kept filling the Business tabs
 * with feature rules, and Foundation is the first page a customer reads. The
 * vocabulary that gives a feature rule away is declared once here so the same
 * policy can guard a write AND explain itself to the author, human or agent.
 *
 * Precision over recall on purpose: every pattern below must be one that a
 * genuine business signal ("adoption < 10% after 3 months") cannot match, so a
 * legitimate entry is never rejected. Contract phrasing is deliberately left
 * alone — an SLA clause reads nothing like a Gherkin scenario.
 */

/** The section that owns entries written at a lower altitude. */
export const ALTITUDE_TARGETS = {
	rules: 'the `rules` section (Features › Rules)',
	features: 'the `features` section (Features › Tree)',
	experience: 'the `experience` section (journeys and screens)'
} as const;

export interface AltitudeVerdict {
	/** Why the entry reads as executable behaviour rather than a business signal. */
	readonly reason: string;
	/** Where an entry of this shape belongs instead. */
	readonly belongsTo: string;
}

interface AltitudePattern {
	readonly test: RegExp;
	readonly verdict: AltitudeVerdict;
}

const PATTERNS: readonly AltitudePattern[] = [
	{
		test: /^\s*(given|when|then|and\s+(given|when|then)|scenario\s*[:#])\b/i,
		verdict: {
			reason: 'it is phrased as a Given/When/Then scenario',
			belongsTo: ALTITUDE_TARGETS.rules
		}
	},
	{
		test: /\bgiven\b[^.!?]{0,200}\bwhen\b[^.!?]{0,200}\bthen\b/i,
		verdict: {
			reason: 'it is phrased as a Given/When/Then scenario',
			belongsTo: ALTITUDE_TARGETS.rules
		}
	},
	{
		test: /^\s*as\s+an?\s+[^,]{1,60},\s*i\s+(want|need)\b/i,
		verdict: { reason: 'it is written as a user story', belongsTo: ALTITUDE_TARGETS.features }
	},
	{
		test: /\b(the\s+)?(users?|admins?|operators?)\s+(must|should|shall|can)\s+be\s+able\s+to\b/i,
		verdict: {
			reason: 'it states a capability a role gets; that is a feature, not a business signal',
			belongsTo: ALTITUDE_TARGETS.features
		}
	},
	{
		test: /^\s*(the\s+)?(system|application|api|endpoint|ui|screen|page|form|module|backend|frontend)\s+(shall|must|should|will)\s+\w/i,
		verdict: {
			reason: 'it states what the system must do: a functional requirement, not a business outcome',
			belongsTo: ALTITUDE_TARGETS.rules
		}
	},
	{
		test: /\b(clicks?\s+(on|the)\b|clicking\b|(the|a)\s+button\b|drop-?down\b|modal\b|dialog\b|tooltip\b|checkbox\b|input\s+field\b|text\s+field\b|placeholder\b|hovers?\s+over\b|error\s+message\b|validation\s+message\b|form\s+field\b)/i,
		verdict: {
			reason: 'it describes screen mechanics',
			belongsTo: ALTITUDE_TARGETS.experience
		}
	},
	{
		test: /\b(must\s+be\s+unique|max(imum)?\s+length|min(imum)?\s+length|regular\s+expression|regex|http\s+\d{3}|status\s+code|returns?\s+(a\s+)?[45]\d{2}|throws?\s+an?\s+error)\b/i,
		verdict: {
			reason: 'it describes field validation or an API contract',
			belongsTo: ALTITUDE_TARGETS.rules
		}
	}
];

/**
 * Classify one Foundation business entry. Returns `null` when it reads as a
 * business signal (the normal case) — only an unambiguous feature rule earns a
 * verdict.
 */
export function classifyBusinessAltitude(text: string): AltitudeVerdict | null {
	const value = text.trim();
	if (value.length === 0) return null;
	return PATTERNS.find((pattern) => pattern.test.test(value))?.verdict ?? null;
}

/**
 * The one-line contract an author must respect on the Foundation business
 * fields. Shared by the MCP `describe_section` hints and the write guard so both
 * say exactly the same thing.
 */
export const FOUNDATION_ALTITUDE_RULE =
	'Foundation is the HIGH-LEVEL page a customer reads first: the bet, the numbers that settle it, and what the business commits to. ' +
	'Never put feature rules here: no Given/When/Then scenarios, no user stories, no "the system shall …", no screen mechanics, no field validation. ' +
	'Those belong to the rules, features and experience sections, and the write is rejected if one lands here.';
