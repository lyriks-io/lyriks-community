import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The script ships to customer repositories as a file, so it is exercised as
// one: a child process in a throwaway repository, never an import.
const script = fileURLToPath(new URL('./ingest-results.mjs', import.meta.url));

type Entry = { file?: string; line?: number; signature?: string; status?: string; verifiedAt?: string; verifiedScenarios?: number };
type ActionRow = { key: string; actionId: string; passed: number; total: number; verified: boolean; outcome: string };
type Report = {
	indexFile: string | null;
	dryRun: boolean;
	written: boolean;
	stampedAt: string | null;
	tested: number;
	verified: number;
	stamped: number;
	cleared: number;
	unindexed: string[];
	actions: ActionRow[];
};

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const located: Entry = { file: 'src/boost.ts', line: 10, signature: 'export function applyBoost(car: Car) {', status: 'implemented' };

/** A throwaway repository holding an index written the way the engine writes it. */
function repo(index: Record<string, Entry> | null, indent: string | number = 2) {
	const dir = mkdtempSync(join(tmpdir(), 'lyriks-ingest-results-'));
	dirs.push(dir);
	if (index) {
		const doc = { format: 'unspaghettit-index', version: 1, projectId: 'vector-rally', index };
		writeFileSync(join(dir, '.unspa.json'), JSON.stringify(doc, null, indent) + '\n');
	}
	return dir;
}

/** A jest-shaped report (what `vitest run --reporter=json` writes) from `[title, status]` pairs. */
function reportFile(dir: string, tests: Array<[title: string, status: string]>, name = 'report.json') {
	const report = {
		numTotalTests: tests.length,
		testResults: [
			{
				name: join(dir, 'tests/boost.spec.ts'),
				assertionResults: tests.map(([title, status]) => ({ title, fullName: `boost ${title}`, status }))
			}
		]
	};
	writeFileSync(join(dir, name), JSON.stringify(report));
	return name;
}

function run(cwd: string, args: string[]) {
	try {
		return { status: 0, stdout: execFileSync('node', [script, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }), stderr: '' };
	} catch (error) {
		const failed = error as { status?: number | null; stdout?: string; stderr?: string };
		return { status: failed.status ?? 1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
	}
}

const json = (cwd: string, args: string[]) => {
	const result = run(cwd, [...args, '--json']);
	return { status: result.status, report: JSON.parse(result.stdout) as Report };
};

const readIndex = (dir: string) =>
	(JSON.parse(readFileSync(join(dir, '.unspa.json'), 'utf8')) as { index: Record<string, Entry> }).index;

const token = (action: string, scenario: string) => `[unspa:srf-race:${action}:${scenario}]`;

describe('ingest-results.mjs (test results come back into the index)', () => {
	it('stamps verifiedAt on an action whose every result passed, and touches nothing else', () => {
		const dir = repo({ 'action:act-boost': located, 'rule:r1': { file: 'src/boost.ts', line: 3, signature: 'if (car.fuel <= 0)' } }, '\t');
		const file = reportFile(dir, [
			[`${token('act-boost', 'scn-1')} boosts a fuelled car`, 'passed'],
			[`${token('act-boost', 'scn-2')} refuses an empty tank`, 'passed'],
			['a test of the team, without a token', 'failed']
		]);
		const before = Date.now();
		const { status, report } = json(dir, [file]);

		expect(status).toBe(0);
		expect(report).toMatchObject({ tested: 1, verified: 1, stamped: 1, cleared: 0, unindexed: [], written: true });
		expect(report.actions).toEqual([
			expect.objectContaining({ key: 'action:act-boost', passed: 2, total: 2, verified: true, outcome: 'stamped' })
		]);
		const index = readIndex(dir);
		expect(index['action:act-boost']).toMatchObject({ ...located, verifiedScenarios: 2 });
		const stampedAt = Date.parse(index['action:act-boost'].verifiedAt!);
		expect(index['action:act-boost'].verifiedAt).toBe(new Date(stampedAt).toISOString());
		expect(stampedAt).toBeGreaterThanOrEqual(before);
		expect(index['rule:r1']).toEqual({ file: 'src/boost.ts', line: 3, signature: 'if (car.fuel <= 0)' });
		// The file keeps the indentation it was written with.
		expect(readFileSync(join(dir, '.unspa.json'), 'utf8')).toContain('\n\t"index"');
	});

	it('removes a verifiedAt that a failing result made stale, and never stamps a partly passing action', () => {
		const dir = repo({
			'action:act-boost': { ...located, verifiedAt: '2026-09-01T08:00:00.000Z', verifiedScenarios: 2 },
			'action:act-brake': located
		});
		const file = reportFile(dir, [
			[`${token('act-boost', 'scn-1')} boosts a fuelled car`, 'passed'],
			[`${token('act-boost', 'scn-2')} refuses an empty tank`, 'failed'],
			[`${token('act-brake', 'scn-3')} brakes`, 'failed']
		]);
		const { status, report } = json(dir, [file]);

		// A failing test is recorded, never an error of the script: it does not gate.
		expect(status).toBe(0);
		expect(report).toMatchObject({ tested: 2, verified: 0, stamped: 0, cleared: 1, written: true });
		expect(report.actions.map((action) => [action.key, action.passed, action.total, action.outcome])).toEqual([
			['action:act-boost', 1, 2, 'cleared'],
			['action:act-brake', 0, 1, 'failing']
		]);
		const index = readIndex(dir);
		expect(index['action:act-boost']).toEqual(located);
		expect(index['action:act-brake']).toEqual(located);
	});

	it('reports a passing action that has no index entry and never creates one', () => {
		const dir = repo({ 'action:act-boost': located });
		const before = readFileSync(join(dir, '.unspa.json'), 'utf8');
		const file = reportFile(dir, [[`${token('act-ghost', 'scn-9')} does something unlocated`, 'passed']]);

		const { status, report } = json(dir, [file]);
		expect(status).toBe(0);
		expect(report).toMatchObject({ stamped: 0, cleared: 0, unindexed: ['act-ghost'], written: false });
		expect(report.actions[0]).toMatchObject({ key: 'action:act-ghost', outcome: 'unindexed' });
		expect(readFileSync(join(dir, '.unspa.json'), 'utf8')).toBe(before);

		const text = run(dir, [file]).stdout;
		expect(text).toContain('action:act-ghost  1/1 passed  passing but not in the index');
		expect(text).toContain('1 passing but not in the index');
	});

	it('writes nothing on --dry-run and still says what it would do', () => {
		const dir = repo({ 'action:act-boost': located });
		const before = readFileSync(join(dir, '.unspa.json'), 'utf8');
		const file = reportFile(dir, [[`${token('act-boost', 'scn-1')} boosts`, 'passed']]);

		const { status, report } = json(dir, [file, '--dry-run']);
		expect(status).toBe(0);
		expect(report).toMatchObject({ dryRun: true, stamped: 1, written: false });
		expect(readFileSync(join(dir, '.unspa.json'), 'utf8')).toBe(before);
		expect(run(dir, [file, '--dry-run']).stdout).toContain('(dry run: nothing written)');
	});

	it('prints passed over total per action and a one-line summary', () => {
		const dir = repo({ 'action:act-boost': located });
		const file = reportFile(dir, [[`${token('act-boost', 'scn-1')} boosts`, 'passed']]);
		const lines = run(dir, [file]).stdout.trimEnd().split('\n');
		expect(lines[0]).toBe('action:act-boost  1/1 passed  verifiedAt stamped');
		expect(lines[1]).toContain('1 actions tested, 1 fully passing, 0 with failures; 1 stamped, 0 cleared, 0 passing but not in the index.');
		expect(lines).toHaveLength(2);
	});

	it('finds the index from a subfolder, walking up', () => {
		const dir = repo({ 'action:act-boost': located });
		mkdirSync(join(dir, 'packages/game'), { recursive: true });
		const file = reportFile(dir, [[`${token('act-boost', 'scn-1')} boosts`, 'passed']]);
		const { status, report } = json(join(dir, 'packages/game'), [join(dir, file)]);
		expect(status).toBe(0);
		expect(report.stamped).toBe(1);
		expect(readIndex(dir)['action:act-boost'].verifiedAt).toBeDefined();
	});

	it('reads the token from the title like the engine, and from fullName only when there is no title', () => {
		const dir = repo({ 'action:act-boost': located, 'action:act-brake': located });
		writeFileSync(
			join(dir, 'report.json'),
			JSON.stringify({
				testResults: [
					{
						assertionResults: [
							{ fullName: `boost ${token('act-boost', 'scn-1')} boosts`, status: 'passed' },
							// The engine reads the title when there is one, so a token that only
							// the describe block carries is not seen: both tools agree on that.
							{ title: 'brakes', fullName: `${token('act-brake', 'scn-3')} brakes`, status: 'passed' }
						]
					}
				]
			})
		);
		const { report } = json(dir, ['report.json']);
		expect(report.actions.map((action) => action.key)).toEqual(['action:act-boost']);
	});

	it('exits 0 with a plain message when no test title carries a token, without needing an index', () => {
		const dir = repo(null);
		const file = reportFile(dir, [['a test of the team', 'passed']]);
		const result = run(dir, [file]);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('no test title carries an [unspa:<surface>:<action>:<scenario>] token');
		expect(json(dir, [file]).report).toMatchObject({ tested: 0, actions: [], indexFile: null, written: false });
	});

	it('treats a JSON file of another shape as a report without tokens', () => {
		const dir = repo({ 'action:act-boost': located });
		writeFileSync(join(dir, 'report.json'), JSON.stringify({ testResults: 'none', coverage: 12 }));
		const result = run(dir, ['report.json']);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('nothing to ingest');
	});

	it('exits 1 on a report that is not JSON, a missing report, a missing argument or a missing index', () => {
		const dir = repo({ 'action:act-boost': located });
		writeFileSync(join(dir, 'broken.json'), '{ "testResults": [');
		const broken = run(dir, ['broken.json']);
		expect(broken.status).toBe(1);
		expect(broken.stderr).toContain('Could not parse');

		const missing = run(dir, ['nowhere.json']);
		expect(missing.status).toBe(1);
		expect(missing.stderr).toContain('Results file not found');

		const usage = run(dir, ['--json']);
		expect(usage.status).toBe(1);
		expect(usage.stderr).toContain('Usage:');

		const bare = repo(null);
		const file = reportFile(bare, [[`${token('act-boost', 'scn-1')} boosts`, 'passed']]);
		const noIndex = run(bare, [file]);
		expect(noIndex.status).toBe(1);
		expect(noIndex.stderr).toContain('No .unspa.json found');
	});
});
