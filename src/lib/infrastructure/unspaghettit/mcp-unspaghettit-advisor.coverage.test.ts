import { describe, expect, it } from 'vitest';
import { McpUnspaghettitAdvisor } from './mcp-unspaghettit-advisor.server';
import { UnspaEngineClient } from './unspa-engine-client.server';

/** An engine that answers each tool from a canned payload. */
function fakeEngine(replies: Record<string, unknown>) {
	const calls: string[] = [];
	const client = {
		callTool: async ({ name }: { name: string }) => {
			calls.push(name);
			const payload = replies[name];
			if (payload === undefined) return { content: [{ type: 'text', text: '' }] };
			return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
		}
	};
	const engine = {
		available: true,
		client: async () => client,
		callJson: async (name: string) => {
			calls.push(name);
			return replies[name] ?? null;
		}
	} as unknown as UnspaEngineClient;
	return { engine, calls };
}

const advisor = (engine: UnspaEngineClient) =>
	new McpUnspaghettitAdvisor({ command: 'noop' } as never, engine);

describe('McpUnspaghettitAdvisor implementation coverage', () => {
	it('tallies the status sidecar when there is no index to cross-reference', async () => {
		// The index lives in the caller's checkout; an appliance has none, so the
		// gaps tool answers nothing and coverage used to read as absent however
		// much had been reported.
		const { engine, calls } = fakeEngine({
			get_implementation_gaps: { stats: { total: 0 } },
			get_implementation_status: {
				actions: [
					{ expectedEntities: [1, 2, 3, 4], foundEntities: [1, 2, 3, 4] },
					{ expectedEntities: [1, 2, 3], foundEntities: [1] }
				],
				surfaces: [{ expectedEntities: [1, 2, 3], foundEntities: [1, 2, 3] }]
			}
		});

		const coverage = await advisor(engine).getImplementationCoverage('feat-1');

		expect(coverage).toEqual({ total: 10, implemented: 8, partial: 0, missing: 2, percentage: 80 });
		expect(calls).toContain('get_implementation_status');
	});

	it('keeps the index cross-reference when the engine can do it', async () => {
		const { engine, calls } = fakeEngine({
			get_implementation_gaps: { stats: { total: 4, implemented: 3, partial: 1, missing: 0 } }
		});

		const coverage = await advisor(engine).getImplementationCoverage('feat-1');

		expect(coverage).toEqual({ total: 4, implemented: 3, partial: 1, missing: 0, percentage: 75 });
		expect(calls).not.toContain('get_implementation_status');
	});

	it('reads a feature nobody adopted as absent, not as zero per cent', async () => {
		const { engine } = fakeEngine({
			get_implementation_gaps: { stats: { total: 0 } },
			get_implementation_status: { actions: [], surfaces: [] }
		});

		expect(await advisor(engine).getImplementationCoverage('feat-1')).toBeNull();
	});
});
