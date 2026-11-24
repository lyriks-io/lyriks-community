import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The helper ships to customer repositories as a file, so it is exercised as
// one: a child process in a throwaway repository, never an import.
const helper = new URL('./git-state.mjs', import.meta.url).href;
const call = (cwd: string, expression: string) =>
	JSON.parse(execFileSync('node', ['--input-type=module', '-e', `import * as g from ${JSON.stringify(helper)}; console.log(JSON.stringify(${expression}));`], { cwd, encoding: 'utf8' }));
const git = (cwd: string, args: string[]) => execFileSync('git', ['-c', 'user.name=Ana', '-c', 'user.email=ana@t.test', ...args], { cwd, encoding: 'utf8' }).trim();

let dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs = [];
});
function repo(): string {
	const dir = mkdtempSync(join(tmpdir(), 'lyriks-git-state-'));
	dirs.push(dir);
	mkdirSync(join(dir, 'src'));
	writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1;\n');
	git(dir, ['init', '-q', '-b', 'main']);
	git(dir, ['add', '-A']);
	git(dir, ['commit', '-qm', 'start']);
	return dir;
}

describe('git-state names the repository [criterion:ac-leaf-ac-evo-branch-repository]', () => {
	it('owner/name from the remote, its credentials taken out', () => {
		const dir = repo();
		git(dir, ['remote', 'add', 'origin', 'https://ana:ghp_s3cret@github.com/thedevs-network/kutt.git']);
		expect(call(dir, 'g.repositoryOf(process.cwd())')).toEqual({ name: 'thedevs-network/kutt', url: 'https://github.com/thedevs-network/kutt.git' });
		git(dir, ['remote', 'set-url', 'origin', 'git@gitlab.example:group/sub/app.git']);
		expect(call(dir, 'g.repositoryOf(process.cwd())').name).toBe('sub/app');
	});
	it('the folder name when the checkout has no remote', () => {
		const dir = repo();
		expect(call(dir, 'g.repositoryOf(process.cwd())')).toEqual({ name: dir.split('/').at(-1), url: null });
	});
});

describe('git-state lists the commits of the branch [criterion:ac-leaf-ac-evo-branch-history]', () => {
	it('every commit since the start, newest first, the index-only ones marked', () => {
		const dir = repo();
		const base = git(dir, ['rev-parse', 'HEAD']);
		git(dir, ['switch', '-qc', 'evo/EVO-1-boost']);
		writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 2;\n');
		git(dir, ['commit', '-qam', 'fix: a is two']);
		writeFileSync(join(dir, '.unspa.json'), '{}\n');
		git(dir, ['add', '.unspa.json']);
		git(dir, ['commit', '-qm', 'record the proofs']);
		const history = call(dir, `g.branchHistory(process.cwd(), ${JSON.stringify(base)})`);
		expect(history.count).toBe(2);
		expect(history.commits.map((c: { subject: string; code: boolean; author: string }) => [c.subject, c.code, c.author])).toEqual([
			['record the proofs', false, 'Ana'],
			['fix: a is two', true, 'Ana']
		]);
		expect(call(dir, 'g.branchHistory(process.cwd(), null)')).toBeNull();
	});
});

describe('git-state reads the branch to suggest as the deployment branch [criterion:396e62e3]', () => {
	it('the default branch of origin first', () => {
		const dir = repo();
		const remote = mkdtempSync(join(tmpdir(), 'lyriks-git-remote-'));
		dirs.push(remote);
		git(remote, ['init', '-q', '--bare', '-b', 'trunk']);
		git(dir, ['branch', '-m', 'trunk']);
		git(dir, ['remote', 'add', 'origin', remote]);
		git(dir, ['push', '-q', 'origin', 'trunk']);
		git(dir, ['remote', 'set-head', 'origin', 'trunk']);
		expect(call(dir, 'g.defaultBranchOf(process.cwd())')).toEqual({ branch: 'trunk', why: 'the default branch of origin' });
	});
	it('the main branch of a checkout with no remote, and nothing where git names none', () => {
		const dir = repo();
		expect(call(dir, 'g.defaultBranchOf(process.cwd())')).toEqual({ branch: 'main', why: 'the main branch of the checkout' });
		git(dir, ['branch', '-m', 'work']);
		expect(call(dir, 'g.defaultBranchOf(process.cwd())')).toBeNull();
	});
});
