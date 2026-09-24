import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The command ships to customer repositories as a file, so it is exercised as
// one: a child process in a throwaway repository. What it must never do is what
// a field session did with Python: rewrite a 6,544-entry index in another
// indentation to add eight entries.
const script = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(text: string) {
	const dir = mkdtempSync(join(tmpdir(), 'lyriks-index-file-'));
	dirs.push(dir);
	writeFileSync(join(dir, '.unspa.json'), text);
	return dir;
}

function run(cwd: string, name: string, args: string[]) {
	try {
		return { status: 0, stdout: execFileSync('node', [script(name), ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }), stderr: '' };
	} catch (error) {
		const failed = error as { status?: number | null; stdout?: string; stderr?: string };
		return { status: failed.status ?? 1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
	}
}

const entry = (line: number) => ({ file: 'src/a.ts', line, signature: `export const value${line} = compute(${line});`, status: 'implemented' });
const many = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`rule:r${i}`, entry(i + 1)]));
const read = (dir: string) => readFileSync(join(dir, '.unspa.json'), 'utf8');
const upsert = (dir: string, entries: Record<string, unknown>, extra: string[] = []) => {
	writeFileSync(join(dir, 'entries.json'), JSON.stringify(entries));
	return run(dir, 'index-file.mjs', ['upsert', 'entries.json', ...extra]);
};

describe('index-file.mjs upsert / remove / set-project', () => {
	it('adds and replaces by key in a 4-space file, and every other line keeps its bytes', () => {
		const doc = { format: 'unspaghettit-index', version: 1, projectId: 'vector-rally', index: many(300) };
		const dir = repo(JSON.stringify(doc, null, 4) + '\n');
		const before = read(dir).split('\n');
		const result = upsert(dir, { 'rule:r5': { ...entry(6), line: 60 }, 'action:new-one': entry(900), 'criterion:c-1': { verification: { kind: 'manual' } } });
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('added     action:new-one');
		expect(result.stdout).toContain('added     criterion:c-1');
		expect(result.stdout).toContain('replaced  rule:r5');
		expect(result.stdout).toContain('2 added, 1 replaced, 0 unchanged, 0 removed.');

		const after = read(dir);
		// Byte for byte what a 4-space JSON.stringify of the edited document gives.
		const expected = { ...doc, index: { ...doc.index, 'rule:r5': { ...entry(6), line: 60 }, 'action:new-one': entry(900), 'criterion:c-1': { verification: { kind: 'manual' } } } };
		expect(after).toBe(JSON.stringify(expected, null, 4) + '\n');
		const changed = after.split('\n').filter((line, i) => line !== before[i] && i < before.length - 3);
		// The replaced field, and the comma the former last entry gains: nothing else moved.
		expect(changed).toEqual(['            "line": 60,', '        },']);
	});

	it('writes a new entry in the style of its neighbours: one spaced line per entry, CRLF endings', () => {
		const lines = Object.entries(many(3)).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, '{ ').replace(/\}$/, ' }')}`);
		const text = `{\r\n  "projectId": "vector-rally",\r\n  "index": {\r\n${lines.join(',\r\n')}\r\n  }\r\n}\r\n`;
		const dir = repo(text);
		expect(upsert(dir, { 'action:x': { file: 'src/x.ts', line: 3 } }).status).toBe(0);
		expect(read(dir)).toBe(`{\r\n  "projectId": "vector-rally",\r\n  "index": {\r\n${lines.join(',\r\n')},\r\n    "action:x": { "file": "src/x.ts", "line": 3 }\r\n  }\r\n}\r\n`);
	});

	it('says unchanged for an identical entry and writes nothing', () => {
		const text = JSON.stringify({ projectId: 'p', index: many(2) }, null, 2);
		const dir = repo(text);
		const result = upsert(dir, { 'rule:r0': entry(1) }, ['--json']);
		expect(JSON.parse(result.stdout)).toMatchObject({ unchanged: ['rule:r0'], added: [], replaced: [], written: false });
		expect(read(dir)).toBe(text);
	});

	it('removes keys, the last one included, and reports a key that is not there', () => {
		const doc = { projectId: 'p', index: many(4) };
		const dir = repo(JSON.stringify(doc, null, 2) + '\n');
		const result = run(dir, 'index-file.mjs', ['remove', 'rule:r1', 'rule:r3', 'rule:nope', '--json']);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({ removed: ['rule:r1', 'rule:r3'], absent: ['rule:nope'], written: true });
		const { 'rule:r1': _a, 'rule:r3': _b, ...kept } = doc.index;
		expect(read(dir)).toBe(JSON.stringify({ ...doc, index: kept }, null, 2) + '\n');
	});

	it('edits an index of the older bare-map shape', () => {
		const dir = repo(JSON.stringify(many(2), null, 2));
		expect(upsert(dir, { 'rule:r9': entry(9) }).status).toBe(0);
		expect(read(dir)).toBe(JSON.stringify({ ...many(2), 'rule:r9': entry(9) }, null, 2));
	});

	it('corrects the projectId alone with set-project', () => {
		const doc = { format: 'unspaghettit-index', projectId: 'big-island-04ba81', index: many(2) };
		const dir = repo(JSON.stringify(doc, null, 2) + '\n');
		const result = run(dir, 'index-file.mjs', ['set-project', 'big-island-c4e7da']);
		expect(result.stdout).toContain('projectId big-island-04ba81 -> big-island-c4e7da');
		expect(read(dir)).toBe(JSON.stringify({ ...doc, projectId: 'big-island-c4e7da' }, null, 2) + '\n');
	});

	it('writes nothing on --dry-run, and refuses what is not an index entry', () => {
		const text = JSON.stringify({ projectId: 'p', index: many(1) }, null, 2);
		const dir = repo(text);
		expect(upsert(dir, { 'rule:new': entry(2) }, ['--dry-run']).stdout).toContain('(dry run: nothing written)');
		const bad = upsert(dir, { 'no-prefix': entry(2), 'rule:list': [1] });
		expect(bad.status).toBe(1);
		expect(bad.stderr).toContain('Not an index entry (a key like action:<id> holding an object): no-prefix, rule:list.');
		expect(run(dir, 'index-file.mjs', ['frobnicate']).stderr).toContain('Usage: node .lyriks/tools/index-file.mjs upsert');
		expect(read(dir)).toBe(text);
	});

	it('stays importable as a library: importing it runs no command', () => {
		const dir = repo(JSON.stringify({ projectId: 'p', index: many(1) }));
		const probe = `import(${JSON.stringify(script('index-file.mjs'))}).then((m) => console.log(typeof m.loadIndexFile, m.loadIndexFile().projectId))`;
		expect(execFileSync('node', ['--input-type=module', '-e', probe], { cwd: dir, encoding: 'utf8' }).trim()).toBe('function p');
	});
});

describe('the other writers keep the formatting too', () => {
	it('check-index --fix rewrites only the moved line in a compact one-entry-per-line file', () => {
		const text = '{"projectId":"p","index":{\n"rule:a":{"file":"src/a.ts","line":1,"signature":"export const alpha = 1;"},\n"rule:b":{"file":"src/a.ts","line":9,"signature":"export const beta = 2;"}\n}}\n';
		const dir = repo(text);
		mkdirSync(join(dir, 'src'));
		writeFileSync(join(dir, 'src/a.ts'), 'export const alpha = 1;\nexport const beta = 2;\n');
		expect(run(dir, 'check-index.mjs', ['--fix']).status).toBe(0);
		expect(read(dir)).toBe(text.replace('"line":9', '"line":2'));
	});

	it('check-index warns when the index and the binding block name two projects', () => {
		const dir = repo(JSON.stringify({ projectId: 'big-island-04ba81', index: {} }));
		writeFileSync(join(dir, 'CLAUDE.md'), '<!-- lyriks-binding -->\nIts spec lives in the Lyriks project `big-island-c4e7da` and nowhere else.\n<!-- /lyriks-binding -->\n');
		const result = run(dir, 'check-index.mjs', ['--json']);
		expect(result.status).toBe(0);
		const report = JSON.parse(result.stdout);
		expect(report.projectId).toBe('big-island-04ba81');
		expect(report.projectWarnings[0]).toContain('names projectId big-island-04ba81 but the binding block of CLAUDE.md names big-island-c4e7da');
		const plain = execFileSync('node', [script('check-index.mjs')], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		expect(plain).toContain('0 entries checked');
		// --project settles which one is meant, and the stale index is still named.
		const named = run(dir, 'check-index.mjs', ['--json', '--project', 'big-island-c4e7da']);
		expect(JSON.parse(named.stdout).projectWarnings).toEqual([
			expect.stringContaining('index-file.mjs set-project big-island-c4e7da')
		]);
	});
});
