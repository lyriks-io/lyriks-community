import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, type EvolutionRequest } from './draft';
import { bringsCode, branchNameFor, codeReadingOf, codeReportRefusal, declareByHandRefusal, mergeRefusal, validationRefusal, withCodeReport, withoutCredentials, type CodeReport } from './code-branch';
import { verificationCodeRefusal } from './code-branch-acts';
import { declareByMergeAct, reportCodeStateAct, withValidation } from './code-branch-acts';
import { parseBranchHistory, parseCodeRepository, parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import type { ActContext } from './acts';

/** feat-evo-code-branch: the code of a request on its own branch, from start to merge. */

const ctx: ActContext = { actor: { id: 'ana', kind: 'ai_client', role: 'editor' } as never, at: '2026-10-29T10:00:00.000Z', newId: (() => { let n = 0; return () => `h${++n}`; })() };
const atBuild = (over: Partial<EvolutionRequest> = {}): EvolutionRequest => ({ ...createEvolutionRequest(), title: 'Fix the problems the retro-spec found', stage: 'implementation', status: 'open', ...over });
const report = (over: Partial<CodeReport> = {}): CodeReport => ({ branch: 'evo/EVO-001-fix-problems-retro-spec', baseCommit: '029da42aaaa', head: '938f12dbbbb', codeHead: '938f12dbbbb', clean: true, proofsChecked: 60, proofsOnOtherCommits: 0, ...over });
const expected = 'evo/EVO-001-fix-problems-retro-spec';

describe('a request names its branch [criterion:ac-leaf-ac-evo-branch-name]', () => {
	it('evo/<key>-<its title in a few words>, small words left out', () => {
		expect(branchNameFor('EVO-001', 'Fix the problems the retro-spec found')).toBe(expected);
		expect(branchNameFor('EVO-012', 'Créer une évolution')).toBe('evo/EVO-012-creer-evolution');
		expect(branchNameFor('EVO-003', '')).toBe('evo/EVO-003');
	});
	it('the reading gives the command that creates it, and nothing where no deployment branch is named [criterion:ac-leaf-ac-evo-branch-setting]', () => {
		expect(codeReadingOf(atBuild(), 'EVO-001', 'main')?.createCommand).toBe(`git switch -c ${expected} main`);
		expect(codeReadingOf(atBuild(), 'EVO-001', '')).toBeNull();
	});
});

describe('code is reported from the request branch only [criterion:ac-leaf-ac-evo-branch-derived]', () => {
	it('refuses the deployment branch, another branch, and a name Lyriks did not give', () => {
		expect(codeReportRefusal(atBuild(), 'main', expected, report({ branch: 'main' }))).toMatchObject({ ok: false, reason: `Code is never written on the deployment branch main: report it from ${expected}.` });
		expect(codeReportRefusal(atBuild(), 'main', expected, report({ branch: 'feature/x' }))).toMatchObject({ ok: false, reason: `This request's code is written on ${expected}.` });
		const bound = reportCodeStateAct(ctx, atBuild(), 'main', expected, report());
		expect(bound.ok).toBe(true);
		if (!bound.ok) return;
		expect(codeReportRefusal(bound.request, 'main', expected, report({ branch: 'evo/EVO-002-other' }))).toMatchObject({ ok: false, reason: `This request's code is on ${expected}: report it from there.` });
		expect(codeReportRefusal(atBuild({ stage: 'coherence' }), 'main', expected, report()).ok).toBe(false);
	});

	it('the first report binds the branch with where it started [criterion:ac-leaf-ac-evo-branch-start] [criterion:ac-leaf-ac-evo-branch-state]', () => {
		const bound = reportCodeStateAct(ctx, atBuild(), 'main', expected, report());
		expect(bound.ok && bound.request.code).toMatchObject({ branch: expected, baseCommit: '029da42aaaa', codeHead: '938f12dbbbb', clean: true });
		expect(bound.ok && bound.request.history.at(-1)?.summary).toBe(`Branch ${expected} bound, from main@029da42: last commit of code 938f12d`);
		// The same commit again moves nothing and says nothing.
		const again = bound.ok ? reportCodeStateAct(ctx, bound.request, 'main', expected, report()) : bound;
		expect(again.ok && again.request.history.length).toBe(bound.ok && bound.request.history.length);
	});
});

describe('validating fixes one commit [criterion:ac-leaf-ac-evo-branch-validate]', () => {
	const code = withCodeReport(undefined, report(), ctx.at).code;
	it('is refused with uncommitted code, a proof on another commit, or no code reported', () => {
		expect(validationRefusal(undefined, 'main')).toMatchObject({ ok: false, reason: "No code was reported from the request's branch yet." });
		expect(validationRefusal({ ...code, clean: false }, 'main')).toMatchObject({ ok: false, reason: 'The branch holds uncommitted code: commit it, run the tests again, then validate.' });
		expect(validationRefusal({ ...code, proofsOnOtherCommits: 2 }, 'main')).toMatchObject({ ok: false, reason: '2 proofs were taken on another commit: run the tests on 938f12d.' });
		expect(validationRefusal(code, 'main').ok).toBe(true);
		expect(validationRefusal(undefined, '').ok).toBe(true);
	});
	it('records the last commit of code as the validated one', () => {
		const validated = withValidation({ ...ctx, actor: { id: 'bo', kind: 'person', role: 'editor' } as never }, atBuild({ stage: 'acceptance', code }));
		expect(validated.code?.validated).toMatchObject({ commit: '938f12dbbbb', by: 'bo' });
	});
	it('a commit of code after the validation sets it aside [criterion:ac-leaf-ac-evo-branch-moved]', () => {
		const validated = { ...code, validated: { commit: '938f12dbbbb', at: ctx.at, by: 'bo' } };
		const moved = withCodeReport(validated, report({ codeHead: 'ccc3333', head: 'ccc3333' }), ctx.at);
		expect(moved.setAside).toBe(true);
		expect(moved.code.validationSetAside).toBe(true);
	});
});

describe('the merge declares the change live [criterion:ac-leaf-ac-evo-branch-merge]', () => {
	const validatedCode = { ...withCodeReport(undefined, report(), ctx.at).code, validated: { commit: '938f12dbbbb', at: ctx.at, by: 'bo' } };
	const approved = atBuild({ stage: 'delivered', code: validatedCode });
	const merge = { branch: expected, into: 'main', mergeCommit: 'm3r6e01xxx', containsValidated: true };
	it('is refused before the approval, into another branch, without the validated commit, or after the branch moved', () => {
		expect(mergeRefusal(atBuild({ stage: 'acceptance', code: validatedCode }), 'main', merge)).toMatchObject({ ok: false, reason: 'The merge comes once the change is approved.' });
		expect(mergeRefusal(approved, 'main', { ...merge, into: 'staging' })).toMatchObject({ ok: false, reason: 'The change is merged into main.' });
		expect(mergeRefusal(approved, 'main', { ...merge, containsValidated: false })).toMatchObject({ ok: false, reason: 'git says the validated commit 938f12d is not in this merge.' });
		expect(mergeRefusal(atBuild({ stage: 'delivered', code: { ...validatedCode, validationSetAside: true } }), 'main', merge)).toMatchObject({ ok: false, reason: 'The branch moved after the approval: approve the change again.' });
	});
	it('closes the request with its deployment and the merge commit', () => {
		const live = declareByMergeAct(ctx, approved, 'main', merge);
		expect(live.ok && live.request.status).toBe('closed');
		expect(live.ok && live.request.code?.merged).toMatchObject({ into: 'main', commit: 'm3r6e01xxx' });
		expect(live.ok && live.request.deployment?.note).toBe('Declared live by its merge into main@m3r6e01 (validated 938f12d)');
	});
	it('a person cannot declare live by hand while the branch is not merged', () => {
		expect(declareByHandRefusal(validatedCode, 'main')).toMatchObject({ ok: false, reason: "Merge the request's branch: its merge declares the change live." });
		expect(declareByHandRefusal(undefined, '').ok).toBe(true);
	});
});

describe('the code a branch reported stays the request\'s until its merge [criterion:ac-leaf-ac-evo-branch-not-outside]', () => {
	it('keeps when the first report bound the branch, whatever the reports after it', () => {
		const first = withCodeReport(undefined, report(), '2026-10-29T00:49:51.000Z').code;
		const later = withCodeReport(first, report({ codeHead: 'ccc3333', head: 'ccc3333' }), '2026-10-29T03:00:00.000Z').code;
		expect(first.boundAt).toBe('2026-10-29T00:49:51.000Z');
		expect(later).toMatchObject({ boundAt: '2026-10-29T00:49:51.000Z', reportedAt: '2026-10-29T03:00:00.000Z' });
		// A track written before the binding time was kept falls back on its first commit.
		const { boundAt: _dropped, ...older } = first;
		expect(withCodeReport(older, report(), '2026-10-29T05:00:00.000Z').code.boundAt).toBe(first.commits[0].at);
	});
	it('the merge keeps the code the branch brought, and it survives a save', () => {
		const validatedCode = { ...withCodeReport(undefined, report(), ctx.at).code, validated: { commit: '938f12dbbbb', at: ctx.at, by: 'bo' } };
		const merge = { branch: expected, into: 'main', mergeCommit: 'm3r6e01xxx', containsValidated: true };
		const brought = { 'f1|a1|rule:r1': "src/orders.js\t17\tif (hour >= 20) return refused('Closed');" };
		const live = declareByMergeAct(ctx, atBuild({ stage: 'delivered', code: validatedCode }), 'main', merge, brought);
		if (!live.ok) throw new Error(live.reason);
		expect(live.request.code?.merged?.code).toEqual(brought);
		const parsed = parseEvolutionDraft({ projectId: 'p', deploymentBranch: 'main', requests: [live.request] }, 'p');
		expect(parsed.requests[0].code).toEqual(live.request.code);
		// A merge that brought nothing writes no empty map.
		const plain = declareByMergeAct(ctx, atBuild({ stage: 'delivered', code: validatedCode }), 'main', merge);
		expect(plain.ok && plain.request.code?.merged && 'code' in plain.request.code.merged).toBe(false);
	});
});

describe('the cancelled request names the branch to delete [criterion:ac-leaf-ac-evo-branch-cancel]', () => {
	it('gives the command once cancelled', () => {
		const code = withCodeReport(undefined, report(), ctx.at).code;
		expect(codeReadingOf(atBuild({ status: 'cancelled', code }), 'EVO-001', 'main')?.deleteCommand).toBe(`git branch -D ${expected}`);
	});
});

describe('the track and the deployment branch survive a save', () => {
	it('reads back what it wrote', () => {
		const bound = reportCodeStateAct(ctx, atBuild(), 'main', expected, report());
		if (!bound.ok) throw new Error(bound.reason);
		const parsed = parseEvolutionDraft({ projectId: 'p', deploymentBranch: 'main', requests: [bound.request] }, 'p');
		expect(parsed.deploymentBranch).toBe('main');
		expect(parsed.requests[0].code).toEqual(bound.request.code);
	});
});

describe('the repository and the commits of the branch [criterion:ac-leaf-ac-evo-branch-repository] [criterion:ac-leaf-ac-evo-branch-history]', () => {
	const repository = { name: 'thedevs-network/kutt', url: 'https://github.com/thedevs-network/kutt.git' };
	const history = {
		count: 3,
		commits: [
			{ sha: '35f40ebccc', subject: 'EVO-001: record the proofs', author: 'Ana', at: '2026-10-29T00:40:00+02:00', code: false },
			{ sha: '938f12dbbbb', subject: 'EVO-001: fix the problems the retro-spec found', author: 'Ana', at: '2026-10-29T00:10:00+02:00', code: true }
		]
	};
	it('a report keeps the repository and git list; a report without them leaves what the request holds', () => {
		const first = withCodeReport(undefined, report({ repository, history }), ctx.at).code;
		expect(first.repository).toEqual(repository);
		expect(first.history).toEqual(history);
		const older = withCodeReport(first, report(), ctx.at).code;
		expect(older.repository).toEqual(repository);
		expect(older.history).toEqual(history);
		// git's new list replaces the one before.
		const moved = withCodeReport(first, report({ history: { count: 1, commits: [history.commits[1]] } }), ctx.at).code;
		expect(moved.history?.count).toBe(1);
	});
	it('the reading names the repository, counts the commits and lists them newest first', () => {
		const code = withCodeReport(undefined, report({ repository, history }), ctx.at).code;
		const reading = codeReadingOf(atBuild({ code }), 'EVO-001', 'main');
		expect(reading?.repository?.name).toBe('thedevs-network/kutt');
		expect(reading?.commitCount).toBe(3);
		expect(reading?.history.map((c) => c.sha)).toEqual(['35f40ebccc', '938f12dbbbb']);
		expect(codeReadingOf(atBuild(), 'EVO-001', 'main')).toMatchObject({ repository: null, commitCount: 0, history: [] });
	});
	it('credentials written in a remote never reach Lyriks', () => {
		expect(withoutCredentials('https://ana:ghp_s3cret@github.com/o/r.git')).toBe('https://github.com/o/r.git');
		expect(withoutCredentials('ssh://git@host:2222/o/r.git')).toBe('ssh://host:2222/o/r.git');
		expect(withoutCredentials('git@github.com:o/r.git')).toBe('git@github.com:o/r.git');
		expect(parseCodeRepository({ name: 'o/r', url: 'https://x-token:abc@gitlab.example/o/r.git' })).toEqual({ name: 'o/r', url: 'https://gitlab.example/o/r.git' });
		expect(parseCodeRepository({ name: '' })).toBeNull();
	});
	it('a listed commit is read only with a real id, and the count never says less than the list', () => {
		const parsed = parseBranchHistory({ count: 1, commits: [{ sha: 'not a sha', subject: 'x' }, { sha: '938f12d', subject: 'fix', author: 'Ana', at: '', code: true }, { sha: 'abcdef0', subject: 'index' , code: false }] });
		expect(parsed?.commits.map((c) => c.sha)).toEqual(['938f12d', 'abcdef0']);
		expect(parsed?.count).toBe(2);
		expect(parseBranchHistory({ count: 3 })).toBeNull();
	});
	it('survives a save', () => {
		const bound = reportCodeStateAct(ctx, atBuild(), 'main', expected, report({ repository, history }));
		if (!bound.ok) throw new Error(bound.reason);
		const parsed = parseEvolutionDraft({ projectId: 'p', deploymentBranch: 'main', requests: [bound.request] }, 'p');
		expect(parsed.requests[0].code?.repository).toEqual(repository);
		expect(parsed.requests[0].code?.history).toEqual(history);
	});
});

describe('a request that only settles findings brings no code [criterion:ac-leaf-ac-evo-branch-no-code]', () => {
	const finding = { id: 'finding:gap-a', findingId: 'gap-a', title: 'A', featureRef: null, blocking: false, outcome: 'fixed' as const, reason: '', sourceIds: [], materialisedAt: null };
	const settlesOnly = atBuild({ findingDrafts: [finding] });

	it('brings code as soon as it changes anything else, or settles no finding', () => {
		expect(bringsCode(settlesOnly)).toBe(false);
		expect(bringsCode(atBuild())).toBe(true);
		expect(bringsCode({ ...settlesOnly, ruleDrafts: [{ id: 'rules:x', summary: 's', operations: [], sourceIds: [], materialisedAt: null }] })).toBe(true);
		expect(bringsCode({ findingDrafts: [finding], proposals: [{ acceptedAt: '2026-10-30', canonicalSection: 'features' }] })).toBe(true);
		// An answer of the need is the request's own, not the product's spec.
		expect(bringsCode({ findingDrafts: [finding], proposals: [{ acceptedAt: '2026-10-30', canonicalSection: 'request' }] })).toBe(false);
	});

	it('validates its verification and is declared live by hand without a branch, where any other request waits for its merge', () => {
		expect(verificationCodeRefusal(settlesOnly, 'main').ok).toBe(true);
		expect(verificationCodeRefusal(atBuild(), 'main')).toMatchObject({ ok: false, reason: "No code was reported from the request's branch yet." });
		expect(declareByHandRefusal(undefined, 'main', false).ok).toBe(true);
		expect(declareByHandRefusal(undefined, 'main', true).ok).toBe(false);
		expect(codeReadingOf(settlesOnly, 'EVO-002', 'main')).toBeNull();
		expect(codeReadingOf(atBuild(), 'EVO-002', 'main')).not.toBeNull();
	});
});
