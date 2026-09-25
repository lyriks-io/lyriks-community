#!/usr/bin/env node
// Lyriks helper (installed by `sync_skills` under .lyriks/tools/).
//   node .lyriks/tools/ingest-results.mjs <report.json> [--criteria <map.json>] [--kind <kind>] [--revision <sha>] [--dry-run] [--json]
// Brings test results back into `.unspa.json` without hand editing. Reads a
// vitest or jest JSON report (`--reporter=json --outputFile=<report.json>`),
// keeps the tests whose title carries the engine's token
// `[unspa:<surfaceId>:<actionId>:<scenarioId>]`, and per action:
//   every result passed  -> stamps `verifiedAt` (and `verifiedScenarios`)
//   a result fails       -> removes a `verifiedAt` that is now stale
//   no index entry       -> reports it and creates nothing: an action is
//                           located first (index entry), proven second.
// "Located" and "proven" are two claims. An index entry says where the code is;
// only a passing run of the real code earns `verifiedAt`.
// Acceptance criteria come back the same way (criteria-results.mjs): a test
// whose title carries `[criterion:<id>]` (or that --criteria maps to one) sets
// `verification.lastResult { passed, at, summary, revision }` on the entry
// `criterion:<id>`, passed when every one of its tests passed, and creates that
// entry (kind from --kind, default unit, files from the report) when it is
// missing. The next sync then reports the criterion verified, or failing.
// Same rules and exit codes as the engine's own `unspa coverage ingest`: 1 when
// the report or the index cannot be read, else 0, a failing test included (this
// records, it does not gate). No dependencies, no network, Node 18+.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CRITERION_KINDS, applyCriterion, criterionResults, currentRevision, readCriteriaMap } from './criteria-results.mjs';
import { findIndexFile, loadIndexFile, writeIndexFile } from './index-file.mjs';

// The engine's token, as its codegen emits it (cli/scenarios/results.ts).
const TOKEN = /\[unspa:([^:\]]+):([^:\]]+):([^:\]]+)\]/;

/**
 * Per-scenario pass or fail from a jest-shaped report. A test without a token
 * is someone's own test and is ignored; a report of another shape yields none.
 * The token is looked for in `title`, and in `fullName` only when there is no
 * title: exactly what the engine does, so both always agree on one report.
 */
function parseScenarioResults(report) {
	const results = [];
	const files = Array.isArray(report?.testResults) ? report.testResults : [];
	for (const file of files) {
		const assertions = Array.isArray(file?.assertionResults) ? file.assertionResults : [];
		for (const assertion of assertions) {
			const match = TOKEN.exec(String(assertion?.title ?? assertion?.fullName ?? ''));
			if (!match) continue;
			const [, surfaceId, actionId, scenarioId] = match;
			results.push({ surfaceId, actionId, scenarioId, passed: assertion.status === 'passed' });
		}
	}
	return results;
}

/** Rolled up per action: verified when it has at least one result and every one passed. */
function summarizeByAction(results) {
	const byAction = new Map();
	for (const result of results) {
		const tally = byAction.get(result.actionId) ?? { total: 0, passed: 0 };
		tally.total += 1;
		if (result.passed) tally.passed += 1;
		byAction.set(result.actionId, tally);
	}
	return [...byAction].map(([actionId, { total, passed }]) => ({
		actionId,
		total,
		passed,
		verified: total > 0 && passed === total
	}));
}

const isEntry = (entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry);

/** Applies one action's verdict to the index in place and says what it did. */
function applyVerdict(index, action, stampedAt) {
	const key = `action:${action.actionId}`;
	const entry = isEntry(index[key]) ? index[key] : null;
	if (action.verified) {
		if (!entry) return 'unindexed';
		index[key] = { ...entry, verifiedAt: stampedAt, verifiedScenarios: action.passed };
		return 'stamped';
	}
	if (entry && entry.verifiedAt !== undefined) {
		// It was proven and a result now fails: the proof is stale, drop it.
		const { verifiedAt: _at, verifiedScenarios: _count, ...rest } = entry;
		index[key] = rest;
		return 'cleared';
	}
	return entry ? 'failing' : 'failing-unindexed';
}

const OUTCOMES = {
	stamped: 'verifiedAt stamped',
	cleared: 'verifiedAt removed, a result fails',
	unindexed: 'passing but not in the index: nothing written, record where it is implemented, then ingest again',
	failing: 'a result fails, no verifiedAt to remove',
	'failing-unindexed': 'a result fails, and the action is not in the index'
};

function printReport(report) {
	if (report.actions.length === 0 && report.criteria.length === 0) {
		console.log(`${report.reportFile}: no test title carries an [unspa:<surface>:<action>:<scenario>] or [criterion:<id>] token, nothing to ingest.`);
		console.log('Put the `titleToken` of each export_behavior_scenarios fixture, or [criterion:<id>], in its test title, then run the tests with --reporter=json.');
		return;
	}
	for (const criterion of report.criteria) {
		console.log(`${criterion.key}  ${criterion.passed}/${criterion.total} passed  lastResult ${criterion.outcome.replace('created-', 'written (entry created), ')}`);
	}
	const width = Math.max(...report.actions.map((action) => action.key.length));
	for (const action of report.actions) {
		console.log(`${action.key.padEnd(width)}  ${action.passed}/${action.total} passed  ${OUTCOMES[action.outcome]}`);
	}
	console.log(
		`${report.indexFile}: ${report.tested} actions tested, ${report.verified} fully passing, ${report.tested - report.verified} with failures; ` +
			`${report.stamped} stamped, ${report.cleared} cleared, ${report.unindexed.length} passing but not in the index` +
			(report.criteria.length > 0 ? `; ${report.criteria.length} criteria given a lastResult` : '') +
			(report.dryRun ? ' (dry run: nothing written).' : report.written ? '.' : ' (nothing to write).')
	);
}

/** `<report.json>` and the flags; the value flags take the next argument. */
function parseArgv(argv) {
	const flags = {};
	const positional = [];
	for (let i = 0; i < argv.length; i += 1) {
		const name = argv[i].startsWith('--') ? argv[i].slice(2) : null;
		if (name === null) positional.push(argv[i]);
		else if (['criteria', 'kind', 'revision'].includes(name)) {
			if (argv[i + 1] === undefined) throw new Error(`--${name} needs a value.`);
			flags[name] = argv[(i += 1)];
		} else flags[name] = true;
	}
	return { file: positional[0], flags };
}

function main() {
	const { file, flags } = parseArgv(process.argv.slice(2));
	const dryRun = Boolean(flags['dry-run']);
	if (!file) throw new Error('Usage: node .lyriks/tools/ingest-results.mjs <report.json> [--criteria <map.json>] [--kind <kind>] [--revision <sha>] [--dry-run] [--json]');
	const kind = flags.kind ?? 'unit';
	if (!CRITERION_KINDS.includes(kind)) throw new Error(`--kind must be one of ${CRITERION_KINDS.join(', ')}.`);
	const reportFile = resolve(file);
	if (!existsSync(reportFile)) {
		throw new Error(`Results file not found: ${reportFile}\nRun the tests with --reporter=json --outputFile=<report.json>, then ingest that file.`);
	}
	let raw;
	try {
		raw = JSON.parse(readFileSync(reportFile, 'utf8'));
	} catch (error) {
		throw new Error(`Could not parse ${reportFile} as JSON: ${error.message}`);
	}

	const perAction = summarizeByAction(parseScenarioResults(raw));
	const indexPath = findIndexFile();
	const perCriterion = criterionResults(raw, flags.criteria ? readCriteriaMap(resolve(flags.criteria)) : undefined, indexPath ? resolve(indexPath, '..') : process.cwd());
	const report = { reportFile, indexFile: null, dryRun, written: false, stampedAt: null, tested: perAction.length, verified: 0, stamped: 0, cleared: 0, unindexed: [], actions: [], criteria: [] };
	// Like the engine, a report without tagged tests never needs the index at all.
	if (perAction.length + perCriterion.length > 0) {
		const loaded = loadIndexFile();
		report.indexFile = loaded.path;
		report.stampedAt = new Date().toISOString();
		for (const action of perAction) {
			const outcome = applyVerdict(loaded.index, action, report.stampedAt);
			report.actions.push({ key: `action:${action.actionId}`, ...action, outcome });
			if (action.verified) report.verified += 1;
			if (outcome === 'stamped') report.stamped += 1;
			if (outcome === 'cleared') report.cleared += 1;
			if (outcome === 'unindexed') report.unindexed.push(action.actionId);
		}
		const revision = flags.revision ?? (perCriterion.length > 0 ? currentRevision(loaded.dir) : null);
		for (const result of perCriterion) {
			report.criteria.push(applyCriterion(loaded.index, result, { at: report.stampedAt, kind, revision, reportFile }));
		}
		if (!dryRun && report.stamped + report.cleared + report.criteria.length > 0) {
			writeIndexFile(loaded);
			report.written = true;
		}
	}

	if (flags.json) console.log(JSON.stringify(report, null, 2));
	else printReport(report);
	return 0;
}

try {
	process.exitCode = main();
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
