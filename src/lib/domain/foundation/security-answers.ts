import { createEmptyDefinitionDraft, type FoundationDefinitionDraft, type SecurityDefinition, type SecurityQuestion } from './definition';

/**
 * Which security questions of the definition were answered, one by one
 * (issues.232). The definition keeps the audit level and the authorization
 * model beside the response times and the availability notes, so "the
 * definition was saved" is no answer: setting a performance target saved it
 * with the form's defaults in place. Pure.
 */

export const SECURITY_QUESTIONS: readonly SecurityQuestion[] = ['auditLogs', 'authorization'];

const DEFAULTS: SecurityDefinition = createEmptyDefinitionDraft('').security;

/**
 * The questions answered. A definition saved before the answers were kept
 * apart counts a value other than the default as answered: a default kept
 * and a default chosen cannot be told apart there.
 */
export function answeredSecurityQuestions(definition: FoundationDefinitionDraft): SecurityQuestion[] {
	const kept = definition.security.answered;
	if (kept) return SECURITY_QUESTIONS.filter((q) => kept.includes(q));
	if (definition.lastSavedAt === null) return [];
	return SECURITY_QUESTIONS.filter((q) => definition.security[q] !== DEFAULTS[q]);
}

export const isSecurityAnswered = (definition: FoundationDefinitionDraft, question: SecurityQuestion): boolean =>
	answeredSecurityQuestions(definition).includes(question);

/**
 * The answers a save leaves over what is stored: an answer once given stays
 * given; the save answers the questions it names (a person picked them, the
 * default included) and those whose value it changes. Writing the stored value
 * back, as a save of anything else does, answers nothing.
 */
export function securityAnswersAfterSave(stored: FoundationDefinitionDraft | null, incoming: FoundationDefinitionDraft): SecurityQuestion[] {
	const before = stored ? answeredSecurityQuestions(stored) : [];
	const named = incoming.security.answered ?? [];
	const reference = stored?.security ?? DEFAULTS;
	return SECURITY_QUESTIONS.filter((q) => before.includes(q) || named.includes(q) || incoming.security[q] !== reference[q]);
}

/** The security with one more question answered. */
export function withSecurityAnswer(security: SecurityDefinition, question: SecurityQuestion): SecurityDefinition {
	const answered = security.answered ?? [];
	return answered.includes(question) ? security : { ...security, answered: [...answered, question] };
}
