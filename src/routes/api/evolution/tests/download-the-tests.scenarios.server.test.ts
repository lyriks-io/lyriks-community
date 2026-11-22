import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { createDraftLeaf, createEvolutionRequest, TESTS_NOT_PUT_TOGETHER, type DraftLeaf, type TestKitFeature } from '$domain/evolution';

/**
 * Download the tests of the frozen version (feat-25, action d0e52b5a), every
 * scenario through the real route. While version N+1 is in correction it
 * hands out version N's tests, the version the code is built against; once
 * N+1 is frozen, its own (EVO-012). The engine stand-in computes the draft's
 * feature from the operations of its model, so the two versions read apart.
 * Not tested here: someone outside the workspace (ad6344ea), answered 404 by
 * the access check, which the Enterprise workspace adapter decides.
 */
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: vi.fn(async () => {}) }));
vi.mock('$lib/server/community-locks.server', () => ({ requireEvolutionAccess: vi.fn() }));
vi.mock('$lib/server/evolution-view.server', () => ({ loadEvolutionView: vi.fn(async () => scene.view) }));

import { GET } from './+server';

const draftOf = (op: string, criterion: string): DraftLeaf =>
	createDraftLeaf({
		id: 'draft:r-1',
		kind: 'amend',
		baseLeafId: 'feat-1',
		acceptanceCriteria: [{ id: 'c-1', text: criterion }],
		behaviourModel: { operations: [{ kind: 'add_action', name: op }], mintedIds: [], updatedAt: '2026-11-19T10:00:00Z' }
	});
const VERSION_1 = draftOf('Share the cart', 'A saved cart comes back');
const CORRECTED = draftOf('Print a receipt', 'A saved cart comes back with the prices of the day');

const engine = { answers: true };
const pack = vi.fn((_input: { features: readonly TestKitFeature[]; specVersion: number }) => ({ bytes: new Uint8Array([1]) }));
const services = {
	readBehaviorFeature: { execute: async () => ({ feature: { id: 'feat-1', name: 'Checkout', surfaces: [] } }) },
	simulateBehavior: {
		draftFeatureWalk: async (_p: string, target: { model?: { operations: { name: string }[] } }) =>
			engine.answers
				? { kind: 'walk', walk: { ok: true, feature: { id: 'feat-1', name: 'Checkout', surfaces: [{ id: 's1', name: 'Cart', actions: (target.model?.operations ?? []).map((o) => ({ id: o.name, name: o.name })) }] } } }
				: null
	},
	packEvolutionTestKit: { execute: pack }
};
const event = (runner = 'vitest') => ({ locals: { services }, url: new URL(`http://platform/api/evolution/tests?projectId=p&requestId=r&runner=${runner}`) }) as unknown as Parameters<typeof GET>[0];
const T = (id: string) => `[unspa:55da6501:d0e52b5a:${id}]`;
const frozenAt1 = (over = {}) => createEvolutionRequest({ id: 'r', title: 'Save a cart for later', stage: 'implementation', frozen: true, specVersion: 1, leafIds: ['feat-1', 'draft:r-1'], drafts: [VERSION_1], ...over });
const status = async (run: () => Response | Promise<Response>) => Promise.resolve().then(run).then((r) => r.status, (e: unknown) => (isHttpError(e) ? e.status : Promise.reject(e)));

function show(request: ReturnType<typeof createEvolutionRequest>) {
	scene.view = { projectId: 'p', draft: { projectId: 'p', requests: [request] }, features: { leafMeta: { 'draft:r-1': { acceptanceCriteria: [{ id: 'c-typed', text: 'Typed on the corrected draft' }] } } }, leaves: [] };
}
const packed = () => pack.mock.calls.at(-1)![0];
const actionsOf = (f: TestKitFeature) => ((f.snapshot as { surfaces: { actions: { name: string }[] }[] }).surfaces[0].actions ?? []).map((a) => a.name);

describe('Download the tests of the frozen version', () => {
	beforeEach(() => {
		pack.mockClear();
		engine.answers = true;
	});

	it(`a developer takes the tests for Vitest ${T('34bbc154')}`, async () => {
		show(frozenAt1());
		const res = await GET(event());
		expect(res.headers.get('content-disposition')).toContain('-v1-vitest-tests.zip');
		expect(packed().features).toHaveLength(1);
	});

	it(`a reader takes the tests for the Node runner ${T('1b07bfb9')}`, async () => {
		show(frozenAt1());
		const res = await GET(event('node'));
		expect(res.headers.get('content-disposition')).toContain('-v1-node-tests.zip');
	});

	it(`no tests before a version is frozen ${T('993420b4')}`, async () => {
		show(createEvolutionRequest({ id: 'r', title: 'Save a cart for later', stage: 'specification', leafIds: ['feat-1'] }));
		expect(await status(() => GET(event()))).toBe(409);
		expect(pack).not.toHaveBeenCalled();
	});

	it(`a deleted request has no tests ${T('62b57a4b')}`, async () => {
		show(frozenAt1({ status: 'deleted' }));
		expect(await status(() => GET(event()))).toBe(404);
	});

	it(`no archive while the drafts cannot be read ${T('f7105642')}`, async () => {
		show(frozenAt1());
		engine.answers = false;
		const thrown = await Promise.resolve().then(() => GET(event())).then(() => null, (e: unknown) => e);
		expect(isHttpError(thrown) && thrown.status === 503 && thrown.body.message === TESTS_NOT_PUT_TOGETHER).toBe(true);
		expect(pack).not.toHaveBeenCalled();
	});
});

describe('while a correction is open, the tests of the frozen version read version N [criterion:ac-leaf-3baf05de-369c-4eb6-9874-c53253590160]', () => {
	beforeEach(() => {
		pack.mockClear();
		engine.answers = true;
	});

	it(`while version 2 is in correction the tests are version 1's ${T('fc1de972')}`, async () => {
		show(
			createEvolutionRequest({
				id: 'r',
				title: 'Save a cart for later',
				stage: 'implementation',
				frozen: true,
				specVersion: 1,
				leafIds: ['feat-1', 'draft:r-1'],
				drafts: [CORRECTED],
				correction: { of: 1, openedAt: '2026-11-20T10:00:00Z', openedBy: 'ana@example.test', base: { drafts: [VERSION_1], criteria: { 'draft:r-1': [] } } }
			})
		);
		const res = await GET(event());
		expect(res.headers.get('content-disposition')).toContain('-v1-vitest-tests.zip');
		const [feature] = packed().features;
		expect(actionsOf(feature)).toEqual(['Share the cart']);
		expect(feature.criteria.map((c) => c.text)).toEqual(['A saved cart comes back']);
	});

	it('hands out the drafts as they stand once no correction is open', async () => {
		show(createEvolutionRequest({ id: 'r', title: 'Save a cart for later', stage: 'implementation', frozen: true, specVersion: 2, leafIds: ['feat-1', 'draft:r-1'], drafts: [CORRECTED] }));
		await GET(event());
		const [feature] = packed().features;
		expect(actionsOf(feature)).toEqual(['Print a receipt']);
		expect(feature.criteria.map((c) => c.text)).toEqual(['A saved cart comes back with the prices of the day', 'Typed on the corrected draft']);
	});
});
