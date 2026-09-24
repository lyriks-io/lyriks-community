// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). The
// acceptance-criterion half of ingest-results.mjs: from a vitest or jest JSON
// report to `verification.lastResult` on the `criterion:<id>` entries of
// `.unspa.json`, which is what makes a sync report a criterion `verified` (or
// `failing`). A test names the criterion it checks with a `[criterion:<id>]`
// token in its title (several tokens for several criteria), or a map file
// `{ "<criterionId>": ["<test title or full name>", ...] }` names the tests
// whose titles cannot change. Not run directly. No dependencies, no network.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';

export const CRITERION_KINDS = ['unit', 'integration', 'e2e', 'visual', 'measurement', 'manual'];
const TOKEN = /\[criterion:([^\]\s]+)\]/g;
// A skipped or pending test ran nothing: it neither proves nor breaks a criterion.
const NOT_RUN = new Set(['pending', 'skipped', 'todo', 'disabled']);

/** `{ criterionId: [titles] }` from a map file, a lone title accepted for a list. */
export function readCriteriaMap(path) {
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		throw new Error(`${path} cannot be read as JSON: ${error.message}`);
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${path} must map each criterion id to the titles of its tests: { "<criterionId>": ["<title>", ...] }.`);
	}
	const byTitle = new Map();
	for (const [id, titles] of Object.entries(parsed)) {
		const criterionId = id.replace(/^criterion:/, '');
		for (const title of [titles].flat()) {
			if (typeof title !== 'string' || !title) continue;
			if (!byTitle.has(title)) byTitle.set(title, new Set());
			byTitle.get(title).add(criterionId);
		}
	}
	return byTitle;
}

/** Per criterion: how many of its tests ran and passed, and the test files they live in. */
export function criterionResults(report, byTitle = new Map(), baseDir = process.cwd()) {
	const tally = new Map();
	for (const file of Array.isArray(report?.testResults) ? report.testResults : []) {
		for (const assertion of Array.isArray(file?.assertionResults) ? file.assertionResults : []) {
			if (NOT_RUN.has(assertion?.status)) continue;
			const title = String(assertion?.title ?? '');
			const fullName = String(assertion?.fullName ?? '');
			const ids = new Set([...`${title} ${fullName}`.matchAll(TOKEN)].map((match) => match[1]));
			for (const name of [title, fullName]) for (const id of byTitle.get(name) ?? []) ids.add(id);
			for (const id of ids) {
				const entry = tally.get(id) ?? { criterionId: id, total: 0, passed: 0, files: new Set() };
				entry.total += 1;
				if (assertion.status === 'passed') entry.passed += 1;
				if (typeof file.name === 'string' && file.name) entry.files.add(relative(baseDir, resolve(file.name)));
				tally.set(id, entry);
			}
		}
	}
	return [...tally.values()].map(({ files, ...rest }) => ({ ...rest, files: [...files].sort() }));
}

/** The commit the tests ran against, when the index lives in a git checkout. */
export function currentRevision(dir) {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim() || null;
	} catch {
		return null;
	}
}

/**
 * Writes one criterion's `verification.lastResult` in place and says what it
 * did. An entry the index lacks is created from the run itself (the test files
 * ARE where a criterion is checked); an existing one keeps its kind, command,
 * files and artifacts, and gets the new result.
 */
export function applyCriterion(index, result, { at, kind, revision, reportFile }) {
	const key = `criterion:${result.criterionId}`;
	const entry = index[key] && typeof index[key] === 'object' && !Array.isArray(index[key]) ? index[key] : null;
	const lastResult = {
		passed: result.passed === result.total,
		at,
		summary: `${result.passed}/${result.total} tests passed (${basename(reportFile)})`,
		...(revision ? { revision } : {})
	};
	const verification = entry?.verification && typeof entry.verification === 'object' ? entry.verification : {};
	index[key] = {
		...(entry ?? {}),
		verification: {
			...verification,
			kind: CRITERION_KINDS.includes(verification.kind) ? verification.kind : kind,
			...(verification.files === undefined && result.files.length > 0 ? { files: result.files } : {}),
			lastResult
		}
	};
	const outcome = `${entry ? '' : 'created-'}${lastResult.passed ? 'verified' : 'failing'}`;
	return { key, ...result, outcome };
}
