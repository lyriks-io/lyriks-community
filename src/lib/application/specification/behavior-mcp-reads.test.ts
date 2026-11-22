import { describe, expect, it } from 'vitest';
import type { UnspaghettitAdvisorPort } from '$application/ports';
import { ReadBehaviorOperationsUseCase } from './read-behavior-operations';

/** An engine that knows one operation and a reference that would be costly to load. */
const engine = {
	getOperationsReference: async () => '# Every operation',
	describeOperations: async (kind: string) => (kind === 'add_action_rule' ? { ok: true, kind, schema: 'add_action_rule { surfaceId, actionId, rule }' } : { ok: false, kind })
} satisfies Pick<UnspaghettitAdvisorPort, 'getOperationsReference' | 'describeOperations'>;

describe('reading the behavior operations vocabulary', () => {
	it('answers the whole reference when no operation is named, and only that operation otherwise', async () => {
		const read = new ReadBehaviorOperationsUseCase(engine);
		expect(await read.execute()).toBe('# Every operation');
		expect(await read.execute('add_action_rule')).toEqual({ ok: true, kind: 'add_action_rule', schema: 'add_action_rule { surfaceId, actionId, rule }' });
	});
});
