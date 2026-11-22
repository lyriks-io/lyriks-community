import { beforeEach, describe, expect, it, vi } from 'vitest';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...(await original<typeof import('./evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('./sync-bus.server', async (original) => ({ ...(await original<typeof import('./sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('./evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
import { batchScene, claude, requestAt, TEAM } from './evolution-batch-scene.fixture';

/**
 * Send the request back to its specification (feat-31, action 8032a834), every
 * scenario through the real batch of operations.
 */
const s = batchScene(scene);
const T = (id: string) => `[unspa:13e955f6:8032a834:${id}]`;
const rebrief = (actor = claude) => s.run([{ op: 'rebrief', requestId: 'r' }], actor);

describe('Send the request back to its specification', () => {
	beforeEach(() => s.show(requestAt('implementation')));

	it(`a designer reopens the frozen version from the build ${T('0d7ea44c')}`, async () => {
		expect((await rebrief()).ok).toBe(true);
		expect(s.saved()).toMatchObject({ stage: 'specification', frozen: false, specVersion: 1 });
		expect(s.saved().frozenVersions.map((v) => v.version)).toEqual([1]);
		expect(s.saved().history.at(-1)).toMatchObject({ type: 'spec_amended' });
	});

	it(`a request in Specify is not sent back ${T('90f4bdf5')}`, async () => {
		s.show(requestAt('specification'));
		expect(s.summaryOf(await rebrief(), 'rebrief')).toBe('The request is already in specification.');
	});

	it(`a closed request is not rebriefed ${T('c6fa882f')}`, async () => {
		s.show(requestAt('delivered', { status: 'closed' }));
		expect(s.summaryOf(await rebrief(), 'rebrief')).toBe('A closed request cannot be rebriefed.');
	});

	it(`an AI cannot send a request back in a team ${T('6c0357ec')}`, async () => {
		s.show(requestAt('coherence'), TEAM);
		const result = await rebrief(claude);
		expect(result.ok).toBe(false);
		expect(s.save).not.toHaveBeenCalled();
	});

	it(`a deleted request is not sent back ${T('83efd801')}`, async () => {
		s.show(requestAt('coherence', { status: 'deleted' }));
		const result = await rebrief();
		expect(result.ok).toBe(false);
		expect(s.current().stage).toBe('coherence');
	});

	it(`a rebrief closes the correction open in the Build ${T('80bdc400')}`, async () => {
		s.show(requestAt('implementation', { correction: { of: 1, openedAt: '2026-11-20T00:10:00Z', openedBy: 'ana@example.test' } }));
		expect((await rebrief()).ok).toBe(true);
		expect(s.saved().stage).toBe('specification');
		expect(s.saved().correction).toBeUndefined();
	});
});
