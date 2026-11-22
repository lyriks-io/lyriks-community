import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { createDraftLeaf, createEvolutionRequest, TESTS_NOT_PUT_TOGETHER } from '$domain/evolution';

/**
 * Rule b10172f4 (criterion 837e56b6): the tests of the frozen version are never
 * put together from a draft the engine did not answer for. The engine port
 * answers nothing here, as on a timeout or a recycled subprocess; the route
 * answers 503 with the reason, never an empty or partial archive.
 */
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: vi.fn(async () => {}) }));
vi.mock('$lib/server/community-locks.server', () => ({ requireEvolutionAccess: vi.fn() }));
vi.mock('$lib/server/evolution-view.server', () => ({ loadEvolutionView: vi.fn(async () => scene.view) }));

import { GET } from './+server';

const drafted = { id: 'feat-1', name: 'Checkout', acceptanceCriteria: [{ id: 'c1', title: 'A saved cart keeps its prices' }], surfaces: [] };
const request = createEvolutionRequest({
	id: 'r',
	title: 'Save a cart for later',
	stage: 'implementation',
	frozen: true,
	specVersion: 1,
	leafIds: ['feat-1'],
	drafts: [createDraftLeaf({ id: 'draft:r-1', kind: 'amend', baseLeafId: 'feat-1', behaviourModel: { operations: [{ kind: 'add_action' }], mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' } })]
});

let answers = true;
const pack = vi.fn(() => ({ bytes: new Uint8Array([1, 2, 3]) }));
const services = {
	readBehaviorFeature: { execute: async () => ({ feature: { id: 'feat-1', name: 'Checkout', surfaces: [] } }) },
	simulateBehavior: { draftFeatureWalk: async () => (answers ? { kind: 'walk', walk: { ok: true, feature: structuredClone(drafted) } } : null) },
	packEvolutionTestKit: { execute: pack }
};
const event = () =>
	({
		locals: { services },
		url: new URL('http://platform/api/evolution/tests?projectId=p&requestId=r&runner=vitest')
	}) as unknown as Parameters<typeof GET>[0];

beforeEach(() => {
	answers = true;
	pack.mockClear();
	scene.view = { projectId: 'p', draft: { projectId: 'p', requests: [request] }, features: { leafMeta: {} }, leaves: [] };
});

describe('no archive from drafts the engine did not answer [criterion:837e56b6]', () => {
	it('answers 503 with the reason, and puts no archive together', async () => {
		answers = false;
		const thrown = await Promise.resolve().then(() => GET(event())).then(() => null, (e: unknown) => e);
		expect(isHttpError(thrown)).toBe(true);
		if (!isHttpError(thrown)) return;
		expect(thrown.status).toBe(503);
		expect(thrown.body.message).toBe(TESTS_NOT_PUT_TOGETHER);
		expect(pack).not.toHaveBeenCalled();
	});

	it('hands the archive of the drafted feature once the engine answers', async () => {
		const res = await GET(event());
		expect(res.status).toBe(200);
		expect(pack).toHaveBeenCalledTimes(1);
		const [input] = pack.mock.calls[0] as unknown as [{ features: { snapshot: unknown }[] }];
		expect(input.features[0].snapshot).toEqual(drafted);
	});
});
