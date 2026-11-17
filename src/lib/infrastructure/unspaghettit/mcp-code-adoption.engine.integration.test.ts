import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdoptionResult } from '$application/ports';
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
});
