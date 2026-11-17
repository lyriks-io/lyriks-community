import { describe, expect, it } from 'vitest';
import { McpUnspaghettitAdvisor } from './mcp-unspaghettit-advisor.server';
import { UnspaEngineClient } from './unspa-engine-client.server';

/** An engine answering canned reads by tool name, on an installation that proves unless told otherwise. */
function advisorAnswering(answers: Record<string, unknown>, proofs = true, asked: string[] = []) {
	const engine = {
		available: true,
		client: async () => null,
		callJson: async (name: string) => {
			asked.push(name);
			return answers[name] ?? null;
		}
	} as unknown as UnspaEngineClient;
	return new McpUnspaghettitAdvisor({ command: 'noop', proofs } as never, engine);
}

describe('McpUnspaghettitAdvisor: where the installation does not prove', () => {
	it('passes no proof on and never asks the engine for one', async () => {
		const asked: string[] = [];
		const advisor = advisorAnswering(
			{ get_spec_gaps: { gaps: [], proof: { solver: 'ran', questions: 1, unsettled: 0 } } },
			false,
			asked
		);
		expect((await advisor.getSpecGapsAndProof('feat-1')).proof).toBeNull();
		expect(await advisor.proveFeatureRules('feat-1')).toBeNull();
		expect(await advisor.solverStatus()).toBeNull();
		expect(asked).toEqual(['get_spec_gaps']);
	});
});

describe('McpUnspaghettitAdvisor: the solver and the proof module behind it', () => {
	it('reads the proof module the engine loaded, and the one it could not', async () => {
		const loaded = advisorAnswering({
			solver_status: { kind: 'native', version: '5.1.0', prover: { name: '@lyriks/unspa-prover', version: '0.26.0' } }
		});
		expect(await loaded.solverStatus()).toEqual({
			kind: 'native',
			version: '5.1.0',
			prover: { name: '@lyriks/unspa-prover', version: '0.26.0' }
		});
		const refused = advisorAnswering({
			solver_status: { kind: 'none', reason: 'built for engine contract 2', prover: { name: '@lyriks/unspa-prover' } }
		});
		expect(await refused.solverStatus()).toEqual({
			kind: 'none',
			reason: 'built for engine contract 2',
			prover: { name: '@lyriks/unspa-prover', version: null }
		});
		// An engine that predates the module answers without it.
		expect(await advisorAnswering({ solver_status: { kind: 'native', version: '5.1.0' } }).solverStatus()).toEqual({
			kind: 'native',
			version: '5.1.0'
		});
	});
});

describe('McpUnspaghettitAdvisor: what the solver and the exploration left aside', () => {
	it('keeps the solver answer beside the gaps, every statement with its outcome', async () => {
		const { gaps, proof } = await advisorAnswering({
			get_spec_gaps: {
				gaps: [{ severity: 'critical', entityType: 'action', entityId: 'a1', entityName: 'Withdraw', reason: 'breaks', suggestedFix: 'guard' }],
				proof: {
					solver: 'ran',
					questions: 37,
					unsettled: 2,
					paths: {
						maxSteps: 6,
						results: [
							{ invariantId: 'i1', invariantName: 'Balance never negative', outcome: 'violated', steps: 1 },
							{ invariantId: 'i2', invariantName: 'Daily cap respected', outcome: 'none-within-bound' },
							{ invariantId: 'i3', invariantName: 'Every line holds an item', outcome: 'unsupported', reason: 'it reads a count over a list' },
							{ invariantId: 'i4', invariantName: 'Unknown', outcome: 'something new' }
						]
					},
					actions: {
						maxSteps: 6,
						results: [
							{ actionId: 'a3', actionName: 'Post a comment', outcome: 'none-within-bound' },
							{ actionId: 'a4', actionName: 'Like video', outcome: 'reached', steps: 2 },
							{ actionId: 'a5', actionName: 'Odd', outcome: 'something new' }
						]
					},
					leads: [{ actionId: 'a2', actionName: 'Redeem', invariantId: 'i5', invariantName: 'Gold floor', situation: 'Situation: ...', pathSearch: 'no path within 6 steps from the start' }]
				}
			}
		}).getSpecGapsAndProof('feat-1');

		expect(gaps).toHaveLength(1);
		expect(proof).toMatchObject({ solver: 'ran', questions: 37, unsettled: 2 });
		expect(proof?.paths?.maxSteps).toBe(6);
		// An outcome the product does not know is left out rather than guessed.
		expect(proof?.paths?.results.map((row) => row.outcome)).toEqual(['violated', 'none-within-bound', 'unsupported']);
		expect(proof?.paths?.results[2]?.reason).toBe('it reads a count over a list');
		expect(proof?.actions?.results.map((row) => [row.actionName, row.outcome])).toEqual([
			['Post a comment', 'none-within-bound'],
			['Like video', 'reached']
		]);
		expect(proof?.leads).toEqual([expect.objectContaining({ actionName: 'Redeem', pathSearch: 'no path within 6 steps from the start' })]);
	});

	it('keeps a missing proof missing, never an empty one that reads clean', async () => {
		const { proof } = await advisorAnswering({ get_spec_gaps: { gaps: [] } }).getSpecGapsAndProof('feat-1');
		expect(proof).toBeNull();
	});

	it('reads the actions the exploration never ran', async () => {
		const report = await advisorAnswering({
			model_check: {
				statesExplored: 1,
				truncated: true,
				invariantViolations: [],
				deadActions: [],
				unreachedActions: [],
				skippedActions: [{ surfaceId: 'srf', actionId: 'a1', actionName: 'Top up', reason: 'required number parameter "amount" has no default' }]
			}
		}).modelCheck('feat-1');
		expect(report?.skippedActions).toEqual([
			{ surfaceId: 'srf', actionId: 'a1', actionName: 'Top up', reason: 'required number parameter "amount" has no default' }
		]);
	});
});
