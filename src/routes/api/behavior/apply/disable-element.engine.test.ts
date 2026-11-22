import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { AccessDecision } from '$application/ports';
import { AuthorBehaviorUseCase } from '$application/specification/author-behavior';
import { SimulateBehaviorUseCase } from '$application/analysis/simulate-behavior';
import { createEmptyFeaturesDraft } from '$domain/features/draft';
import { McpUnspaghettitAdvisor } from '$infrastructure/unspaghettit/mcp-unspaghettit-advisor.server';
import { UnspaEngineClient } from '$infrastructure/unspaghettit/unspa-engine-client.server';
import { requestEvent, servicesWith } from '$lib/server/request-event.fixture';
import { POST as apply } from './+server';
import { POST as simulate } from '../simulate/+server';

/**
 * The scenarios of "Disable an element" (58586f7b) and "Enable an element"
 * (8d77703f), run against the real code: the platform's route and guards, and
 * the behaviour engine this platform installs, not a stub. The engine applies
 * the two operations only from the release that brought them; an older one
 * offers neither, and these tests say so and skip (the platform then needs the
 * engine release that ships `disable_element`).
 */

const ENGINE = resolve('node_modules/unspaghettit');
const engineDisables = existsSync(join(ENGINE, 'mcp-server/tools/batch-ops/disableOps.ts'));

const spec = vi.hoisted(() => ({ state: 'draft' as 'draft' | 'validated' }));
vi.mock('$lib/server/spec-validation.server', () => ({ readSpecValidation: async () => ({ state: spec.state }) }));
vi.mock('$lib/server/retrospec-status.server', () => ({ retrospecActor: async () => ({ id: 'acs@lyriks.io', name: 'Sam Rivera' }) }));

const PROJECT = 'p-validation';
let root: string;
let engine: UnspaEngineClient;
let advisor: McpUnspaghettitAdvisor;
let featureId = '';
let ruleId = '';
let actionId = '';
let scenarioId = '';

type Role = 'editor' | 'viewer' | 'none';

function services(role: Role, engineDown = false) {
	const decision: AccessDecision =
		role === 'editor' ? { ok: true } : role === 'viewer' ? { ok: false, reason: 'forbidden' } : { ok: false, reason: 'not_found' };
	const down = new McpUnspaghettitAdvisor({ snapshotsRoot: root, mcpBinPath: join(root, 'no-engine-here.cjs'), proofs: false });
	return servicesWith({
		installEdition: () => 'enterprise',
		resolveActiveProject: { execute: async () => null },
		// Reading is allowed to a viewer; writing is not.
		projectAccess: { authorize: async (_p: string, _t: string | null, action: string) => (action === 'read' && role === 'viewer' ? { ok: true } : decision) },
		enterpriseHooks: null,
		loadFeaturesDraft: {
			execute: async (projectId: string) => {
				const draft = createEmptyFeaturesDraft(projectId);
				draft.features = [{ id: featureId, name: 'Validation', coreId: 'c', parentFamilyId: null, description: '', unspaghettitFeatureId: featureId }];
				return draft;
			}
		},
		detectFeatureIdCollision: { execute: async () => [] },
		authorBehavior: new AuthorBehaviorUseCase(engineDown ? down : advisor),
		simulateBehavior: new SimulateBehaviorUseCase(advisor),
		scheduleBackSync: async () => {},
		syncDataRules: { execute: async () => {} },
		proveFeatureRules: { warm: async () => {} },
		behaviorAdvisories: { touch: () => {} }
	} as never);
}

/** What the route answered: the batch, or the HTTP refusal. */
async function post(role: Role, operations: Record<string, unknown>[], engineDown = false) {
	const event = requestEvent({
		method: 'POST',
		authRequired: true,
		cookies: { lyriks_session: 'jwt' },
		services: services(role, engineDown),
		body: JSON.stringify({ projectId: PROJECT, featureId, operations })
	});
	try {
		const response = await apply(event as never);
		return { status: response.status, body: (await response.json()) as { batch: { ok: boolean; errors?: string[] } } };
	} catch (failure) {
		if (isHttpError(failure)) return { status: failure.status, body: null, message: failure.body.message };
		throw failure;
	}
}

const disable = (role: Role = 'editor', reason = 'Testing the validation without it', elementId = ruleId, engineDown = false) =>
	post(role, [{ kind: 'disable_element', elementId, reason, by: 'someone the client names' }], engineDown);
const enable = (role: Role = 'editor', elementId = ruleId, engineDown = false) => post(role, [{ kind: 'enable_element', elementId }], engineDown);

async function ruleOnDisk(): Promise<Record<string, unknown>> {
	const read = (await engine.callJsonOrError('get_action', { featureId, actionId })) as { ok: boolean; value: { action: { rules: Record<string, unknown>[] } } };
	return read.value.action.rules.find((r) => r.id === ruleId)!;
}

/** Whether a reading takes the rule into account: a viewer validating is refused only while it does. */
async function countedInReadings(): Promise<boolean> {
	const walk = (await engine.callJsonOrError('simulate_steps', {
		featureId,
		snapshot: { 'session.role': 'viewer' },
		steps: [{ actionId }]
	})) as { ok: boolean; value?: { steps: { status: string }[] } };
	// A walk the engine refuses runs nothing: its action is disabled with what holds it.
	return walk.ok && walk.value?.steps[0]?.status === 'blocked';
}

beforeAll(async () => {
	if (!engineDisables) return;
	root = mkdtempSync(join(tmpdir(), 'lyriks-disable-'));
	engine = new UnspaEngineClient({ snapshotsRoot: root, mcpBinPath: join(ENGINE, 'mcp-server/bin.cjs'), proofs: false }, 'disable-element-test');
	advisor = new McpUnspaghettitAdvisor({ snapshotsRoot: root, mcpBinPath: join(ENGINE, 'mcp-server/bin.cjs'), proofs: false }, engine);
	const created = (await engine.callJsonOrError('create_feature', { name: 'Validation', description: 'A person validates an element.' })) as { ok: boolean; value: { id: string } };
	featureId = String(created.value.id);
	const built = (await engine.callJsonOrError('apply_batch', {
		featureId,
		operations: [
			{ kind: 'add_surface', ref: 's', name: 'Element', type: 'screen', description: 'One element.' },
			{ kind: 'add_state_definition', surfaceRef: 's', path: 'session.role', type: 'enum', enumValues: ['editor', 'viewer'], defaultValue: 'editor', description: 'Who is signed in.' },
			{ kind: 'add_state_definition', surfaceRef: 's', path: 'element.validated', type: 'boolean', defaultValue: false, description: 'Whether it is validated.' },
			{ kind: 'add_action', ref: 'a', surfaceRef: 's', name: 'Validate an element', intent: 'Validate the element.' },
			{ kind: 'add_action_rule', ref: 'r', surfaceRef: 's', actionRef: 'a', rule: { category: 'permissions', description: 'An unassigned viewer cannot validate.', condition: { left: 'session.role', operator: 'equals', right: 'viewer' }, effect: { type: 'block_action', reason: 'An unassigned viewer cannot validate.', description: 'Refused.' } } },
			{ kind: 'add_effect', surfaceRef: 's', actionRef: 'a', effect: { type: 'set_state', path: 'element.validated', value: true, description: 'Validated.' } },
			{ kind: 'add_scenario', ref: 'sc', surfaceRef: 's', actionRef: 'a', name: 'An editor validates', description: 'An editor is signed in.', stateOverrides: [], parameterOverrides: [], expectedStatus: 'success' }
		]
	})) as { ok: boolean; value: { ok: boolean; refs: Record<string, string>; validation?: unknown } };
	if (!built.ok || !built.value.ok) throw new Error(`The engine refused the fixture: ${JSON.stringify(built)}`);
	ruleId = built.value.refs.r!;
	actionId = built.value.refs.a!;
	scenarioId = built.value.refs.sc!;
}, 60_000);

afterAll(async () => {
	if (!engineDisables) return;
	await engine.connected?.close();
	rmSync(root, { recursive: true, force: true });
});

beforeEach(async () => {
	spec.state = 'draft';
	if (!engineDisables) return;
	// Every scenario starts with the feature and the rule in force.
	const feature = await engine.callJsonOrError('get_feature', { featureId, verbose: true });
	if (feature?.ok && (feature.value as { disabled?: unknown }).disabled) await enable('editor', featureId);
	if ((await ruleOnDisk()).disabled) await enable();
});

describe.skipIf(!engineDisables)('Disable an element, through the platform and the installed engine', () => {
	it('an editor disables a rule with a reason [unspa:a46d2b27:58586f7b:431d5c71] [criterion:ac-leaf-e40ccfa1-2c1e-46ce-a6c3-175cea42b47c]', async () => {
		expect(await countedInReadings()).toBe(true);
		const answer = await disable();
		expect(answer.status).toBe(200);
		expect(answer.body?.batch.ok).toBe(true);
		// element.disabled: it reads Disabled, with who (the person signed in, not the client's word), when and why.
		expect(await ruleOnDisk()).toMatchObject({ id: ruleId, disabled: { by: 'Sam Rivera', reason: 'Testing the validation without it' } });
		// element.countedInReadings: no reading takes it into account.
		expect(await countedInReadings()).toBe(false);
	}, 60_000);

	it('a disable without a reason is refused [unspa:a46d2b27:58586f7b:ff8857ad]', async () => {
		const answer = await disable('editor', '');
		expect(answer.body?.batch.ok).toBe(false);
		expect(answer.body?.batch.errors?.join(' ')).toContain('Say why the element is disabled.');
		expect((await ruleOnDisk()).disabled).toBeUndefined();
	}, 60_000);

	it('a viewer disables nothing [unspa:a46d2b27:58586f7b:b03b2a04] [rule:e9b2247a]', async () => {
		expect(await disable('viewer')).toMatchObject({ status: 403 });
		expect((await ruleOnDisk()).disabled).toBeUndefined();
	}, 60_000);

	it('a project outside the caller workspace answers as if it did not exist [rule:c91659aa]', async () => {
		expect(await disable('none')).toMatchObject({ status: 404, message: 'Project not found' });
	}, 60_000);

	it('an element disabled already is not disabled again [unspa:a46d2b27:58586f7b:c5faf86a] [rule:0c866698]', async () => {
		await disable();
		const before = await ruleOnDisk();
		const again = await post('editor', [{ kind: 'disable_element', elementId: ruleId, reason: 'Another reason' }]);
		expect(again.body?.batch.ok).toBe(false);
		expect(again.body?.batch.errors?.join(' ')).toContain('This element is disabled already.');
		expect(await ruleOnDisk()).toEqual(before);
	}, 60_000);

	it('a validated specification disables through a change request [unspa:a46d2b27:58586f7b:76c8135c] [rule:840b0846] [criterion:ac-leaf-975c851b-f554-47e6-bb43-8840d6845d20]', async () => {
		spec.state = 'validated';
		const answer = await disable();
		expect(answer.body?.batch).toMatchObject({ ok: false, errors: ['The specification is validated: disable it through a change request.'] });
		expect((await ruleOnDisk()).disabled).toBeUndefined();
	}, 60_000);

	it('an unknown element is refused by its id [unspa:a46d2b27:58586f7b:79b9ea98] [rule:9f71f783]', async () => {
		const answer = await disable('editor', 'Testing', 'no-such-id');
		expect(answer.body?.batch.ok).toBe(false);
		expect(answer.body?.batch.errors?.join(' ')).toContain('No element of this feature has that id: no-such-id');
	}, 60_000);

	it('nothing is disabled while the engine does not answer [unspa:a46d2b27:58586f7b:dc0349c2] [rule:1ca1ab8d]', async () => {
		const answer = await disable('editor', 'Testing', ruleId, true);
		expect(answer.status).toBe(503);
		expect(answer.message).toContain('The behavior engine did not answer');
		expect((await ruleOnDisk()).disabled).toBeUndefined();
	}, 60_000);
});

describe.skipIf(!engineDisables)('the whole feature, disabled and enabled from its page', () => {
	const featureOnDisk = async () => ((await engine.callJsonOrError('get_feature', { featureId, verbose: true })) as { ok: boolean; value: Record<string, unknown> }).value;

	it('puts the whole feature aside with what it holds, stamped, and brings it back [criterion:ac-leaf-5ecaa85c-e299-4cd7-80a1-915322d07355]', async () => {
		const off = await post('editor', [{ kind: 'disable_element', elementId: featureId, reason: 'Put aside while the validation is reworked' }]);
		expect(off.body?.batch.ok).toBe(true);
		expect((await featureOnDisk()).disabled).toMatchObject({ by: 'Sam Rivera', reason: 'Put aside while the validation is reworked' });
		// What it holds is left out of every reading: its rule refuses no viewer any more.
		expect(await countedInReadings()).toBe(false);
		const back = await post('editor', [{ kind: 'enable_element', elementId: featureId }]);
		expect(back.body?.batch.ok).toBe(true);
		expect((await featureOnDisk()).disabled).toBeUndefined();
		expect(await countedInReadings()).toBe(true);
	}, 60_000);

	it('refuses a viewer and a validated specification, like any element [rule:e9b2247a] [rule:840b0846]', async () => {
		expect(await post('viewer', [{ kind: 'disable_element', elementId: featureId, reason: 'Testing' }])).toMatchObject({ status: 403 });
		spec.state = 'validated';
		expect((await post('editor', [{ kind: 'disable_element', elementId: featureId, reason: 'Testing' }])).body?.batch).toMatchObject({ ok: false });
		expect((await featureOnDisk()).disabled).toBeUndefined();
	}, 60_000);
});

describe.skipIf(!engineDisables)('a scenario, disabled and enabled from its menu', () => {
	const scenarioOnDisk = async () => {
		const read = (await engine.callJsonOrError('get_action', { featureId, actionId })) as { ok: boolean; value: { action: { scenarios: Record<string, unknown>[] } } };
		return read.value.action.scenarios.find((sc) => sc.id === scenarioId)!;
	};
	const scenariosRun = async () => ((await engine.callJsonOrError('run_all_scenarios', { featureId })) as { ok: boolean; value: { total: number } }).value.total;

	it('puts a scenario aside, stamped, and brings it back, through the route a person or an AI client uses [criterion:ac-leaf-978057c9-7b28-4500-9d3c-475a790e1ae2]', async () => {
		expect(await scenariosRun()).toBe(1);
		const off = await post('editor', [{ kind: 'disable_element', elementId: scenarioId, reason: 'The sign-in is reworked' }]);
		expect(off.body?.batch.ok).toBe(true);
		expect(await scenarioOnDisk()).toMatchObject({ id: scenarioId, disabled: { by: 'Sam Rivera', reason: 'The sign-in is reworked' } });
		// It no longer runs: a disabled scenario leaves the count.
		expect(await scenariosRun()).toBe(0);
		expect(await post('viewer', [{ kind: 'enable_element', elementId: scenarioId }])).toMatchObject({ status: 403 });
		const back = await post('editor', [{ kind: 'enable_element', elementId: scenarioId }]);
		expect(back.body?.batch.ok).toBe(true);
		expect((await scenarioOnDisk()).disabled).toBeUndefined();
		expect(await scenariosRun()).toBe(1);
	}, 60_000);
});

describe.skipIf(!engineDisables)('Enable an element, through the platform and the installed engine', () => {
	it('enabling puts the element back in every reading [unspa:a46d2b27:8d77703f:2eb61911]', async () => {
		await disable();
		expect(await countedInReadings()).toBe(false);
		const answer = await enable();
		expect(answer.body?.batch.ok).toBe(true);
		const rule = await ruleOnDisk();
		expect(rule.id).toBe(ruleId);
		expect(rule.disabled).toBeUndefined();
		expect(await countedInReadings()).toBe(true);
	}, 60_000);

	it('enabling an element in force is refused [unspa:a46d2b27:8d77703f:71367a0b] [rule:758064ea]', async () => {
		const answer = await enable();
		expect(answer.body?.batch.ok).toBe(false);
		expect(answer.body?.batch.errors?.join(' ')).toContain('This element is enabled already.');
	}, 60_000);

	it('a viewer enables nothing [unspa:a46d2b27:8d77703f:3b23de31] [rule:6914ad70]', async () => {
		await disable();
		expect(await enable('viewer')).toMatchObject({ status: 403 });
		expect((await ruleOnDisk()).disabled).toBeDefined();
	}, 60_000);

	it('a project outside the caller workspace answers as if it did not exist [rule:5d238fd9]', async () => {
		expect(await enable('none')).toMatchObject({ status: 404 });
	}, 60_000);

	it('an id that names nothing enables nothing [rule:62c5289c]', async () => {
		const answer = await enable('editor', 'no-such-id');
		expect(answer.body?.batch.errors?.join(' ')).toContain('No element of this feature has that id: no-such-id');
	}, 60_000);

	it('a validated specification enables through a change request [rule:dc50bf71]', async () => {
		await disable();
		spec.state = 'validated';
		expect((await enable()).body?.batch).toMatchObject({ ok: false, errors: ['The specification is validated: enable it through a change request.'] });
		expect((await ruleOnDisk()).disabled).toBeDefined();
	}, 60_000);

	it('nothing is enabled while the engine does not answer [rule:8bb4803b]', async () => {
		await disable();
		expect(await enable('editor', ruleId, true)).toMatchObject({ status: 503 });
		expect((await ruleOnDisk()).disabled).toBeDefined();
	}, 60_000);
});

describe.skipIf(!engineDisables)('a trial with elements disabled in memory, through simulate', () => {
	async function trial(disableIds: string[]) {
		const event = requestEvent({
			method: 'POST',
			authRequired: true,
			cookies: { lyriks_session: 'jwt' },
			services: services('viewer'),
			body: JSON.stringify({ projectId: PROJECT, featureId, disable: disableIds, snapshot: { 'session.role': 'viewer' }, steps: [{ actionId }] })
		});
		return (await (await simulate(event as never)).json()) as { ok?: boolean; errors?: string[]; steps?: { status: string }[] };
	}

	it('disables the element for the trial only and saves nothing [criterion:ac-leaf-27ca9a00-8cd5-4213-903d-30384ab0af2d]', async () => {
		const walked = await trial([ruleId]);
		expect(walked.steps?.[0]?.status).toBe('success');
		expect((await ruleOnDisk()).disabled).toBeUndefined();
		expect(await countedInReadings()).toBe(true);
	}, 60_000);

	it('refuses the trial with the id the feature does not hold [criterion:ac-leaf-4d11b243-1cc7-4377-bff1-028e75887b02]', async () => {
		const refused = await trial(['rule-ghost']);
		expect(refused.ok).toBe(false);
		expect(refused.errors?.join(' ')).toContain('rule-ghost');
	}, 60_000);
});

describe.skipIf(engineDisables)('an engine without disable_element', () => {
	it('is the released one, older than the operations: these scenarios wait for its next release', () => {
		expect(engineDisables).toBe(false);
	});
});
