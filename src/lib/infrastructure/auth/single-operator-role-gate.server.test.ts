import { describe, expect, it } from 'vitest';
import { SingleOperatorRoleGate } from './single-operator-role-gate.server';

describe('SingleOperatorRoleGate', () => {
	const gate = new SingleOperatorRoleGate();

	it('opens every door to a session, since the one operator is the writer', async () => {
		await expect(gate.allows('jwt', 'write', null)).resolves.toBe(true);
		await expect(gate.allows('jwt', 'mcp', 'ws-elsewhere')).resolves.toBe(true);
	});

	it('refuses a request that carries no session at all', async () => {
		await expect(gate.allows(null, 'write', null)).resolves.toBe(false);
		await expect(gate.allows('', 'mcp', null)).resolves.toBe(false);
	});
});
