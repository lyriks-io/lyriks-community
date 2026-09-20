import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The script ships to customer repositories as a file, so it is exercised as
// one: a child process in a throwaway repository, never an import.
const script = fileURLToPath(new URL('./check-index.mjs', import.meta.url));

type Entry = { file?: string; line?: number; signature?: string; status?: string };
type Problem = { key: string; file: string; kind: string; line: number | null; foundLine?: number; candidates?: number[]; fixed?: boolean };
type Report = { checked: number; skipped: number; fixed: number; ok: boolean; problems: Problem[] };

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repository: source files plus an index written the way the engine writes it. */
function repo(files: Record<string, string>, index: Record<string, Entry>, indent: string | number = 2) {
	const dir = mkdtempSync(join(tmpdir(), 'lyriks-check-index-'));
	dirs.push(dir);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), content);
	}
	const doc = { format: 'unspaghettit-index', version: 1, projectId: 'vector-rally', index };
	writeFileSync(join(dir, '.unspa.json'), JSON.stringify(doc, null, indent) + '\n');
	return dir;
}

function run(cwd: string, args: string[] = []) {
	try {
		return { status: 0, stdout: execFileSync('node', [script, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }), stderr: '' };
	} catch (error) {
		const failed = error as { status?: number | null; stdout?: string; stderr?: string };
		return { status: failed.status ?? 1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
	}
}

const json = (cwd: string, args: string[] = []) => {
	const result = run(cwd, [...args, '--json']);
	return { status: result.status, report: JSON.parse(result.stdout) as Report };
};

const readIndex = (dir: string) =>
	(JSON.parse(readFileSync(join(dir, '.unspa.json'), 'utf8')) as { index: Record<string, Entry> }).index;

/** `count` filler lines, so a signature can sit at a chosen line. */
const filler = (count: number) => Array.from({ length: count }, (_, i) => `// filler ${i + 1}`).join('\n');

describe('check-index.mjs (the index checker shipped with the skills)', () => {
	it('passes an entry whose signature sits within two lines of its line, like the engine', () => {
		const dir = repo(
			{ 'src/boost.ts': `${filler(9)}\nexport function applyBoost(car: Car) {\n}\n` },
			{ 'action:a1': { file: 'src/boost.ts', line: 8, signature: 'export function applyBoost(car: Car) {' } }
		);
		const { status, report } = json(dir);
		expect(status).toBe(0);
		expect(report).toMatchObject({ checked: 1, ok: true, problems: [] });
	});

	it('finds a moved signature by its text and heals the line with --fix, leaving the rest of the file alone', () => {
		const dir = repo(
			{ 'src/boost.ts': `${filler(40)}\n\texport function applyBoost(car: Car) {\n}\n` },
			{
				'action:a1': { file: 'src/boost.ts', line: 12, signature: 'export function applyBoost(car: Car) {', status: 'implemented' },
				'rule:r1': { file: 'src/boost.ts', line: 1, signature: '// filler 1' }
			},
			'\t'
		);
		const before = readFileSync(join(dir, '.unspa.json'), 'utf8');

		const check = json(dir);
		expect(check.status).toBe(1);
		expect(check.report.problems).toEqual([
			expect.objectContaining({ key: 'action:a1', kind: 'moved', line: 12, foundLine: 41 })
		]);
		// Without --fix the file is never written.
		expect(readFileSync(join(dir, '.unspa.json'), 'utf8')).toBe(before);

		const fixed = json(dir, ['--fix']);
		expect(fixed.status).toBe(0);
		expect(fixed.report).toMatchObject({ fixed: 1, ok: true });
		// Only the line number changed: same tab indentation, same key order, same final newline.
		expect(readFileSync(join(dir, '.unspa.json'), 'utf8')).toBe(before.replace('"line": 12', '"line": 41'));
		expect(json(dir).status).toBe(0);
	});

	it('lets the line choose between several occurrences of the same signature', () => {
		const source = `${filler(9)}\n\treturn { ok: true };\n${filler(30)}\n\treturn { ok: true };\n`;
		const dir = repo(
			{ 'src/save.ts': source },
			{ 'rule:second': { file: 'src/save.ts', line: 40, signature: '\treturn { ok: true };' } }
		);
		// The engine keeps the FIRST match (line 10) and would call this entry stale;
		// the occurrence next to the line (41) is the one the entry means.
		expect(json(dir)).toMatchObject({ status: 0, report: { problems: [] } });
	});

	it('takes the nearest occurrence when the line drifted, and says the match was ambiguous', () => {
		const source = `${filler(9)}\n\treturn { ok: true };\n${filler(30)}\n\treturn { ok: true };\n`;
		const dir = repo(
			{ 'src/save.ts': source },
			{ 'rule:second': { file: 'src/save.ts', line: 33, signature: 'return { ok: true };' } }
		);
		const check = json(dir);
		expect(check.status).toBe(1);
		expect(check.report.problems[0]).toMatchObject({ kind: 'ambiguous', foundLine: 41, candidates: [10, 41] });
		expect(json(dir, ['--fix']).status).toBe(0);
		expect(readIndex(dir)['rule:second'].line).toBe(41);
	});

	it('never guesses between two occurrences equally near the line', () => {
		const dir = repo(
			{ 'src/save.ts': `${filler(9)}\nreturn { ok: true };\n${filler(9)}\nreturn { ok: true };\n` },
			{ 'rule:tie': { file: 'src/save.ts', line: 15, signature: 'return { ok: true };' } }
		);
		const fixed = json(dir, ['--fix']);
		expect(fixed.status).toBe(1);
		expect(fixed.report.problems[0]).toMatchObject({ kind: 'ambiguous', candidates: [10, 20] });
		expect(fixed.report.problems[0].foundLine).toBeUndefined();
		expect(readIndex(dir)['rule:tie'].line).toBe(15);
	});

	it('reports every problem of the index in one run, grouped by file, and fixes what can be fixed', () => {
		const dir = repo(
			{
				'src/boost.ts': `${filler(20)}\nexport function applyBoost(car: Car) {\n}\n`,
				'src/fuel.ts': `${filler(30)}\nexport const FUEL_CAP = 100;\n`
			},
			{
				'action:boost': { file: 'src/boost.ts', line: 3, signature: 'export function applyBoost(car: Car) {' },
				'rule:gone': { file: 'src/boost.ts', line: 5, signature: 'if (car.fuel <= 0) return blocked();' },
				'state:fuel.cap': { file: 'src/fuel.ts', line: 2, signature: 'export const FUEL_CAP = 100;' },
				'action:ghost': { file: 'src/deleted.ts', line: 4, signature: 'export function ghost() {' },
				'rule:ghost': { file: 'src/deleted.ts', line: 9, signature: 'if (!ghost) return;' }
			}
		);
		const check = json(dir);
		expect(check.status).toBe(1);
		expect(check.report.problems.map((problem) => [problem.key, problem.kind])).toEqual([
			['action:boost', 'moved'],
			['rule:gone', 'not-found'],
			['state:fuel.cap', 'moved'],
			['action:ghost', 'file-missing'],
			['rule:ghost', 'file-missing']
		]);

		// The text report names each file once, with its problems under it.
		const text = run(dir).stdout;
		expect(text.match(/^src\/boost\.ts$/gm)).toHaveLength(1);
		expect(text).toMatch(/moved\s+action:boost\s+line 3 -> 21/);
		expect(text).toMatch(/not found\s+rule:gone/);
		expect(text).toMatch(/file missing\s+2 entries: action:ghost, rule:ghost/);
		expect(text).toContain('5 problems');
		expect(text).toContain('Run with --fix to rewrite the 2 line numbers that moved.');

		// --fix heals the two that moved; the others still fail the run.
		const fixed = json(dir, ['--fix']);
		expect(fixed.status).toBe(1);
		expect(fixed.report.fixed).toBe(2);
		expect(readIndex(dir)['action:boost'].line).toBe(21);
		expect(readIndex(dir)['state:fuel.cap'].line).toBe(31);
		expect(readIndex(dir)['rule:gone'].line).toBe(5);
	});

	it('skips what claims no location: a missing status, no signature, no file', () => {
		const dir = repo(
			{ 'src/a.ts': 'export const ready = true;\n' },
			{
				'rule:absent': { status: 'missing', file: 'src/nowhere.ts', line: 3, signature: 'never written anywhere' },
				'rule:bare': { file: 'src/a.ts', line: 1 },
				'event:loose': { signature: 'export const ready = true;' }
			}
		);
		expect(json(dir)).toMatchObject({ status: 0, report: { checked: 0, skipped: 3, problems: [] } });
	});

	it('matches like the engine: whitespace collapsed, and a signature under six characters never found', () => {
		const dir = repo(
			{ 'src/a.ts': 'export   function  go( car )  {\n}\n' },
			{
				'action:go': { file: 'src/a.ts', line: 1, signature: '\texport function go( car ) {' },
				'rule:short': { file: 'src/a.ts', line: 2, signature: '}' }
			}
		);
		const { report } = json(dir);
		expect(report.problems.map((problem) => [problem.key, problem.kind])).toEqual([['rule:short', 'not-found']]);
	});

	it('resolves index paths from the index file, even outside the repository, from any subfolder', () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriks-check-index-'));
		dirs.push(root);
		mkdirSync(join(root, 'app', 'src', 'deep'), { recursive: true });
		mkdirSync(join(root, 'shared'), { recursive: true });
		writeFileSync(join(root, 'shared', 'rules.ts'), `${filler(6)}\nexport const MAX_SPEED = 320;\n`);
		writeFileSync(
			join(root, 'app', '.unspa.json'),
			JSON.stringify({ projectId: 'vector-rally', index: { 'state:speed.max': { file: '../shared/rules.ts', line: 1, signature: 'export const MAX_SPEED = 320;' } } })
		);
		const check = json(join(root, 'app', 'src', 'deep'));
		expect(check.report.problems).toEqual([expect.objectContaining({ kind: 'moved', foundLine: 7 })]);
		expect(json(join(root, 'app', 'src', 'deep'), ['--fix']).status).toBe(0);
		// A compact file stays compact: the rewrite follows the indentation it found.
		expect(readFileSync(join(root, 'app', '.unspa.json'), 'utf8')).not.toContain('\n');
	});

	it('fails with one line when there is no index to check', () => {
		const dir = mkdtempSync(join(tmpdir(), 'lyriks-check-index-'));
		dirs.push(dir);
		const result = run(dir);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('No .unspa.json found');
	});
});
