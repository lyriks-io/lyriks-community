/**
 * The tests of a frozen version, taken home (ac-evo-impl-test-kit, -runner).
 *
 * Every scenario of every touched feature becomes a fixture, the input of ONE
 * adapter the repository writes between the fixtures and its real code; every
 * test is named with the token the result tools read, so its result comes back
 * to the scenario or the criterion it proves. Only the adapter knows the stack.
 *
 * The fixture is composed exactly like the engine composes a scenario run, and
 * like the MCP gateway's export_behavior_scenarios: persona overrides first, the
 * scenario's on top, then the defaults of the surface for every declared path
 * still missing, nested along each dotted path.
 */

export type TestRunner = 'vitest' | 'node';
export const TEST_RUNNERS: readonly TestRunner[] = ['vitest', 'node'];
export const isTestRunner = (v: unknown): v is TestRunner => v === 'vitest' || v === 'node';

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isRow) : []);

/** The token the scenario result ingester reads in a test title. */
const TITLE_TOKEN = /\[unspa:([^:\]]+):([^:\]]+):([^:\]]+)\]/;
export function scenarioTitleToken(surfaceId: unknown, actionId: unknown, scenarioId: unknown): string | null {
	const ids = [surfaceId, actionId, scenarioId].map((id) => (typeof id === 'string' || typeof id === 'number' ? String(id) : ''));
	const token = `[unspa:${ids.join(':')}]`;
	const read = TITLE_TOKEN.exec(token);
	return read && read[0] === token && ids.every((id, i) => read[i + 1] === id) ? token : null;
}

const isStatePath = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.split('.').includes('__proto__');

function writePath(snapshot: Row, path: string, value: unknown): Row {
	const segments = path.split('.');
	const next: Row = { ...snapshot };
	let cursor = next;
	for (const segment of segments.slice(0, -1)) {
		const existing = cursor[segment];
		const child: Row = isRow(existing) ? { ...existing } : {};
		cursor[segment] = child;
		cursor = child;
	}
	cursor[segments[segments.length - 1]] = value;
	return next;
}

function readPath(snapshot: Row, path: string): unknown {
	let cursor: unknown = snapshot;
	for (const segment of path.split('.')) {
		if (!isRow(cursor) || !Object.hasOwn(cursor, segment)) return undefined;
		cursor = cursor[segment];
	}
	return cursor;
}

const applyOverrides = (snapshot: Row, overrides: unknown): Row =>
	rows(overrides).reduce((next, o) => (isStatePath(o.path) ? writePath(next, o.path, o.value) : next), snapshot);

const fillDefaults = (snapshot: Row, definitions: unknown): Row =>
	rows(definitions).reduce(
		(next, def) =>
			isStatePath(def.path) && def.defaultValue !== undefined && readPath(next, def.path) === undefined ? writePath(next, def.path, def.defaultValue) : next,
		snapshot
	);

function namedParameters(overrides: unknown, action: Row | undefined): Row {
	const declared = action && Array.isArray(action.parameters) ? new Set(rows(action.parameters).map((p) => p.name)) : null;
	return Object.fromEntries(
		rows(overrides)
			.filter((o) => typeof o.parameterName === 'string' && (!declared || declared.has(o.parameterName)))
			.map((o) => [o.parameterName, o.value])
	);
}

const statusOf = (v: unknown): 'success' | 'blocked' => (v === 'blocked' ? 'blocked' : 'success');
const timeAdvanceOf = (r: Row) => (typeof r.timeAdvance === 'number' ? { timeAdvance: r.timeAdvance } : {});

/** One scenario as the adapter's input, with what the test asserts. */
export function scenarioFixture(feature: Row, surface: Row, action: Row, scenario: Row): Row {
	const persona = scenario.personaId === undefined ? undefined : rows(feature.personas).find((p) => p.id === scenario.personaId);
	const authored = applyOverrides(applyOverrides({}, persona?.stateOverrides), scenario.stateOverrides);
	const steps = rows(scenario.steps).map((step): Row => {
		const stepSurface = step.surfaceId === undefined ? surface : rows(feature.surfaces).find((s) => s.id === step.surfaceId);
		const stepAction = stepSurface && rows(stepSurface.actions).find((a) => a.id === step.actionId);
		return {
			actionId: step.actionId,
			actionName: stepAction?.name ?? null,
			surfaceId: stepSurface?.id ?? step.surfaceId ?? null,
			parameters: { ...namedParameters(persona?.parameterOverrides, stepAction), ...namedParameters(step.parameterOverrides, stepAction) },
			expectedStatus: statusOf(step.expectedStatus),
			expectedAssertions: rows(step.expectedAssertions),
			...timeAdvanceOf(step)
		};
	});
	return {
		featureId: feature.id,
		featureName: feature.name,
		surfaceId: surface.id,
		surfaceName: surface.name,
		actionId: action.id,
		actionName: action.name,
		scenarioId: scenario.id,
		scenarioName: scenario.name,
		titleToken: scenarioTitleToken(surface.id, action.id, scenario.id),
		personaId: scenario.personaId ?? null,
		initialState: fillDefaults(authored, surface.stateDefinitions),
		parameters: { ...namedParameters(persona?.parameterOverrides, action), ...namedParameters(scenario.parameterOverrides, action) },
		steps,
		...timeAdvanceOf(scenario),
		expectedStatus: statusOf(scenario.expectedStatus),
		expectedAssertions: rows(scenario.expectedAssertions)
	};
}

/** Every scenario of a feature, in model order. */
export function scenarioFixtures(feature: Row): Row[] {
	return rows(feature.surfaces).flatMap((surface) =>
		rows(surface.actions).flatMap((action) => rows(action.scenarios).map((scenario) => scenarioFixture(feature, surface, action, scenario)))
	);
}

export interface TestKitFeature {
	readonly id: string;
	readonly name: string;
	/** The feature as version N makes it: the draft's when the change is not official. */
	readonly snapshot: Row | null;
	/** Its acceptance criteria, ids as the index keys them (`ac-leaf-...`). */
	readonly criteria: readonly { readonly id: string; readonly text: string }[];
}

export interface TestKitInput {
	readonly requestTitle: string;
	readonly specVersion: number;
	readonly runner: TestRunner;
	readonly features: readonly TestKitFeature[];
}

const slugOf = (id: string) => id.replace(/^draft:/, 'draft-').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'feature';
const js = (value: unknown) => JSON.stringify(value, null, '\t');

/** The archive's files, path to text. Pure: the caller packs them. */
export function testKitFiles(input: TestKitInput): Record<string, string> {
	const ts = input.runner === 'vitest';
	const ext = ts ? 'ts' : 'mjs';
	const files: Record<string, string> = {};
	const imports = ts ? "import { describe, expect, it } from 'vitest';" : "import { describe, it } from 'node:test';\nimport assert from 'node:assert/strict';";
	const equal = ts ? 'expect(actual, message).toEqual(expected)' : 'assert.deepEqual(actual, expected, message)';
	const differ = ts ? 'expect(actual, message).not.toEqual(expected)' : 'assert.notDeepEqual(actual, expected, message)';
	const truthy = ts ? 'expect(ok, message).toBe(true)' : 'assert.ok(ok, message)';
	files[`lyriks-checks.${ext}`] = `// Generated by Lyriks. The operators a scenario assertion uses, read the way the engine reads them.
${ts ? "import { expect } from 'vitest';" : "import assert from 'node:assert/strict';"}

export const valueAt = (state${ts ? ': unknown' : ''}, path${ts ? ': string' : ''}) =>
	path.split('.').reduce${ts ? '<unknown>' : ''}((v, key) => (v && typeof v === 'object' ? (v${ts ? ' as Record<string, unknown>' : ''})[key] : undefined), state);

export function check(actual${ts ? ': unknown' : ''}, operator${ts ? ': string' : ''}, expected${ts ? ': unknown' : ''}, message${ts ? ': string' : ''}) {
	const n = (v${ts ? ': unknown' : ''}) => Number(v);
	let ok = true;
	switch (operator) {
		case 'equals':
			return ${equal};
		case 'not_equals':
			return ${differ};
		case 'greater_than': ok = n(actual) > n(expected); break;
		case 'lower_than': ok = n(actual) < n(expected); break;
		case 'greater_or_equal': ok = n(actual) >= n(expected); break;
		case 'lower_or_equal': ok = n(actual) <= n(expected); break;
		case 'contains': ok = Array.isArray(actual) ? actual.includes(expected) : String(actual).includes(String(expected)); break;
		case 'is_true': ok = actual === true; break;
		case 'is_false': ok = actual === false; break;
		case 'exists': ok = actual !== undefined && actual !== null; break;
		default: throw new Error(\`Operator \${operator} is not known to this kit\`);
	}
	${truthy};
}
`;
	files[`adapter.${ext}`] = `// Generated by Lyriks: the ONE file you write. Everything else in this folder is generated.
//
// invoke(fixture) starts YOUR code from fixture.initialState (and fixture.parameters),
// runs fixture.steps first, in order, then the action fixture.actionId, and answers:
//   { status: 'success' | 'blocked', steps: [{ status }...], finalState }
// finalState only needs the paths the scenario asserts (fixture.expectedAssertions).
${ts ? '\nexport interface Run {\n\tstatus: \'success\' | \'blocked\';\n\tsteps?: { status: \'success\' | \'blocked\' }[];\n\tfinalState: unknown;\n}\n' : ''}
export async function invoke(fixture${ts ? ': Record<string, any>' : ''})${ts ? ': Promise<Run>' : ''} {
	throw new Error(\`Bind "\${fixture.actionName}" (\${fixture.featureName}) to your code in adapter.${ext}\`);
}
`;
	for (const feature of input.features) {
		const slug = slugOf(feature.id);
		const fixtures = feature.snapshot ? scenarioFixtures(feature.snapshot) : [];
		files[`fixtures/${slug}.${ext}`] = `// Generated by Lyriks from spec version ${input.specVersion}: the scenarios of "${feature.name}". Do not edit.
export const fixtures = ${js(fixtures)}${ts ? ' as const' : ''};
`;
		files[`${slug}.scenarios.test.${ext}`] = `// Generated by Lyriks from spec version ${input.specVersion}. Each title carries its scenario token,
// which is how .lyriks/tools/ingest-results.mjs brings the result back to the scenario.
${imports}
import { fixtures } from './fixtures/${slug}.${ext === 'ts' ? 'js' : 'mjs'}';
import { invoke } from './adapter.${ext === 'ts' ? 'js' : 'mjs'}';
import { check, valueAt } from './lyriks-checks.${ext === 'ts' ? 'js' : 'mjs'}';

describe(${js(`${feature.name} (spec version ${input.specVersion})`)}, () => {
	for (const fixture of fixtures${ts ? ' as readonly Record<string, any>[]' : ''}) {
		it(\`\${fixture.titleToken} \${fixture.actionName}: \${fixture.scenarioName}\`, async () => {
			const run = await invoke(fixture);
			fixture.steps.forEach((step${ts ? ': Record<string, any>' : ''}, i${ts ? ': number' : ''}) => check(run.steps?.[i]?.status, 'equals', step.expectedStatus, \`step \${i + 1}: \${step.actionName}\`));
			check(run.status, 'equals', fixture.expectedStatus, 'status');
			for (const a of fixture.expectedAssertions${ts ? ' as readonly Record<string, any>[]' : ''}) check(valueAt(run.finalState, a.path), a.operator, a.value, a.description || a.path);
		});
	}
});
`;
		if (feature.criteria.length > 0)
			files[`${slug}.criteria.test.${ext}`] = `// Generated by Lyriks from spec version ${input.specVersion}: the acceptance criteria of "${feature.name}".
// Each is a test to write, named with its criterion token so .lyriks/tools/ingest-results.mjs
// brings its result back. Until written it is a todo, which the tools ignore: never counted as passed.
${imports}

describe(${js(`${feature.name}: acceptance criteria`)}, () => {
${feature.criteria.map((c) => `	it.todo(${js(`[criterion:${c.id}] ${c.text}`)});`).join('\n')}
});
`;
	}
	// The Node runner writes no JSON report of the shape the result tools read: the kit brings one.
	if (!ts)
		files['lyriks-report.mjs'] = `// Generated by Lyriks. Runs the tests of this folder with the Node runner and writes
// test-report.json in the jest/vitest shape .lyriks/tools/ingest-results.mjs reads.
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const testResults = readdirSync(here)
	.filter((f) => f.endsWith('.test.mjs'))
	.map((name) => {
		let out;
		try {
			out = execFileSync('node', ['--test', '--test-reporter=tap', join(here, name)], { encoding: 'utf8' });
		} catch (error) {
			out = error.stdout ?? '';
		}
		// Every test of the kit sits in a describe block: its lines are indented, the block's are not.
		const assertionResults = [...out.matchAll(/^\\s+(not ok|ok) \\d+ - (.+?)(\\s+# (TODO|SKIP).*)?$/gm)]
			.map((m) => ({ title: m[2].trim(), fullName: m[2].trim(), status: m[4] ? (m[4] === 'TODO' ? 'todo' : 'skipped') : m[1] === 'ok' ? 'passed' : 'failed' }));
		return { name: join(here, name), assertionResults };
	});
writeFileSync('test-report.json', JSON.stringify({ testResults }, null, 2));
const all = testResults.flatMap((r) => r.assertionResults);
console.log(\`\${all.filter((a) => a.status === 'passed').length}/\${all.length} passed, report in test-report.json\`);
`;
	const run = ts ? 'npx vitest run --reporter=json --outputFile=test-report.json' : 'node lyriks-report.mjs';
	files['README.md'] = `# Tests of "${input.requestTitle}", spec version ${input.specVersion}

Generated by Lyriks. They are the scenarios and acceptance criteria of the frozen version,
as the code must prove them. Nothing here is specific to your stack except \`adapter.${ext}\`.

1. Copy this folder into your repository's tests.
2. Write \`adapter.${ext}\`: \`invoke(fixture)\` runs your real code from the fixture and answers its status and final state.
3. Turn each \`it.todo\` of the \`*.criteria.test.${ext}\` files into a real test, keeping its \`[criterion:...]\` token in the title.
4. Run them with a JSON report: \`${run}\`.
5. Bring the results back: \`node .lyriks/tools/ingest-results.mjs test-report.json\`, then sync the index.

A scenario passes only against the real code; a todo is never counted as passed.
`;
	return files;
}
