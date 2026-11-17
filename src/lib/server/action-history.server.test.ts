import { beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({ admin: false, role: 'member' as string, loads: 0 }));
vi.mock('./admin.server', () => ({ isAdmin: () => gate.admin }));
vi.mock('./evolution-actor.server', () => ({ resolveRole: async () => gate.role }));
vi.mock('$application/retrospec/retrospec-store', () => ({
	loadRetrospecDocument: async () => {
		gate.loads++;
		return { doc: { version: 1, runs: [], comments: {}, history: [{ at: '2026-11-10T09:30:00.000Z', by: { id: 'a', name: 'Ann' }, action: 'run_validated', subject: '', count: 0, note: '' }] }, revision: 1 };
	}
}));

const { readActionHistory } = await import('./action-history.server');
type Caller = Parameters<typeof readActionHistory>[0];
const caller = { locals: { services: { sectionDocuments: {} } }, cookies: { get: () => undefined } } as unknown as Caller;

describe('the history of actions reaches administrators alone [criterion:64d191d6]', () => {
	beforeEach(() => {
		gate.admin = false;
		gate.role = 'member';
		gate.loads = 0;
	});

	it('is sent to an administrator of the instance', async () => {
		gate.admin = true;
		expect(await readActionHistory(caller, 'p')).toMatchObject([{ who: 'Ann', what: 'validated the Reverse-Specification' }]);
	});

	it.each(['owner', 'admin'])('is sent to the %s of the workspace', async (role) => {
		gate.role = role;
		expect(await readActionHistory(caller, 'p')).toHaveLength(1);
	});

	it.each(['member', 'viewer'])('is not even read for a %s', async (role) => {
		gate.role = role;
		expect(await readActionHistory(caller, 'p')).toBeNull();
		expect(gate.loads).toBe(0);
	});
});
