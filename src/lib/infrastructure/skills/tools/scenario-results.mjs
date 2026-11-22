// Lyriks helper (installed by `sync_skills` under .lyriks/tools/). Not run
// directly: the scenario half of ingest-results.mjs. Reads the engine's scenario
// tokens out of a jest-shaped report, rolls them up per action, and applies one
// action's verdict to the index: `verifiedAt` by its own rule, and the last
// result of each scenario under `scenarioResults`. No dependencies, Node 18+.

// The engine's token, as its codegen emits it (cli/scenarios/results.ts).
const TOKEN = /\[unspa:([^:\]]+):([^:\]]+):([^:\]]+)\]/;

/**
 * Per-scenario pass or fail from a jest-shaped report. A test without a token
 * is someone's own test and is ignored; a report of another shape yields none.
 * The token is looked for in `title`, and in `fullName` only when there is no
 * title: exactly what the engine does, so both always agree on one report.
 */
export function parseScenarioResults(report) {
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

/**
 * Rolled up per action: verified when it has at least one result and every one
 * passed; `scenarios` says, per scenario id, whether every test of it passed.
 */
export function summarizeByAction(results) {
	const byAction = new Map();
	for (const result of results) {
		const tally = byAction.get(result.actionId) ?? { total: 0, passed: 0, scenarios: {} };
		tally.total += 1;
		if (result.passed) tally.passed += 1;
		tally.scenarios[result.scenarioId] = (tally.scenarios[result.scenarioId] ?? true) && result.passed;
		byAction.set(result.actionId, tally);
	}
	return [...byAction].map(([actionId, { total, passed, scenarios }]) => ({
		actionId,
		total,
		passed,
		verified: total > 0 && passed === total,
		scenarios
	}));
}

const isEntry = (entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry);

/**
 * The entry's `scenarioResults` with this run's results laid over them: each
 * scenario the run reached gets its result, the commit it ran on and when; one
 * it did not reach keeps the result it had.
 */
function withScenarioResults(entry, scenarios, at, { revision, dirty }) {
	const { scenarioResults: earlier, ...rest } = entry;
	const results = { ...(isEntry(earlier) ? earlier : {}) };
	for (const [scenarioId, passed] of Object.entries(scenarios)) {
		results[scenarioId] = { passed, at, ...(revision ? { revision } : {}), ...(dirty ? { dirty: true } : {}) };
	}
	return { ...rest, scenarioResults: results };
}

/**
 * Applies one action's verdict to the index in place and says what it did.
 * `verifiedAt` follows its own rule (stamped when every result passed, removed
 * when one fails); every located action also gets its scenarios' results.
 */
export function applyVerdict(index, action, stampedAt, { revision = null, dirty = false } = {}) {
	const key = `action:${action.actionId}`;
	const entry = isEntry(index[key]) ? index[key] : null;
	if (!entry) return action.verified ? 'unindexed' : 'failing-unindexed';
	const recorded = withScenarioResults(entry, action.scenarios, stampedAt, { revision, dirty });
	if (action.verified) {
		// The commit the proof was taken on replaces the one before, and so does its dirtiness.
		const { verifiedRevision: _rev, verifiedDirty: _dirty, scenarioResults, ...kept } = recorded;
		const proof = { ...(revision ? { verifiedRevision: revision } : {}), ...(dirty ? { verifiedDirty: true } : {}) };
		index[key] = { ...kept, verifiedAt: stampedAt, verifiedScenarios: action.passed, ...proof, scenarioResults };
		return 'stamped';
	}
	// A result fails: a proof stamped before is stale, drop it.
	const { verifiedAt, verifiedScenarios: _count, verifiedRevision: _rev, verifiedDirty: _dirty, ...rest } = recorded;
	index[key] = rest;
	return verifiedAt !== undefined ? 'cleared' : 'failing';
}

export const OUTCOMES = {
	stamped: 'verifiedAt stamped',
	cleared: 'verifiedAt removed, a result fails',
	unindexed: 'passing but not in the index: nothing written, record where it is implemented, then ingest again',
	failing: 'a result fails, no verifiedAt to remove',
	'failing-unindexed': 'a result fails, and the action is not in the index: nothing written'
};

/** The scenarios of one action whose last result failed, for its printed line. */
export const failedScenarios = (action) =>
	Object.entries(action.scenarios)
		.filter(([, passed]) => !passed)
		.map(([scenarioId]) => scenarioId);
