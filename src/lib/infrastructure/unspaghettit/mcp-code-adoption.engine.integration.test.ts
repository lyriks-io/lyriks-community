import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdoptionResult } from '$application/ports';
import { LoadImplementationCoverageUseCase } from '$application/analysis/load-implementation-coverage';
import { createEmptyFeaturesDraft, createFeature } from '$domain/features';
import { McpCodeAdoption } from './mcp-code-adoption.server';
import { UnspaEngineClient } from './unspa-engine-client.server';

/**
 * The disagreement calls against the engine this platform installs, not a stub:
 * the adapter once sent the sides as `statements` while the engine reads
 * `claims`, so every disagreement was refused and none could be settled
 * (rule 991792c8, scenario aded8a72). Only the real schema proves the names.
 */
let root: string;
let engine: UnspaEngineClient;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'lyriks-conflict-'));
	engine = new UnspaEngineClient({ snapshotsRoot: root, mcpBinPath: resolve('node_modules/unspaghettit/mcp-server/bin.cjs'), proofs: false }, 'conflict-contract-test');
});

/** The engine's answer of a call that must have succeeded. */
function valueOf(result: AdoptionResult | null): Readonly<Record<string, unknown>> {
	if (!result?.ok) throw new Error(`The engine refused: ${result ? result.error : 'no answer'}`);
	return result.value;
}

/**
 * The engine keeps each scenario's last result with the action report from the
 * release that brought it (`readScenarioResults`); an older one drops the field,
 * and the test below says so and skips.
 */
const STATUS_DOMAIN = resolve('node_modules/unspaghettit/src/features/implementation-status/domain/ImplementationStatus.ts');
const engineKeepsScenarioResults = existsSync(STATUS_DOMAIN) && readFileSync(STATUS_DOMAIN, 'utf8').includes('readScenarioResults');

afterAll(async () => {
	await engine.connected?.close();
	rmSync(root, { recursive: true, force: true });
});

describe('McpCodeAdoption against the installed engine', () => {
	it('records a disagreement between two sources, then settles it', async () => {
		const adoption = new McpCodeAdoption(engine);
		const created = await engine.callJsonOrError('create_feature', { name: 'Retries', description: 'How a failed call is retried.' });
		expect(created).toMatchObject({ ok: true });
		const featureId = String((created as { value: { id: string } }).value.id);

		const sourceIds: string[] = [];
		for (const [fileName, content] of [['docs/retries.md', 'A failed call is retried 3 times.'], ['src/retry.ts', 'export const RETRIES = 5;']]) {
			const attached = await adoption.attachSource({ featureId, fileName, content });
			expect(attached).toMatchObject({ ok: true });
			sourceIds.push(String(valueOf(attached).sourceId));
		}

		const flagged = await adoption.flagConflict({
			featureId,
			summary: 'The documentation says 3 retries, the code does 5.',
			statements: [
				{ sourceId: sourceIds[0], statement: '3 retries' },
				{ sourceId: sourceIds[1], statement: '5 retries' }
			]
		});
		expect(flagged).toMatchObject({ ok: true, value: { ok: true, status: 'open', openConflictCount: 1 } });

		const conflictId = String(valueOf(flagged).conflictId);
		const settled = await adoption.resolveConflict({ featureId, conflictId, status: 'resolved', resolution: 'The code is the truth: 5 retries.', resolvedInFavorOf: sourceIds[1] });
		expect(settled).toMatchObject({ ok: true, value: { ok: true } });
	}, 60_000);

	// feat-100: a scenario must be able to read failing, so the sync carries each one's last result and the platform keeps it.
	it.skipIf(!engineKeepsScenarioResults)('carries the last result of each scenario from the index to the coverage the page reads [criterion:d0f1688f]', async () => {
		const adoption = new McpCodeAdoption(engine);
		const project = valueOf(
			(await engine.callJsonOrError('create_project', {
				name: 'Validation',
				description: 'Validate the elements.',
				features: [{ name: 'Validate', description: 'Validate an element.' }]
			})) as AdoptionResult | null
		) as unknown as { id: string; features: { id: string }[] };
		const featureId = project.features[0]!.id;
		const built = valueOf(
			(await engine.callJsonOrError('apply_batch', {
				featureId,
				operations: [
					{ kind: 'add_surface', ref: 'element', name: 'Element', type: 'custom', description: 'One element.' },
					{ kind: 'add_action', ref: 'validate', surfaceRef: 'element', name: 'Validate an element', intent: 'Validate it.' },
					{ kind: 'add_action_rule', surfaceRef: 'element', actionRef: 'validate', rule: { category: 'business', description: 'Anyone validates.', effect: { type: 'allow_action', description: 'Always.' } } }
				]
			})) as AdoptionResult | null
		) as unknown as { refs: Record<string, string> };
		const { element, validate } = built.refs as { element: string; validate: string };
		const at = '2026-11-20T01:00:00.000Z';
		const located = { status: 'implemented', file: 'src/validate.ts', line: 1, signature: 'export function validate() {' };

		const synced = valueOf(
			await adoption.syncImplementationIndex(project.id, {
				[`surface:${element}`]: located,
				[`action:${validate}`]: { ...located, scenarioResults: { 'sc-editor': { passed: true, at, revision: 'abc1234' }, 'sc-viewer': { passed: false, at, revision: 'abc1234' } } }
			})
		);
		expect(synced).toMatchObject({ ok: true });

		const draft = { ...createEmptyFeaturesDraft(project.id), features: [createFeature('', null, { id: featureId, name: 'Validate' })] };
		const coverage = await new LoadImplementationCoverageUseCase({ execute: async () => draft }, adoption, { loadFeature: async () => null }).execute(project.id);
		const row = coverage[featureId]?.actions?.[validate];
		expect(row?.scenarioResults).toEqual({ 'sc-editor': { passed: true, at, revision: 'abc1234' }, 'sc-viewer': { passed: false, at, revision: 'abc1234' } });
		// One scenario failed: the action carries no proof stamp, and the failure is not lost with it.
		expect(row).not.toHaveProperty('provenAt');
	}, 60_000);
});
