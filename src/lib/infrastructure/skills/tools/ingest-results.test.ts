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
		expect(result.stdout).toContain('no test title carries an [unspa:<surface>:<action>:<scenario>] or [criterion:<id>] token');
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

// An acceptance criterion is verified when its index entry carries
// `verification.lastResult`; nothing wrote it but a hand edit until now.
describe('ingest-results.mjs (acceptance criteria get their lastResult)', () => {
	type Verification = { kind: string; command?: string; files?: string[]; lastResult?: { passed: boolean; at: string; summary?: string; revision?: string } };
	type CriterionRow = { key: string; criterionId: string; passed: number; total: number; outcome: string };
	const criteriaOf = (cwd: string, args: string[]) => {
		const result = run(cwd, [...args, '--json']);
		return { status: result.status, rows: (JSON.parse(result.stdout) as { criteria: CriterionRow[] }).criteria };
	};
	const verificationOf = (dir: string, id: string) => (readIndex(dir)[`criterion:${id}`] as unknown as { verification: Verification }).verification;

	it('writes passed:true on a criterion whose every test passed, keeping what the entry already said', () => {
		const existing = { verification: { kind: 'integration', command: 'npx vitest run tests/boost.spec.ts' } };
		const dir = repo({ 'action:act-boost': located, 'criterion:c-boost': existing as Entry });
		const file = reportFile(dir, [
			['[criterion:c-boost] boosts a fuelled car', 'passed'],
			['[criterion:c-boost] [criterion:c-new] refuses an empty tank', 'passed'],
			['[criterion:c-boost] a skipped check proves nothing', 'skipped']
		]);
		const { status, rows } = criteriaOf(dir, [file, '--revision', 'abc1234']);
		expect(status).toBe(0);
		expect(rows).toEqual([
			expect.objectContaining({ key: 'criterion:c-boost', passed: 2, total: 2, outcome: 'verified' }),
			expect.objectContaining({ key: 'criterion:c-new', passed: 1, total: 1, outcome: 'created-verified' })
		]);
		const kept = verificationOf(dir, 'c-boost');
		expect(kept).toMatchObject({ kind: 'integration', command: existing.verification.command, files: ['tests/boost.spec.ts'] });
		expect(kept.lastResult).toMatchObject({ passed: true, summary: '2/2 tests passed (report.json)', revision: 'abc1234' });
		expect(Date.parse(kept.lastResult!.at)).not.toBeNaN();
		// A criterion the index lacked is created from the run: the test file is where it is checked.
		expect(verificationOf(dir, 'c-new')).toMatchObject({ kind: 'unit', files: ['tests/boost.spec.ts'], lastResult: { passed: true } });
		expect(readIndex(dir)['action:act-boost']).toEqual(located);
	});

	it('writes passed:false as soon as one test of the criterion fails, with the kind --kind names', () => {
		const dir = repo({ 'action:act-boost': located });
		const file = reportFile(dir, [
			['[criterion:c-1] one', 'passed'],
			['[criterion:c-1] two', 'failed']
		]);
		const { rows } = criteriaOf(dir, [file, '--kind', 'e2e', '--revision', 'r1']);
		expect(rows[0]).toMatchObject({ outcome: 'created-failing', passed: 1, total: 2 });
		expect(verificationOf(dir, 'c-1')).toMatchObject({ kind: 'e2e', lastResult: { passed: false, summary: '1/2 tests passed (report.json)' } });
		expect(run(dir, [file, '--kind', 'guess']).stderr).toContain('--kind must be one of unit, integration, e2e, visual, measurement, manual.');
	});

	it('maps tests whose titles cannot change with --criteria, by title or full name', () => {
		const dir = repo({ 'action:act-boost': located });
		const file = reportFile(dir, [
			['boosts a fuelled car', 'passed'],
			['refuses an empty tank', 'passed']
		]);
		writeFileSync(join(dir, 'criteria.json'), JSON.stringify({ 'criterion:c-a': ['boosts a fuelled car'], 'c-b': 'boost refuses an empty tank' }));
		const { rows } = criteriaOf(dir, [file, '--criteria', 'criteria.json', '--revision', 'r1']);
		expect(rows.map((row) => [row.key, row.outcome])).toEqual([
			['criterion:c-a', 'created-verified'],
			['criterion:c-b', 'created-verified']
		]);
	});

	it('prints one line per criterion and counts them in the summary; --dry-run writes nothing', () => {
		const dir = repo({ 'action:act-boost': located });
		const before = readFileSync(join(dir, '.unspa.json'), 'utf8');
		const file = reportFile(dir, [['[criterion:c-1] one', 'passed']]);
		const lines = run(dir, [file, '--dry-run', '--revision', 'r1']).stdout.trimEnd().split('\n');
		expect(lines[0]).toBe('criterion:c-1  1/1 passed  lastResult written (entry created), verified');
		expect(lines[1]).toContain('; 1 criteria given a lastResult (dry run: nothing written).');
		expect(readFileSync(join(dir, '.unspa.json'), 'utf8')).toBe(before);
	});
});
