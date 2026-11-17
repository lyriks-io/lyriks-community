import { describe, expect, it } from 'vitest';
import { createEmptyDefinitionDraft, type FoundationDefinitionDraft } from './definition';
import { answeredSecurityQuestions, securityAnswersAfterSave, withSecurityAnswer } from './security-answers';

const P = 'p1';
const saved = (over: Partial<FoundationDefinitionDraft['security']> = {}): FoundationDefinitionDraft => {
	const d = createEmptyDefinitionDraft(P);
	return { ...d, security: { ...d.security, ...over }, lastSavedAt: '2026-11-03T00:00:00.000Z' };
};

/** Each security question keeps its own answered mark [issues.232]. */
describe('the answered security questions', () => {
	it('answers nothing on a definition never saved', () => {
		expect(answeredSecurityQuestions(createEmptyDefinitionDraft(P))).toEqual([]);
	});

	it('reads an older definition by its values: only what differs from the default is an answer', () => {
		expect(answeredSecurityQuestions(saved())).toEqual([]);
		expect(answeredSecurityQuestions(saved({ auditLogs: 'complete' }))).toEqual(['auditLogs']);
		expect(answeredSecurityQuestions(saved({ authorization: 'abac' }))).toEqual(['authorization']);
	});

	it('keeps what was answered once it is kept apart', () => {
		expect(answeredSecurityQuestions(saved({ answered: ['auditLogs'] }))).toEqual(['auditLogs']);
		expect(answeredSecurityQuestions(saved({ auditLogs: 'complete', answered: [] }))).toEqual([]);
	});

	it('answers nothing when a save writes the stored values back', () => {
		const stored = saved({ answered: [] });
		expect(securityAnswersAfterSave(stored, { ...stored, technical: { ...stored.technical, availability: 'Business hours' } })).toEqual([]);
		expect(securityAnswersAfterSave(null, createEmptyDefinitionDraft(P))).toEqual([]);
	});

	it('answers what a save names or changes, and never takes an answer back', () => {
		const stored = saved({ answered: ['authorization'] });
		expect(securityAnswersAfterSave(stored, { ...stored, security: withSecurityAnswer(stored.security, 'auditLogs') })).toEqual(['auditLogs', 'authorization']);
		expect(securityAnswersAfterSave(saved({ answered: [] }), saved({ auditLogs: 'none' }))).toEqual(['auditLogs']);
		expect(securityAnswersAfterSave(stored, { ...stored, security: { ...stored.security, answered: [] } })).toEqual(['authorization']);
	});
});
