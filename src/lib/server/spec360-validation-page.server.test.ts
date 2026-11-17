import { describe, expect, it } from 'vitest';
import type { RetrospecDocument } from '$domain/retrospec';
import { trimmed } from './spec360-validation-page.server';

const verdict = { title: 'A long element name', tab: 'features', validatedBy: [{ id: 'ada', name: 'Ada' }], flag: null };
const doc = {
	version: 1,
	comments: { a: [] },
	runs: [{ id: 'r1', verdicts: { 'rule:f:1': verdict }, codeAtValidation: { 'src/a.ts': 'hash' }, publishedAt: null, baselineId: null }]
} as unknown as RetrospecDocument;

describe('the validation document a page reads', () => {
	it('keeps who validated each element, what the board and the buttons read', () => {
		const run = trimmed(doc).runs[0];
		expect(run.verdicts['rule:f:1'].validatedBy).toEqual(verdict.validatedBy);
		expect(run.verdicts['rule:f:1'].flag).toBeNull();
	});

	it('leaves on the server what only the server reads', () => {
		const run = trimmed(doc).runs[0];
		expect(run.codeAtValidation).toBeUndefined();
		expect(run.verdicts['rule:f:1'].title).toBe('');
		expect(JSON.stringify(trimmed(doc))).not.toContain('A long element name');
	});

	it('keeps the changes made by hand, which the marks and the Code drift band read [criterion:956cb2ac] [criterion:7b21b4a6]', () => {
		const edited = { ...doc, specEdits: { 'rule:f:1': { implemented: false, by: { id: 'ada', name: 'Ada' }, at: '2026-11-09T00:00:00.000Z' } } } as unknown as RetrospecDocument;
		expect(trimmed(edited).specEdits).toEqual(edited.specEdits);
		expect('specEdits' in trimmed(doc)).toBe(false);
	});

	it('does not change the stored document', () => {
		trimmed(doc);
		expect(doc.runs[0].verdicts['rule:f:1'].title).toBe('A long element name');
		expect(doc.runs[0].codeAtValidation).toEqual({ 'src/a.ts': 'hash' });
	});

	it('keeps additional review requests and an explicit absent lead through the page projection [criterion:3b1c77a6] [criterion:787a9fec]', () => {
		const request = { to: { id: 'tech@company.test', name: 'Tech' }, by: { id: 'lead@company.test', name: 'Lead' }, at: '2026-11-13T00:00:00.000Z', title: 'Stack' };
		const incoming = { ...doc, validationRequests: { 'stack:a': [request] }, runs: [{ ...doc.runs[0], validationLead: null }] };
		expect(trimmed(incoming).validationRequests).toEqual(incoming.validationRequests);
		expect(trimmed(incoming).runs[0].validationLead).toBeNull();
	});
});
