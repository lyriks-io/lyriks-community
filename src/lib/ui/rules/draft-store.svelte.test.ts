import { describe, expect, it } from 'vitest';
import { createIssue, type CandidateIssue } from '$domain/rules';
import { mergeScanFindings } from './draft-store.svelte';

const candidate = (key: string, title: string): CandidateIssue => ({
	key,
	kind: 'ambiguity',
	title,
	detail: '',
	severity: 'minor',
	relatedRuleIds: []
});

describe('mergeScanFindings', () => {
	it('recognises a keyed open issue written in another language: no retirement, no duplicate', () => {
		const stored = [createIssue({ title: 'What if “payment” fails in Checkout?', autoDetected: true, detectionKey: 'k1' })];
		const merged = mergeScanFindings(stored, [candidate('k1', 'Et si « paiement » échoue ?')], true);
		expect(merged).toMatchObject({ added: 0, retired: 0, keyed: 0 });
		expect(merged.issues).toEqual(stored);
	});

	it('gives an issue stored before the key existed the key of the finding its title matches', () => {
		const stored = [createIssue({ title: 'Define “soon” in Refunds', autoDetected: true })];
		const merged = mergeScanFindings(stored, [candidate('k2', 'Define “soon” in Refunds')], true);
		expect(merged).toMatchObject({ added: 0, retired: 0, keyed: 1 });
		expect(merged.issues[0]).toMatchObject({ id: stored[0].id, detectionKey: 'k2' });
	});

	it('retires a keyed issue the scan no longer reports, only when the engine answered', () => {
		const stored = [createIssue({ title: 'Old', autoDetected: true, detectionKey: 'gone' })];
		expect(mergeScanFindings(stored, [], false).issues).toHaveLength(1);
		expect(mergeScanFindings(stored, [], true)).toMatchObject({ issues: [], retired: 1 });
	});

	it('files a new finding with its key, and never touches authored issues', () => {
		const authored = createIssue({ title: 'Mine', autoDetected: false });
		const merged = mergeScanFindings([authored], [candidate('k3', 'New finding')], true);
		expect(merged.added).toBe(1);
		expect(merged.issues[0]).toBe(authored);
		expect(merged.issues[1]).toMatchObject({ title: 'New finding', autoDetected: true, detectionKey: 'k3' });
	});
});
