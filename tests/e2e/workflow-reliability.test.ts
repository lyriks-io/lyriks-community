import { describe, expect, it } from 'vitest';
const BASE = process.env.V3_E2E_URL?.replace(/\/$/, '');
const PROJECT = process.env.V3_E2E_MUTATION_PROJECT;
const read = async (section: string) => {
	const res = await fetch(BASE + '/api/sections?projectId=' + PROJECT + '&section=' + section);
	expect(res.status).toBe(200);
	return res.json();
};
const save = (section: string, draft: unknown, revision: number) => fetch(BASE + '/api/draft/' + section, {
	method: 'PUT', headers: { 'content-type': 'application/json', 'x-lyriks-rev': String(revision) },
	body: JSON.stringify(draft)
});
describe.skipIf(!BASE || !PROJECT)('workflow reliability on an explicitly disposable project', () => {
	it('round trips decisions and evidence and rejects an old revision without overwriting', async () => {
		const initial = await read('documents');
		expect(Number.isInteger(initial.revision)).toBe(true);
		const source = { id: 'workflow-decision', title: 'Persistence decision', kind: 'requirement',
			url: '', note: 'Use the selected transaction store to protect inventory.',
			decision: { status: 'accepted' }, evidence: { kind: 'integration', result: 'passed',
				buildId: 'local-worktree', artifact: 'tests/e2e/workflow-reliability.test.ts',
				command: 'pnpm test:e2e', observedAt: new Date().toISOString(),
				provenance: 'isolated test fixture, not a production claim', criterionIds: ['test-only'] } };
		const body = { ...initial.draft, sources: [source], projectId: PROJECT };
		const written = await save('documents', body, initial.revision);
		expect(written.status).toBe(200);
		const current = await read('documents');
		expect(current.revision).toBeGreaterThan(initial.revision);
		expect(current.draft.sources).toEqual([source]);
		const stale = await save('documents', { ...body, sources: [] }, initial.revision);
		expect(stale.status).toBe(409);
		expect((await read('documents')).draft.sources).toEqual([source]);
	});
	it('persists logical design without requiring a technology name', async () => {
		const initial = await read('architecture');
		const written = await save('architecture', {
			...initial.draft, projectId: PROJECT, stage: 'logical', sourceIds: ['workflow-decision'],
			techChoices: [{ id: 'world-state', layer: 'backend', name: 'World simulation',
				role: 'Own persistent world state', version: '', description: '', referenceDocId: 'workflow-decision' }]
		}, initial.revision);
		expect(written.status).toBe(200);
		const reloaded = await read('architecture');
		expect(reloaded.draft.stage).toBe('logical');
		expect(reloaded.draft.techChoices[0].name).toBe('World simulation');
	});
});
