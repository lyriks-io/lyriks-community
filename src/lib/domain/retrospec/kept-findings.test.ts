import { describe, expect, it } from 'vitest';
import { createEmptyDataDraft } from '../data';
import { createEmptyExperienceDraft } from '../experience';
import { createEmptyFeaturesDraft } from '../features';
import { createEmptyRulesDraft } from '../rules';
import { registerIssueIdOf } from '../evolution/finding-drafts';
import type { Gap } from '../coherence';
import { finalCheckFindings, fixToConfirmFindings, keptIssueFindings, retrospecFindings } from './findings';

const P = 'p-1';
const issue = (id: string, over: object = {}) => ({
	id,
	kind: 'ambiguity' as const,
	title: `Issue ${id}`,
	detail: '',
	severity: 'major' as const,
	status: 'open' as const,
	ownerRoleId: null,
	resolutionNote: '',
	relatedRuleIds: [],
	relatedFeatureId: null,
	relatedJourneyId: null,
	autoDetected: false,
	sourceIds: [],
	...over
});

function input(issues: ReturnType<typeof issue>[]) {
	const features = createEmptyFeaturesDraft(P);
	features.features = [{ id: 'feat-1', name: 'Use my own domain', coreId: 'core-1', parentFamilyId: null, description: '', unspaghettitFeatureId: 'feat-1' }];
	const rules = { ...createEmptyRulesDraft(P), issues: issues as never };
	return { rules, features, data: createEmptyDataDraft(P), experience: createEmptyExperienceDraft(P), sources: [], authoredFeatureIds: ['feat-1'] };
}

describe('a point Lyriks noticed names itself to Project health and to its feature [criterion:e0f69b3c]', () => {
	it('carries the id Project health gives an issue, which a request names it by', () => {
		const [found] = retrospecFindings(input([issue('i-1', { kind: 'contradiction', relatedFeatureId: 'feat-1' })]));
		expect(found.gapIds).toEqual(['gap-rules-issue-conflict-i-1']);
		// The evolution side reads the same id back to the register's issue.
		expect(registerIssueIdOf(found.gapIds![0])).toBe('i-1');
		expect(found.featureId).toBe('feat-1');
		expect(found.blocking).toBeUndefined();
		// A critical contradiction holds the build gate, as Project health reads it.
		expect(retrospecFindings(input([issue('i-2', { kind: 'contradiction', severity: 'critical' })]))[0].blocking).toBe(true);
	});

	it('names no feature that the spec does not hold, and nothing to Project health for what it computes alone', () => {
		const [found] = retrospecFindings(input([issue('i-1', { relatedFeatureId: 'gone' })]));
		expect(found.featureId).toBeUndefined();
		const computed = retrospecFindings({ ...input([]), authoredFeatureIds: [] });
		expect(computed.map((f) => f.id)).toEqual(['computed:features-without-behavior']);
		expect(computed[0].gapIds).toBeUndefined();
	});

	it('names every gap a point of the final check stands for', () => {
		const gap = (id: string, subject: string): Gap =>
			({ id, checkId: 'behavior.model-check', title: 'The system shall always ensure that every Link has an address', subject, detail: 'Given nothing has happened yet', blocking: true }) as unknown as Gap;
		const [found] = finalCheckFindings([gap('g-1', 'Short links'), gap('g-2', 'Custom domains')]);
		expect(found.gapIds).toEqual(['g-1', 'g-2']);
	});

	it('lists the issues rejected from the Overview apart, and only those', () => {
		const kept = keptIssueFindings(
			input([
				issue('i-1', { status: 'resolved', resolutionNote: 'Kept as it is by Ana on 2026-11-01.', severity: 'minor' }),
				issue('i-2', { status: 'resolved', resolutionNote: 'Fixed by EVO-001.' }),
				issue('i-3'),
				issue('i-4', { status: 'resolved', resolutionNote: 'Kept as it is by Bo on 2026-11-01.' })
			])
		);
		expect(kept.map((f) => [f.id, f.tone])).toEqual([
			['issue:i-4', 'major'],
			['issue:i-1', 'minor']
		]);
		expect(retrospecFindings(input([issue('i-1', { status: 'resolved', resolutionNote: 'Kept as it is by Ana on 2026-11-01.' })]))).toEqual([]);
	});
});

describe('a fix waiting for confirmation reads apart [criterion:2a55c3e7]', () => {
	it('is no point to review: it reads under Fix to confirm with its note, and neither Reject nor a change is offered', () => {
		const issues = [issue('i-open'), issue('i-fix', { status: 'in_review', resolutionNote: 'Fixed: the page now refuses it.' })];
		expect(retrospecFindings(input(issues)).map((f) => f.id)).toEqual(['issue:i-open']);
		const [fix] = fixToConfirmFindings(input(issues));
		expect(fix).toMatchObject({ id: 'issue:i-fix', fix: { issueId: 'i-fix', note: 'Fixed: the page now refuses it.' } });
		expect(fix.decision).toBeUndefined();
		expect(fix.gapIds).toBeUndefined();
		expect(fix.sheet.kicker).toBe('FIX TO CONFIRM · AMBIGUITY');
		expect(fix.sheet.sections.map((s) => s.heading)).toEqual(['IN SHORT', 'NOTE', 'WHAT YOU CAN DO', 'WHERE YOU FIND IT AGAIN']);
	});
});

describe('every point says where its problem lies [criterion:c86ea441]', () => {
	it('reads an issue that cites the code as the product, one that does not as the specification', () => {
		const [fromCode, unsaid] = retrospecFindings(
			input([issue('i-code', { detail: 'The page refuses it.\n\nWhere the code says it: lyriks-platform:src/a.ts:3.' }), issue('i-spec', { detail: 'Nobody decided.' })])
		);
		expect(fromCode).toMatchObject({ origin: 'product', originLine: 'Something is wrong in the product as it ships: the code was read or tested doing it.' });
		expect(unsaid.origin).toBe('specification');
	});

	it('reads what Lyriks computes on the specification as the specification', () => {
		const computed = retrospecFindings({ ...input([]), authoredFeatureIds: [] });
		expect(computed.every((f) => f.origin === 'specification')).toBe(true);
	});
});
