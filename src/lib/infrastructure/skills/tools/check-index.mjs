#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/check-index.mjs [--fix] [--json] [--project <id>]
// Checks that every entry of `.unspa.json` still points at its code, the way
// the engine does: a signature is found by its TEXT, and `line` is only a hint.
// A checker that compares the signature with the text at exactly `line` makes
// every clean edit above an entry look like a fault, and people then pad
// existing lines rather than shift their neighbours. This one reports every
// problem of the whole index in one run, and `--fix` rewrites the line numbers
// that moved. It also warns (stderr, and `projectWarnings` in --json) when the
// projectId of the index differs from --project or from the project the binding
// block of CLAUDE.md names: a sync would then go to the wrong project.
// Exit code 0 when nothing is wrong or everything was fixed, else 1.
// No dependencies, no network, Node 18+.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { indexEntries, loadIndexFile, writeIndexFile } from './index-file.mjs';
import { printProjectWarnings, resolveProject } from './index-project.mjs';

// The engine's own constants (implementationStatus.ts): an entry within two
// lines of its signature is fresh, and a signature under six characters is
// never searched for.
const FRESH_WINDOW = 2;
const MIN_NEEDLE = 6;

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Every line carrying the signature, 1-based, at the first of the engine's
 * three tiers that matches anything: the whole signature on one line, then its
 * first 30 characters (a reformatted parameter list), then its first identifier
 * with the operator that follows (a dropped `let`, a call split over lines).
 * The engine keeps the first match; keeping them all lets the hint choose.
 * Null when the signature is too short for the engine to search at all.
 */
function signatureLines(normalizedLines, signature) {
	const target = normalize(signature);
	if (target.length < MIN_NEEDLE) return null;
	const needles = [target];
	if (target.length >= 18) needles.push(target.slice(0, 30));
	const identifier = /[a-zA-Z_$][a-zA-Z0-9_$]{3,}\s*[(<=]/.exec(target);
	if (identifier) needles.push(identifier[0]);
	for (const needle of needles) {
		if (needle.length < MIN_NEEDLE) continue;
		const found = [];
		normalizedLines.forEach((line, i) => {
			if (line.includes(needle)) found.push(i + 1);
		});
		if (found.length > 0) return found;
	}
	return [];
}

/** One entry's verdict: null when it is fine (or claims no location), else the problem. */
function checkEntry(key, entry, readLines) {
	// `missing` records "searched, absent": there is no location to check.
	if (entry.status === 'missing') return null;
	if (typeof entry.file !== 'string' || !entry.file) return null;
	if (typeof entry.signature !== 'string' || !entry.signature) return null;
	const hint = Number.isInteger(entry.line) && entry.line > 0 ? entry.line : null;
	const base = { key, file: entry.file, line: hint };

	const lines = readLines(entry.file);
	if (!lines) return { ...base, kind: 'file-missing' };
	const found = signatureLines(lines, entry.signature);
	if (found === null) {
		return { ...base, kind: 'not-found', detail: `the signature is under ${MIN_NEEDLE} characters, which the engine never searches for` };
	}
	if (found.length === 0) return { ...base, kind: 'not-found', detail: normalize(entry.signature).slice(0, 80) };
	if (hint === null) {
		return found.length === 1
			? { ...base, kind: 'moved', foundLine: found[0] }
			: { ...base, kind: 'ambiguous', candidates: found, detail: 'no line to choose between them' };
	}
	const byDistance = [...found].sort((a, b) => Math.abs(a - hint) - Math.abs(b - hint));
	const nearest = byDistance[0];
	// Within the window the entry is fresh, and the hint has settled any ambiguity.
	if (Math.abs(nearest - hint) <= FRESH_WINDOW) return null;
	if (found.length === 1) return { ...base, kind: 'moved', foundLine: nearest };
	const tie = Math.abs(byDistance[1] - hint) === Math.abs(nearest - hint);
	return tie
		? { ...base, kind: 'ambiguous', candidates: found, detail: 'two occurrences are equally near the line' }
		: { ...base, kind: 'ambiguous', candidates: found, foundLine: nearest };
}

const LABELS = { moved: 'moved', ambiguous: 'ambiguous', 'not-found': 'not found', 'file-missing': 'file missing' };

function describe(problem) {
	const at = problem.line === null ? 'no line' : `line ${problem.line}`;
	const to = problem.foundLine ? ` -> ${problem.foundLine}` : '';
	const fixed = problem.fixed ? ' (fixed)' : '';
	if (problem.kind === 'moved') return `${at}${to}${fixed}`;
	if (problem.kind === 'ambiguous') {
		const why = problem.detail ?? 'nearest to the line taken';
		return `${at}${to}${fixed}: ${problem.candidates.length} occurrences (lines ${problem.candidates.join(', ')}), ${why}`;
	}
	return problem.detail ? `${at}: ${problem.detail}` : at;
}

function printReport(report) {
	const byFile = new Map();
	for (const problem of report.problems) {
		if (!byFile.has(problem.file)) byFile.set(problem.file, []);
		byFile.get(problem.file).push(problem);
	}
	for (const [file, problems] of byFile) {
		console.log(file);
		if (problems[0].kind === 'file-missing') {
			console.log(`  file missing  ${problems.length} entries: ${problems.map((p) => p.key).join(', ')}`);
			continue;
		}
		for (const problem of problems) {
			console.log(`  ${LABELS[problem.kind].padEnd(10)} ${problem.key}  ${describe(problem)}`);
		}
	}
	const open = report.problems.filter((problem) => !problem.fixed).length;
	console.log(
		`${report.indexFile}: ${report.checked} entries checked, ${report.skipped} without a location to check, ` +
			`${report.problems.length} problems, ${report.fixed} fixed, ${open} left.`
	);
	const fixable = report.problems.filter((problem) => problem.foundLine && !problem.fixed).length;
	if (fixable > 0) console.log(`Run with --fix to rewrite the ${fixable} line numbers that moved.`);
}

function main() {
	const args = process.argv.slice(2);
	const fix = args.includes('--fix');
	const loaded = loadIndexFile();
	const flag = args.includes('--project') ? args[args.indexOf('--project') + 1] : undefined;
	const project = resolveProject({ flag, indexProject: loaded.projectId, indexPath: loaded.path, dirs: [loaded.dir, process.cwd()] });
	printProjectWarnings(project.warnings);
	const cache = new Map();
	// Index paths are relative to the index file, and may leave the repository.
	const readLines = (file) => {
		const path = resolve(loaded.dir, file);
		if (!cache.has(path)) {
			try {
				cache.set(path, readFileSync(path, 'utf8').split(/\r?\n/).map(normalize));
			} catch {
				cache.set(path, null);
			}
		}
		return cache.get(path);
	};

	const entries = indexEntries(loaded.index);
	const problems = [];
	let checked = 0;
	for (const [key, entry] of entries) {
		const located = entry.status !== 'missing' && entry.file && entry.signature;
		if (located) checked += 1;
		const problem = checkEntry(key, entry, readLines);
		if (problem) problems.push(problem);
	}

	let fixed = 0;
	if (fix) {
		for (const problem of problems) {
			if (!problem.foundLine) continue;
			loaded.index[problem.key].line = problem.foundLine;
			problem.fixed = true;
			fixed += 1;
		}
		if (fixed > 0) writeIndexFile(loaded);
	}

	const ok = problems.every((problem) => problem.fixed);
	const report = { indexFile: loaded.path, projectId: loaded.projectId, checked, skipped: entries.length - checked, fixed, ok, problems };
	if (project.warnings.length > 0) report.projectWarnings = project.warnings;
	if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
	else printReport(report);
	return ok ? 0 : 1;
}

try {
	process.exitCode = main();
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
