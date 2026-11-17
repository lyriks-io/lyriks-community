import { describe, expect, it } from 'vitest';
import { McpUnspaghettitAdvisor } from './mcp-unspaghettit-advisor.server';
import { UnspaEngineClient } from './unspa-engine-client.server';

/** An engine that records the arguments of each read and answers one canned payload. */
function recordingAdvisor(answer: unknown) {
	const calls: { name: string; args: unknown }[] = [];
	const engine = {
		available: true,
		client: async () => null,
		callJson: async (name: string, args: unknown) => {
			calls.push({ name, args });
			return answer;
		}
	} as unknown as UnspaEngineClient;
	return { advisor: new McpUnspaghettitAdvisor({ command: 'noop' } as never, engine), calls };
}

describe('McpUnspaghettitAdvisor: the language of the gaps', () => {
	it('asks the engine for another language than English, and leaves English implicit', async () => {
		const { advisor, calls } = recordingAdvisor({ gaps: [] });
		await advisor.getSpecGapsAndProof('feat-1', undefined, 'fr');
		await advisor.getSpecGapsAndProof('feat-1', undefined, 'en');
		await advisor.getSpecGapsAndProof('feat-1');
		expect(calls).toEqual([
			{ name: 'get_spec_gaps', args: { featureId: 'feat-1', language: 'fr' } },
			{ name: 'get_spec_gaps', args: { featureId: 'feat-1' } },
			{ name: 'get_spec_gaps', args: { featureId: 'feat-1' } }
		]);
	});

	it('carries the stable code and subject of a gap, and an empty code from an older engine', async () => {
		const { advisor } = recordingAdvisor({
			gaps: [
				{
					severity: 'critical',
					entityType: 'action',
					entityId: 'act-1',
					entityName: 'Pay',
					reason: "L'énoncé « X » est enfreint.",
					suggestedFix: '',
					code: 'proof:reachable-violation',
					subjectId: 'inv-x'
				},
				{ severity: 'recommended', entityType: 'action', entityId: 'act-2', entityName: 'Ship', reason: 'Old text' }
			]
		});
		const { gaps } = await advisor.getSpecGapsAndProof('feat-1', undefined, 'fr');
		expect(gaps[0]).toMatchObject({ code: 'proof:reachable-violation', subjectId: 'inv-x' });
		expect(gaps[1]!.code).toBe('');
		expect(gaps[1]).not.toHaveProperty('subjectId');
	});
});
