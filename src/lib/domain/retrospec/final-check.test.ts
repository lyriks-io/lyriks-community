import { describe, expect, it } from 'vitest';
import { finalCheckOutcome } from './summary';
import { failedCheckFindings, finalCheckFindings } from './findings';

// Owner feedback 2026-10-27: a summary showing 100 % found in the code read as
// complete while the final check was blocked; the person must be told.
describe('what the final check could not confirm', () => {
	const entry = (performedAt: string, blockingIssues: number, failedChecks: string[], score = 97) => ({ performedAt, score, blockingIssues, failedChecks });

	it('says nothing when the last check of the run confirmed everything, or none ran', () => {
		expect(finalCheckOutcome([], null)).toBeNull();
		expect(finalCheckOutcome([entry('2026-10-27T14:00:00.000Z', 0, [], 100)], null)).toBeNull();
	});

	it('names each failed check in plain words, from the newest check of the run', () => {
		const log = [entry('2026-10-27T14:26:00.000Z', 1, ['coherence']), entry('2026-10-27T12:00:00.000Z', 3, ['sections', 'audit'], 60)];
		expect(finalCheckOutcome(log, null)).toEqual({ score: 97, blocking: 1, reasons: ['Project health: some rules Lyriks checked do not hold in every feature'], failedChecks: ['coherence'] });
		// A check older than the run says nothing about it.
		expect(finalCheckOutcome([entry('2026-10-26T10:00:00.000Z', 2, ['data'])], '2026-10-27T09:00:00.000Z')).toBeNull();
	});

	it('still says something when the failed checks were not recorded', () => {
		expect(finalCheckOutcome([entry('2026-10-27T14:00:00.000Z', 2, [])], null)?.reasons).toEqual(['Some checks did not pass']);
	});
});

// Owner feedback 2026-10-27: the blocking points go to What Lyriks noticed, readable without asking the AI.
describe('the blocking points of the final check, as findings', () => {
	const proven = (subject: string, step: string, field = 'an address') => ({
		id: `unspa-proven-${subject}`,
		checkId: 'behavior.model-check',
		severity: 'high' as const,
		blocking: true,
		sourceStep: 'features',
		subject,
		title: `The system shall always ensure that While a Link exists, the system shall ensure that it has ${field}..`,
		detail: `Given nothing has happened yet, when ${step}, then "While a Link exists, the system shall ensure that it has ${field}." no longer holds.`,
		action: 'Refuse the last step in that case, or stop an earlier step from letting it through.'
	});

	it('gathers one rule broken in several features into one finding that names them and the breaking step', () => {
		const findings = finalCheckFindings([proven('Manage my links', 'See my links'), proven('Moderate links', 'Edit any link (target "")'), proven('Manage my links', 'See my links', 'a target')]);
		expect(findings.map((f) => f.text)).toEqual(['Not confirmed: every Link has an address (2 features)', 'Not confirmed: every Link has a target (1 feature)']);
		const sheet = findings[0].sheet;
		expect(sheet.sections.find((s) => s.heading === 'WHERE IT APPLIES')?.list).toEqual([
			{ k: 'Manage my links', v: 'breaks after "See my links"' },
			{ k: 'Moderate links', v: 'breaks after "Edit any link"' }
		]);
		// Broken from the start: a description gap, said as such, with nothing to change in the product.
		expect(sheet.sections.find((s) => s.heading === 'IN SHORT')?.text).toContain('does not hold from the very start');
		expect(sheet.sections.find((s) => s.heading === 'WHAT YOU CAN DO')?.text).toContain('Nothing to change in the product');
	});

	it('reads a point as the requirement the check holds, with how far it reaches and its description on hover [criterion:ad34b2f4]', () => {
		const [point] = finalCheckFindings([proven('Manage my links', 'See my links'), proven('Moderate links', 'Edit any link')]);
		expect(point.ears).toBe('While a Link exists, the system shall ensure that it has an address');
		expect(point.reach).toBe('2 features');
		expect(point.hint).toContain('The specification says every Link has an address');
	});

	it('keeps any other blocking point in its own words, and ignores what does not block', () => {
		const other = { id: 'g1', severity: 'high' as const, blocking: true, sourceStep: 'users', title: 'Feature with no user right', detail: 'Nobody may use it.', action: 'Grant it to a role' };
		const findings = finalCheckFindings([other, { ...other, id: 'g2', blocking: false }]);
		expect(findings).toHaveLength(1);
		expect(findings[0].sheet.sections.find((s) => s.heading === 'WHAT YOU CAN DO')?.text).toBe('Grant it to a role');
	});

	it('turns the other failed checks into findings, project health aside', () => {
		expect(failedCheckFindings(['coherence', 'sections']).map((f) => f.text)).toEqual(['Not confirmed: some parts of the specification were not reviewed']);
	});
});
