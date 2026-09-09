import { describe, expect, it } from 'vitest';
import { McpCodeAdoption } from './mcp-code-adoption.server';
import type { UnspaEngineClient } from './unspa-engine-client.server';

type Call = { readonly name: string; readonly args: Record<string, unknown> };

/**
 * A stub engine that records what it was asked. These tests are about the
 * translation the adapter performs — which tool, with which arguments — not
 * about the engine, which has its own suite.
 */
function fakeEngine(
	answer: Awaited<ReturnType<UnspaEngineClient['callJsonOrError']>> = { ok: true, value: {} }
): { engine: UnspaEngineClient; calls: Call[] } {
	const calls: Call[] = [];
	const engine = {
		available: true,
		async callJsonOrError(name: string, args: Record<string, unknown>) {
			calls.push({ name, args });
			return answer;
		}
	} as unknown as UnspaEngineClient;
	return { engine, calls };
}

describe('McpCodeAdoption', () => {
	it('never lets the engine write an index file, whatever the caller asks', async () => {
		// Left to itself the engine writes .unspa.json beside its own working
		// directory — inside the container, a file nobody will ever see, while the
		// checkout that matters stays empty. Preview is the only correct mode here.
		const { engine, calls } = fakeEngine();

		await new McpCodeAdoption(engine).seedIndexFromAnalysis('feat-1', { overwrite: true });

		expect(calls[0].name).toBe('seed_index_from_analysis');
		expect(calls[0].args.dryRun).toBe(true);
		expect(calls[0].args.overwrite).toBe(true);
	});

	it('always scopes a drift sweep to the project', async () => {
		// The engine's unscoped fallback walks every feature it can see, so an
		// omitted projectId would fold other tenants into one project's report.
		const { engine, calls } = fakeEngine();

		await new McpCodeAdoption(engine).getImplementationDrift('proj-1', { 'action:a': {} });

		expect(calls[0].name).toBe('get_drift');
		expect(calls[0].args.projectId).toBe('proj-1');
	});

	it('keeps scoping the sweep even when a single feature is named', async () => {
		const { engine, calls } = fakeEngine();

		await new McpCodeAdoption(engine).getImplementationDrift('proj-1', {}, 'feat-1');

		expect(calls[0].args).toMatchObject({ projectId: 'proj-1', featureId: 'feat-1' });
	});

	it('names the batch the way the engine does, or nothing is ever reported', async () => {
		// The engine validates `reports`; the adapter used to send `entries`, so
		// every whole-feature push was refused before it reached the sidecar.
		const { engine, calls } = fakeEngine();

		await new McpCodeAdoption(engine).reportImplementationStatusBatch('feat-1', [
			{ surfaceId: 'surf-1', foundEntities: [] }
		]);

		expect(calls[0].name).toBe('report_implementation_status_batch');
		expect(calls[0].args).toMatchObject({ featureId: 'feat-1' });
		expect(calls[0].args.reports).toEqual([{ surfaceId: 'surf-1', foundEntities: [] }]);
		expect(calls[0].args.entries).toBeUndefined();
	});

	it('carries a refusal through instead of flattening it to null', async () => {
		// A refused finalize NAMES the untraced elements — that is the answer the
		// agent must act on, and an opaque null would deny it.
		const { engine } = fakeEngine({ ok: false, error: '3 elements have no source span' });

		const result = await new McpCodeAdoption(engine).finalizeAnalysis('feat-1');

		expect(result).toEqual({ ok: false, error: '3 elements have no source span' });
	});

	it('answers null only when the engine is unreachable', async () => {
		const { engine } = fakeEngine(null);

		expect(await new McpCodeAdoption(engine).getProvenance('feat-1')).toBeNull();
	});

	it('sends the index inline on every index-backed read', async () => {
		// The index lives in the caller's checkout; the server has none to read.
		const { engine, calls } = fakeEngine();
		const adoption = new McpCodeAdoption(engine);
		const index = { 'action:a': { status: 'implemented' } };

		await adoption.syncImplementationIndex('proj-1', index);
		await adoption.getImplementationGaps('feat-1', 'proj-1', index);
		await adoption.getBehavioralIndex('proj-1', index);

		for (const call of calls) {
			expect(call.args.index).toBe(index);
			expect(call.args.projectId).toBe('proj-1');
		}
	});

	it('omits optional fields rather than sending undefined the engine would reject', async () => {
		const { engine, calls } = fakeEngine();

		await new McpCodeAdoption(engine).attachSource({
			featureId: 'feat-1',
			fileName: 'src/cart.ts',
			content: 'export const x = 1'
		});

		expect(calls[0].args).toEqual({
			featureId: 'feat-1',
			fileName: 'src/cart.ts',
			content: 'export const x = 1'
		});
	});
});
