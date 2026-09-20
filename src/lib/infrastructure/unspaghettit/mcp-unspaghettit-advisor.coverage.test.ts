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
	it('tallies what reports and syncs located', async () => {
		const { engine, calls } = fakeEngine({
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
		expect(calls).toEqual(['get_implementation_status']);
	});

	it('never cross-references an index the engine found on its own', async () => {
		// A platform run from its checkout hands the engine that checkout's
		// `.unspa.json`, another project's: the gaps tool then answers "all missing"
		// for a feature whose sync just located nearly everything.
		const { engine, calls } = fakeEngine({
			get_implementation_gaps: { stats: { total: 264, implemented: 0, partial: 0, missing: 264 } },
			get_implementation_status: {
				actions: [{ expectedEntities: [1, 2, 3, 4], foundEntities: [1, 2, 3] }],
				surfaces: []
			}
		});

		const coverage = await advisor(engine).getImplementationCoverage('feat-1');

		expect(coverage).toEqual({ total: 4, implemented: 3, partial: 0, missing: 1, percentage: 75 });
		expect(calls).not.toContain('get_implementation_gaps');
	});

	it('reads a feature nobody adopted as absent, not as zero per cent', async () => {
		const { engine } = fakeEngine({
			get_implementation_status: { actions: [], surfaces: [] }
		});

		expect(await advisor(engine).getImplementationCoverage('feat-1')).toBeNull();
	});

	it('adds what is proven and what verifies each criterion, from the same single call', async () => {
		const { engine, calls } = fakeEngine({
			get_implementation_status: {
				actions: [
					{ actionId: 'act-1', expectedEntities: [1, 2, 3, 4], foundEntities: [1, 2, 3, 4], verifiedAt: '2026-09-20T09:00:00.000Z' },
					{ actionId: 'act-2', expectedEntities: [1, 2, 3, 4], foundEntities: [1, 2] }
				],
				surfaces: [],
				verified: { actions: 1, total: 2 },
				criteria: [
					{
						criterionId: 'crit-1',
						title: 'Footsteps are silent in deep water',
						standing: 'active',
						key: 'criterion:crit-1',
						indexed: true,
						state: 'verified',
						stale: false,
						verification: { kind: 'integration', lastResult: { passed: true, at: '2026-09-20T09:00:00.000Z' } }
					},
					{ criterionId: 'crit-2', title: 'Old rule', standing: 'superseded by crit-1', indexed: false, state: 'none', stale: false }
				]
			}
		});

		const coverage = await advisor(engine).getImplementationCoverage('feat-1');

		// Proof never feeds the percentage: 6 located of 8, whatever was proven.
		expect(coverage).toMatchObject({ total: 8, implemented: 6, percentage: 75 });
		expect(coverage?.proven).toEqual({ actions: 1, total: 2 });
		expect(coverage?.criteria?.map((criterion) => [criterion.id, criterion.state, criterion.standing])).toEqual([
			['crit-1', 'verified', 'active'],
			['crit-2', 'none', 'superseded by crit-1']
		]);
		expect(calls).toEqual(['get_implementation_status']);
	});

	it('carries neither key on an engine that sends neither block', async () => {
		const { engine } = fakeEngine({
			get_implementation_status: {
				actions: [{ expectedEntities: [1, 2], foundEntities: [1] }],
				surfaces: []
			}
		});

		const coverage = await advisor(engine).getImplementationCoverage('feat-1');

		expect(coverage).not.toBeNull();
		expect('proven' in coverage!).toBe(false);
		expect('criteria' in coverage!).toBe(false);
	});

	it('stays absent for a feature nobody located, even when the engine lists its criteria', async () => {
		// Known limit: coverage is the carrier, and null is what an un-adopted feature
		// reads as. The evidence is still readable through get_implementation_status.
		const { engine } = fakeEngine({
			get_implementation_status: {
				actions: [],
				surfaces: [],
				verified: { actions: 0, total: 0 },
				criteria: [{ criterionId: 'crit-1', title: 'T', state: 'unverified', indexed: true }]
			}
		});

		expect(await advisor(engine).getImplementationCoverage('feat-1')).toBeNull();
	});
});
