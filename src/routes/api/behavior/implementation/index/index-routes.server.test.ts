import { describe, expect, it, vi } from 'vitest';
import { isHttpError, type RequestEvent } from '@sveltejs/kit';
import type { AccessAction, AccessDecision, AdoptionResult, BehaviorPort, CodeAdoptionPort } from '$application/ports';
import { FindIndexKeyOwnersUseCase, MoveIndexPositionsUseCase } from '$application/use-cases';
import { createEmptyFeaturesDraft } from '$domain/features/draft';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { memoryIndexGuard } from '$lib/server/index-revisions.fixture';

// What a landed sync also moves (Evolution holdings, reports at Build) is
// proven with those features; here a sync is the engine's answer alone.
vi.mock('$lib/server/evolution-held-index.server', () => ({ holdDraftEntries: async (_s: unknown, _p: unknown, _i: unknown, answer: unknown) => answer }));
vi.mock('$lib/server/evolution-auto-report.server', () => ({ rebuildReportsAfterSync: async () => undefined }));
// The feature a draft's behaviour model makes is computed by the engine: here, what the test says it is.
const draftWalk = vi.hoisted(() => ({ feature: null as Record<string, unknown> | null }));
vi.mock('$lib/server/evolution-graph.server', () => ({
	readDraftFeature: async () => (draftWalk.feature ? { status: 'computed', feature: draftWalk.feature } : { status: 'unanswered' })
}));

const { POST: SYNC } = await import('./+server');
const { POST: OWNERS } = await import('./owners/+server');
const { POST: POSITIONS } = await import('./positions/+server');
const { GET: REVISION } = await import('./revision/+server');
const { GET: STATUS, POST: REPORT } = await import('../status/+server');

/**
 * The index sync tooling of feat-100 through its routes: the revision every
 * write answers and guards on, the lookup of where keys belong, the move of
 * located lines, and who may ask for the sync command. The engine is a fake
 * that records what it was sent; the use cases and the guard are the real ones.
 */

const CART = {
	id: 'feat-cart',
	acceptanceCriteria: [{ id: 'c-pay' }],
	surfaces: [
		{
			id: 's-cart',
			stateDefinitions: [{ id: 'st-total', path: 'cart.total' }, { id: 'st-role', path: 'session.role' }],
			rules: [],
			invariants: [],
			transitions: [],
			actions: [{ id: 'a-pay', emittedEvents: [], rules: [{ id: 'r-funds' }, { id: 'r-new' }], invariants: [], transitions: [] }]
		}
	]
};
const PROFILE = {
	id: 'feat-profile',
	surfaces: [{ id: 's-profile', stateDefinitions: [{ id: 'st-role-2', path: 'session.role' }], rules: [], invariants: [], transitions: [], actions: [] }]
};
const PAY_STATUS = {
	actions: [
		{
			actionId: 'a-pay',
			foundEntities: [
				{ entityType: 'action', entityId: 'a-pay', locations: [{ file: 'src/pay.ts', line: 10, snippet: 'export function pay(' }] },
				{ entityType: 'rule', entityId: 'r-funds', locations: [{ file: 'src/pay.ts', line: 20, snippet: 'if (funds < total)' }] }
			],
			auditMeta: { verifiedAt: '2026-11-19T01:00:00.000Z' }
		}
	]
};

type Decide = (action: AccessAction) => AccessDecision;
const writer: Decide = () => ({ ok: true });
const viewer: Decide = (action) => (action === 'read' ? { ok: true } : { ok: false, reason: 'forbidden' });
const outsider: Decide = () => ({ ok: false, reason: 'not_found' });

/** An Evolution request whose draft amends the cart, as the dossier holds it. */
const OPEN_REQUEST = {
	id: 'req-7',
	title: 'Hold a payment',
	status: 'open',
	deployment: null,
	drafts: [{ id: 'd-cart', kind: 'amend', baseLeafId: 'feat-cart', materialisedAs: null, materialisedAt: null, acceptanceCriteria: [] }]
};

function platform(opts: { decide?: Decide; engineUp?: boolean; evolution?: unknown } = {}) {
	const synced: Record<string, unknown>[] = [];
	const reported: unknown[] = [];
	const invalidated: string[] = [];
	const snapshots: Record<string, unknown> = { 'feat-cart': CART, 'feat-profile': PROFILE };
	const behaviorPort = {
		readProject: async () => ({ project: { featureIds: ['feat-cart', 'feat-profile'] } }),
		readFeature: async (_projectId: string, featureId: string) => (snapshots[featureId] ? { feature: snapshots[featureId] } : null)
	} as unknown as BehaviorPort;
	const landed = (value: Record<string, unknown>): AdoptionResult => ({ ok: true, value });
	const codeAdoption = {
		available: opts.engineUp !== false,
		syncImplementationIndex: async (_projectId: string, index: Record<string, unknown>) => {
			synced.push(index);
			return landed({ ok: true, synced: 1, acks: [] });
		},
		getImplementationStatus: async (featureId: string) => landed(featureId === 'feat-cart' ? PAY_STATUS : { status: null }),
		reportImplementationStatus: async (input: unknown) => {
			reported.push(input);
			return landed({ recorded: 1 });
		}
	} as unknown as CodeAdoptionPort;
	const guard = memoryIndexGuard();
	const services = servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		projectAccess: { authorize: async (_id, _token, action) => (opts.decide ?? writer)(action) },
		enterpriseHooks: null,
		loadFeaturesDraft: {
			execute: async (projectId) => {
				const draft = createEmptyFeaturesDraft(projectId);
				draft.features = [{ id: 'feat-cart', name: 'Cart', coreId: 'c', parentFamilyId: null, description: '', unspaghettitFeatureId: 'feat-cart' }];
				return draft;
			}
		},
		detectFeatureIdCollision: { execute: async () => [] },
		loadEvolutionDraft: { execute: async (projectId) => ({ projectId, requests: opts.evolution ? [opts.evolution] : [] }) as never },
		readBehaviorFeature: { execute: async (_projectId, featureId) => (snapshots[featureId] ? ({ feature: snapshots[featureId] } as never) : null) },
		codeAdoption,
		implementationCoverage: { invalidate: (projectId) => void invalidated.push(projectId) },
		guardIndexWrite: guard,
		findIndexKeyOwners: new FindIndexKeyOwnersUseCase(behaviorPort),
		moveIndexPositions: new MoveIndexPositionsUseCase(behaviorPort, codeAdoption)
	});
	return { services, synced, reported, invalidated, guard };
}

type Handler = (event: RequestEvent<never, never>) => Response | Promise<Response>;

async function send(services: ReturnType<typeof platform>['services'], handler: Handler, path: string, body?: unknown) {
	const event = requestEvent({
		path,
		method: body === undefined ? 'GET' : 'POST',
		body: body === undefined ? undefined : JSON.stringify(body),
		authRequired: true,
		services,
		cookies: { lyriks_session: 'jwt' }
	});
	return Promise.resolve(handler(event as never)).then(
		async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }),
		(failure: unknown) => (isHttpError(failure) ? { status: failure.status, body: failure.body as unknown as Record<string, unknown> } : Promise.reject(failure))
	);
}

const sync = (services: ReturnType<typeof platform>['services'], index: Record<string, unknown>, expectedRevision?: unknown) =>
	send(services, SYNC as Handler, '/api/behavior/implementation/index', { projectId: 'p-shop', index, ...(expectedRevision === undefined ? {} : { expectedRevision }) });

describe('the revision of the index (criteria fbe61ab1 and 93abb7df)', () => {
	it('answers its revision at every write, one more at each one that lands, and on a read of the status [criterion:fbe61ab1]', async () => {
		const { services } = platform();
		expect((await sync(services, { 'action:a-pay': {} })).body).toMatchObject({ ok: true, synced: 1, revision: 1 });
		expect((await sync(services, { 'surface:s-cart': {} })).body.revision).toBe(2);
		const moved = await send(services, POSITIONS as Handler, '/api/behavior/implementation/index/positions', { projectId: 'p-shop', index: { 'rule:r-funds': { file: 'src/pay.ts', line: 22, signature: 'if (funds < total)' } } });
		expect(moved.body).toMatchObject({ ok: true, moved: 1, revision: 3 });
		const report = { projectId: 'p-shop', featureId: 'feat-cart', actionId: 'a-pay', foundEntities: [] };
		expect((await send(services, REPORT as Handler, '/api/behavior/implementation/status', report)).body).toMatchObject({ recorded: 1, revision: 4 });
		expect((await send(services, STATUS as Handler, '/api/behavior/implementation/status?projectId=p-shop&featureId=feat-cart')).body.revision).toBe(4);
		expect((await send(services, REVISION as Handler, '/api/behavior/implementation/index/revision?projectId=p-shop')).body).toEqual({ projectId: 'p-shop', revision: 4 });
	});

	it('refuses a sync against an older revision only where a write since touched a unit it sends, writing nothing [criterion:93abb7df] [rule:bedac77e]', async () => {
		const { services, synced } = platform();
		await sync(services, { 'action:a-pay': {}, 'rule:r-funds': {} }); // revision 1
		await sync(services, { 'surface:s-cart': {} }); // revision 2, another checkout
		// Written against revision 1: the surface moved since, the action did not.
		expect((await sync(services, { 'action:a-pay': {} }, 1)).body).toMatchObject({ ok: true, revision: 3 });
		const refused = await sync(services, { 'surface:s-cart': {}, 'state:cart.total': {} }, 1);
		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({ expectedRevision: 1, currentRevision: 3, units: ['surface:s-cart'], total: 1 });
		expect(String(refused.body.message)).toContain('send again with expected_revision 3');
		expect(synced).toHaveLength(3);
		// Without an expected revision a write lands as it always did.
		expect((await sync(services, { 'surface:s-cart': {} })).body.revision).toBe(4);
		expect((await sync(services, { 'action:a-pay': {} }, 'three')).status).toBe(400);
	});

	it('refuses a report against an older revision where a write replaced its action since [rule:fc406a24]', async () => {
		const { services, reported } = platform();
		await sync(services, { 'action:a-pay': {} }); // revision 1
		const report = { projectId: 'p-shop', featureId: 'feat-cart', actionId: 'a-pay', foundEntities: [], expectedRevision: 0 };
		const refused = await send(services, REPORT as Handler, '/api/behavior/implementation/status', report);
		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({ units: ['action:a-pay'], currentRevision: 1 });
		expect(reported).toEqual([]);
		expect((await send(services, REPORT as Handler, '/api/behavior/implementation/status', { ...report, expectedRevision: 1 })).body.revision).toBe(2);
	});
});

describe('find which feature and unit hold index keys (action af8d9001)', () => {
	const lookup = (services: ReturnType<typeof platform>['services'], keys: unknown) =>
		send(services, OWNERS as Handler, '/api/behavior/implementation/index/owners', { projectId: 'p-shop', keys });

	it('names the feature and the unit of every key, a shared state once per feature, a removed one as an orphan [criterion:60ba2862]', async () => {
		const { services, synced } = platform({ decide: viewer });
		const answer = await lookup(services, ['action:a-pay', 'rule:r-funds', 'state:session.role', 'rule:removed']);
		expect(answer).toEqual({
			status: 200,
			body: {
				projectId: 'p-shop',
				asked: 4,
				features: [
					{
						featureId: 'feat-cart',
						units: [
							{ unit: 'action:a-pay', keys: ['action:a-pay', 'rule:r-funds', 'rule:r-new'] },
							{ unit: 'surface:s-cart', keys: ['surface:s-cart', 'state:cart.total', 'state:session.role'] }
						],
						alone: []
					},
					{ featureId: 'feat-profile', units: [{ unit: 'surface:s-profile', keys: ['surface:s-profile', 'state:session.role'] }], alone: [] }
				],
				orphans: ['rule:removed']
			}
		});
		expect(synced).toEqual([]);
	});

	it('answers a key an open request adds with its request, its draft and the unit its model places it in; a key nothing holds stays an orphan [criterion:a501859a]', async () => {
		// The draft adds a rule to the payment action the cart already holds.
		const pay = CART.surfaces[0].actions[0];
		draftWalk.feature = { ...CART, surfaces: [{ ...CART.surfaces[0], actions: [{ ...pay, rules: [...pay.rules, { id: 'r-held' }] }] }] };
		const { services } = platform({ evolution: OPEN_REQUEST });
		const answer = await lookup(services, ['rule:r-held', 'rule:removed', 'rule:r-funds']);
		expect(answer.status).toBe(200);
		expect(answer.body.requests).toEqual([
			{ requestId: 'req-7', draftId: 'd-cart', units: [{ unit: 'action:a-pay', keys: ['action:a-pay', 'rule:r-funds', 'rule:r-new', 'rule:r-held'] }], alone: [] }
		]);
		// The official rule stays the feature's alone: the draft does not add it.
		expect(answer.body.features).toEqual([{ featureId: 'feat-cart', units: [{ unit: 'action:a-pay', keys: ['action:a-pay', 'rule:r-funds', 'rule:r-new'] }], alone: [] }]);
		expect(answer.body.orphans).toEqual(['rule:removed']);
	});

	it('names a request whose drafts cannot be read, and never reads it as adding nothing [criterion:a501859a]', async () => {
		draftWalk.feature = null;
		const answer = await lookup(platform({ evolution: OPEN_REQUEST }).services, ['rule:r-held']);
		expect(answer.body).toMatchObject({ orphans: ['rule:r-held'], requestsNotRead: ['req-7'] });
		expect(answer.body.requests).toBeUndefined();
	});

	it('refuses a lookup without keys [rule:24e16f46] and one past the most a call answers [rule:029982f3]', async () => {
		const { services } = platform();
		expect(await lookup(services, [])).toEqual({ status: 400, body: { message: 'keys must list at least one index key' } });
		const many = Array.from({ length: 151 }, (_, i) => `rule:r${i}`);
		expect(await lookup(services, many)).toEqual({ status: 400, body: { message: 'At most 150 keys per call: send the rest in another call.' } });
		expect((await lookup(services, many.slice(0, 150))).status).toBe(200);
	});

	it('finds no project outside the workspace [rule:327b6b3a], and no owners without the engine [rule:e26f99f3]', async () => {
		expect((await lookup(platform({ decide: outsider }).services, ['rule:r-funds'])).status).toBe(404);
		expect(await lookup(platform({ engineUp: false }).services, ['rule:r-funds'])).toEqual({ status: 503, body: { message: 'Behavior engine unavailable' } });
	});
});

describe('update where located elements now stand (action f20cf75e)', () => {
	const move = (services: ReturnType<typeof platform>['services'], index: unknown, expectedRevision?: number) =>
		send(services, POSITIONS as Handler, '/api/behavior/implementation/index/positions', { projectId: 'p-shop', index, ...(expectedRevision === undefined ? {} : { expectedRevision }) });

	it('updates the place of a located key with its unit as it was, lists the keys not located yet, and leaves the coverage [criterion:e9699cc6]', async () => {
		const { services, synced, invalidated } = platform();
		const answer = await move(services, {
			'rule:r-funds': { status: 'implemented', file: 'src/pay.ts', line: 24, signature: 'if (funds < total)' },
			'rule:r-new': { status: 'implemented', file: 'src/pay.ts', line: 40, signature: 'if (late)' },
			'rule:gone': { file: 'src/pay.ts', line: 41 }
		});
		expect(answer.status).toBe(200);
		expect(answer.body).toMatchObject({
			ok: false,
			positionsOnly: true,
			sent: 3,
			moved: 1,
			units: { total: 1, entries: ['action:a-pay'] },
			notLocated: { total: 1, entries: ['rule:r-new'] },
			orphans: { total: 1, entries: ['rule:gone'] },
			revision: 1
		});
		// The action lands again with what it located, its proof kept, the new rule left out.
		expect(synced).toEqual([
			{
				'action:a-pay': { verifiedAt: '2026-11-19T01:00:00.000Z', status: 'implemented', file: 'src/pay.ts', line: 10, signature: 'export function pay(' },
				'rule:r-funds': { status: 'implemented', file: 'src/pay.ts', line: 24, signature: 'if (funds < total)' }
			}
		]);
		expect(invalidated).toEqual(['p-shop']);
	});

	it('moves nothing when nothing is sent [rule:6de2df9e], for a viewer [rule:eb218fdd], outside the workspace [rule:4734ba20] or without the engine [rule:ed3ce49d]', async () => {
		const index = { 'rule:r-funds': { file: 'src/pay.ts', line: 24 } };
		const plain = platform();
		expect(await move(plain.services, {})).toEqual({ status: 400, body: { message: 'No entry sent: nothing to move.' } });
		expect((await move(platform({ decide: viewer }).services, index)).status).toBe(403);
		expect((await move(platform({ decide: outsider }).services, index)).status).toBe(404);
		expect((await move(platform({ engineUp: false }).services, index)).status).toBe(503);
		expect(plain.synced).toEqual([]);
	});

	it('refuses a move written against an older index where it overlaps [rule:1eb2ecf1]', async () => {
		const { services, synced } = platform();
		await sync(services, { 'action:a-pay': {} }); // revision 1, another checkout
		const refused = await move(services, { 'rule:r-funds': { file: 'src/pay.ts', line: 24, signature: 'x' } }, 0);
		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({ units: ['action:a-pay'], currentRevision: 1 });
		expect(synced).toHaveLength(1);
	});
});

describe('who may ask for the sync command (action aa15bfce)', () => {
	const revision = (decide: Decide) => send(platform({ decide }).services, REVISION as Handler, '/api/behavior/implementation/index/revision?projectId=p-shop');

	it('answers the revision to whoever may write, refuses a viewer [rule:010413db] and finds no project outside the workspace [rule:8999e3bd]', async () => {
		expect(await revision(writer)).toEqual({ status: 200, body: { projectId: 'p-shop', revision: 0 } });
		expect(await revision(viewer)).toEqual({ status: 403, body: { message: 'forbidden' } });
		expect(await revision(outsider)).toEqual({ status: 404, body: { message: 'Project not found' } });
	});
});
