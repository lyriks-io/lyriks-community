import { describe, expect, it } from 'vitest';
import { momentOf, nextStepsOf, stepNow } from './next-steps';

/** What happens next once the verification has nothing left open [criterion:ac-leaf-ac-evo-verd-next-steps]. */

const code = {
	deploymentBranch: 'main',
	expectedBranch: 'evo/EVO-001-fix',
	branch: 'evo/EVO-001-fix',
	codeHead: '6767ffac7ded',
	validatedCommit: null,
	validatedAt: null,
	mergedCommit: null,
	mergedInto: null,
	mergedAt: null
};
const at = (stage: string, over: Partial<Parameters<typeof nextStepsOf>[0]> = {}) =>
	nextStepsOf({ stage, status: 'open', gateOk: true, awaited: [], approvedBy: [], code, closedAt: null, landed: null, heldEntries: 0, mcpUrl: 'https://lyriks.example/mcp', ...over });

describe('what happens next on the verification [criterion:ac-leaf-ac-evo-verd-next-steps]', () => {
	it('says nothing while points are open, before the Build or once cancelled', () => {
		expect(at('implementation', { gateOk: false })).toBeNull();
		expect(at('coherence')).toBeNull();
		expect(at('acceptance', { status: 'cancelled' })).toBeNull();
	});

	it('walks acceptance, approval, then the merge, one step now', () => {
		const states = (stage: string, status = 'open') => at(stage, { status })?.steps.map((s) => `${s.id}:${s.state}`);
		expect(states('implementation')).toEqual(['accept:now', 'approve:later', 'live:later']);
		expect(states('acceptance')).toEqual(['accept:done', 'approve:now', 'live:later']);
		expect(states('delivered')).toEqual(['accept:done', 'approve:done', 'live:now']);
		expect(states('delivered', 'closed')).toEqual(['accept:done', 'approve:done', 'live:done']);
		expect(stepNow(at('delivered', { status: 'closed' }))).toBeNull();
	});

	it('names the commit acceptance fixes, nothing official yet', () => {
		expect(stepNow(at('implementation'))?.text).toBe('Closes the verification and fixes the commit it validates: 6767ffa on evo/EVO-001-fix. Nothing is official yet.');
	});

	it('says who still signs the approval', () => {
		expect(stepNow(at('acceptance', { awaited: ['Bo', 'Ana'] }))?.text).toBe('Walk the change as its users would, then approve it: Bo, Ana still to sign.');
	});

	it('with a deployment branch, ends on the merge and its commands, never on closing by hand', () => {
		const next = at('delivered', { code: { ...code, validatedCommit: '6767ffac7ded' } });
		expect(stepNow(next)).toMatchObject({ id: 'live', title: 'Merge into main' });
		expect(stepNow(next)?.text).toContain('the validated commit 6767ffa is in it');
		expect(next?.commands).toEqual(['git switch main', 'git merge --no-ff evo/EVO-001-fix', 'node .lyriks/tools/report-merge.mjs --branch evo/EVO-001-fix --url https://lyriks.example/mcp']);
	});

	it('without one, ends on closing the evolution', () => {
		const next = at('delivered', { code: null });
		expect(stepNow(next)).toMatchObject({ id: 'live', title: 'Close the evolution' });
		expect(next?.commands).toBeNull();
		expect(stepNow(at('implementation', { code: null }))?.text).toBe('Closes the verification. Nothing is official yet.');
	});
});

/** Once a step is done it says what it did, and once live what comes next [criterion:ac-leaf-ac-evo-verd-next-steps-done]. */

const validatedAt = '2026-10-29T00:10:55.181Z';
const mergedAt = '2026-10-29T15:41:02.553Z';
const merged = { ...code, validatedCommit: '6767ffac7ded', validatedAt, mergedCommit: '4426ba511abd', mergedInto: 'main', mergedAt };
const landed = { changes: '14 features changed, 1 table changed', version: { from: 'v1', to: 'v2' }, specHref: '/projects/kutt/spec', check: null };
const live = (over: Partial<Parameters<typeof nextStepsOf>[0]> = {}) =>
	at('delivered', { status: 'closed', code: merged, approvedBy: ['Ana'], closedAt: mergedAt, landed, heldEntries: 2, ...over });

describe('what happened, then what comes next [criterion:ac-leaf-ac-evo-verd-next-steps-done]', () => {
	it('a step done reads in the past tense with its facts, never that nothing is official yet', () => {
		const [accept, approve] = at('delivered', { code: { ...merged, mergedCommit: null }, approvedBy: ['Ana', 'Bo'] })?.steps ?? [];
		expect(accept).toMatchObject({ title: 'Verification closed', text: `Closed on ${momentOf(validatedAt)}: it validated 6767ffa on evo/EVO-001-fix.` });
		expect(approve).toMatchObject({ title: 'Change approved', text: 'Approved by Ana, Bo.' });
		for (const step of live()?.steps ?? []) expect(step.text).not.toContain('Nothing is official yet');
	});

	it('the merge says the commit it made, when, and what became official', () => {
		const next = live();
		expect(next?.live).toBe(true);
		expect(next?.steps[2]).toMatchObject({ title: 'Merged into main', state: 'done' });
		expect(next?.steps[2].text).toBe(
			`evo/EVO-001-fix merged into main@4426ba5 on ${momentOf(mergedAt)}, with the validated commit 6767ffa in it. Now official in the specification: 14 features changed, 1 table changed (specification v1 → v2). The request is closed as live.`
		);
	});

	it('closed by hand, it says when it was declared live and what became official', () => {
		const step = live({ code: null, landed: { ...landed, version: null } })?.steps[2];
		expect(step).toMatchObject({ title: 'Evolution closed', text: `Declared live on ${momentOf(mergedAt)}. Now official in the specification: 14 features changed, 1 table changed.` });
	});

	it('once live: sync the index again, delete the merged branch, open the specification', () => {
		const after = live()?.after ?? [];
		expect(after.map((s) => s.id)).toEqual(['sync', 'branch', 'spec']);
		expect(after[0].command).toBe('node .lyriks/tools/sync-index.mjs --url https://lyriks.example/mcp');
		expect(after[1]).toMatchObject({ title: 'Delete evo/EVO-001-fix', command: 'git branch -d evo/EVO-001-fix' });
		expect(after[2]).toMatchObject({ href: '/projects/kutt/spec', text: 'It now holds the change, as v2.' });
		expect(live({ code: null })?.after.map((s) => s.id)).toEqual(['sync', 'spec']);
	});

	it('nothing comes next before it is live', () => {
		expect(at('delivered')?.live).toBe(false);
		expect(at('delivered')?.after).toEqual([]);
	});
});

describe('the step that made it official carries the landing check [criterion:ac-leaf-ac-evo-verd-landed-check]', () => {
	it('shows what was found, by merge or by hand', () => {
		const check = { carried: 3, found: 2, missing: [{ where: 'Manage users', what: 'The field addedByAdmin is not in the table.' }] };
		expect(live({ landed: { ...landed, check } })?.steps[2].check).toEqual(check);
		expect(live({ code: null, landed: { ...landed, check } })?.steps[2].check).toEqual(check);
		expect(live()?.steps[2].check).toBeUndefined();
	});
});

describe('each git or index step carries the brief its AI gets [criterion:ac-leaf-ac-evo-verd-steps-to-ai]', () => {
	it('the merge, once approved with a validated commit, hands the three commands and never pushes', () => {
		const merge = stepNow(at('delivered', { code: { ...code, validatedCommit: '6767ffac7ded' } }));
		expect(merge?.handOff?.step).toBe('merge');
		expect(merge?.handOff?.brief.split('\n')).toEqual([
			'Merge the branch of this evolution into main in my checkout of the repository, then report the merge:',
			'git switch main',
			'git merge --no-ff evo/EVO-001-fix',
			'node .lyriks/tools/report-merge.mjs --branch evo/EVO-001-fix --url https://lyriks.example/mcp',
			'Lyriks makes the change official once it finds the validated commit 6767ffa in the merge, and report-merge.mjs then syncs the implementation index. Never push.'
		]);
		expect(stepNow(at('delivered'))?.handOff).toBeUndefined();
	});

	it('once live, syncing the index and deleting the branch are handed over with their command', () => {
		const [sync, branch] = live()?.after ?? [];
		expect(sync.handOff).toEqual({ step: 'sync', brief: 'The change of this evolution is live: sync the implementation index again from main.\nnode .lyriks/tools/sync-index.mjs --url https://lyriks.example/mcp' });
		expect(branch.handOff?.step).toBe('branch');
		expect(branch.handOff?.brief).toContain('git branch -d evo/EVO-001-fix');
		expect(branch.handOff?.brief).toContain('Never force it with -D.');
	});
});

describe('the sync the merge report made is never offered again [criterion:ac-leaf-ac-evo-branch-merge-syncs]', () => {
	it('offers syncing the index only while the request still holds entries', () => {
		expect(live({ heldEntries: 0 })?.after.map((s) => s.id)).toEqual(['branch', 'spec']);
		const sync = live({ heldEntries: 2 })?.after[0];
		expect(sync?.id).toBe('sync');
		expect(sync?.text).toBe('Lyriks sends the index again from main: the 2 entries held while the request was open then resolve against the official specification.');
	});

	it('the merge says its report syncs the index, and so does the brief its AI gets', () => {
		const merge = stepNow(at('delivered', { code: { ...code, validatedCommit: '6767ffac7ded' } }));
		expect(merge?.text).toContain('and the report syncs the index');
		expect(merge?.handOff?.brief).toContain('report-merge.mjs then syncs the implementation index');
	});
});
