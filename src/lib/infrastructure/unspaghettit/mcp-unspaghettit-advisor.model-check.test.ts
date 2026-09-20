import { describe, expect, it } from 'vitest';
import { McpUnspaghettitAdvisor } from './mcp-unspaghettit-advisor.server';
import { UnspaEngineClient } from './unspa-engine-client.server';

/** An engine whose model check answers a canned report. */
function advisorAnswering(report: Record<string, unknown>) {
	const engine = {
		available: true,
		client: async () => null,
		callJson: async (name: string) => (name === 'model_check' ? report : null)
	} as unknown as UnspaEngineClient;
	return new McpUnspaghettitAdvisor({ command: 'noop' } as never, engine);
}

describe('McpUnspaghettitAdvisor model check', () => {
	it('reads the actions a truncated search did not reach, apart from the dead ones', async () => {
		const report = await advisorAnswering({
			statesExplored: 2000,
			truncated: true,
			invariantViolations: [],
			deadActions: [],
			unreachedActions: [
				{ surfaceId: 'srf', actionId: 'a1', actionName: 'Turn Lively', reason: 'exploration stopped at 2000 states' },
				{ surfaceId: 'srf', actionId: 'a2' },
				{ surfaceId: 'srf' }
			]
		}).modelCheck('feat-1');

		expect(report?.deadActions).toEqual([]);
		// A row named by its id alone is kept; a row with neither name nor id helps nobody.
		expect(report?.unreachedActions).toEqual([
			{ surfaceId: 'srf', actionId: 'a1', actionName: 'Turn Lively', reason: 'exploration stopped at 2000 states' },
			{ surfaceId: 'srf', actionId: 'a2', actionName: 'a2', reason: '' }
		]);
	});

	it('leaves the list out for an engine that does not tell the two apart', async () => {
		const report = await advisorAnswering({
			statesExplored: 12,
			truncated: false,
			invariantViolations: [],
			deadActions: [{ actionName: 'Archive' }]
		}).modelCheck('feat-1');

		expect(report).not.toBeNull();
		expect('unreachedActions' in (report as object)).toBe(false);
	});
});

describe('McpUnspaghettitAdvisor spec gaps', () => {
	it('keeps a criterion gap as one, instead of filing it under actions', async () => {
		const engine = {
			available: true,
			client: async () => null,
			callJson: async (name: string) =>
				name === 'get_spec_gaps'
					? {
							gaps: [
								{ entityType: 'criterion', entityId: 'c1', entityName: 'Footsteps stop in water', severity: 'recommended', message: 'still active while c2 supersedes it' },
								{ entityType: 'something new', entityId: 'x', entityName: 'X', severity: 'recommended', message: 'm' }
							]
						}
					: null
		} as unknown as UnspaEngineClient;
		const gaps = await new McpUnspaghettitAdvisor({ command: 'noop' } as never, engine).getSpecGaps('feat-1');

		expect(gaps.map((gap) => gap.entityType)).toEqual(['criterion', 'action']);
	});
});
