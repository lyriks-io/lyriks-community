import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateDeletionCheckPort } from '$application/ports/state-deletion-check';
import { EngineRoute, batchOf, type Situation } from './fixtures/engine-route';
import { POST as apply } from './+server';
import { POST as deleteState } from '../state/delete/+server';

/**
 * The scenarios of the screen "Behaviour of a feature, written by an AI
 * client" (a46d2b27) of "Write the behavior of a feature": trying a batch,
 * saving it, saving a tried one by its token, deleting a state after checking
 * what depends on it, and what happens around them (the engine going silent
 * and coming back, the formal engine likewise, minutes passing, another
 * writer). Each runs the platform's own route and use cases and the behaviour
 * engine this platform installs.
 */

vi.mock('$lib/server/spec-validation.server', () => ({ readSpecValidation: async () => ({ state: 'draft' }) }));
vi.mock('$lib/server/retrospec-status.server', () => ({ retrospecActor: async () => ({ id: 'acs@lyriks.io', name: 'Sam Rivera' }) }));

const door = new EngineRoute('write-behaviour-test');
let ids: Record<string, string> = {};
let n = 0;

/** The feature every scenario starts from: one screen, three states, one action guarded by one of them. */
async function freshFeature() {
	ids = await door.newFeature(`Notes ${++n}`, [
		{ kind: 'add_surface', ref: 's', name: 'Notes', type: 'screen', description: 'Notes.' },
		{ kind: 'add_state_definition', ref: 'unused', surfaceRef: 's', path: 'note.unused', type: 'boolean', defaultValue: false, description: 'Nothing uses it.' },
		{ kind: 'add_state_definition', ref: 'locked', surfaceRef: 's', path: 'note.locked', type: 'boolean', defaultValue: false, description: 'A rule reads it.' },
		{ kind: 'add_state_definition', ref: 'count', surfaceRef: 's', path: 'note.count', type: 'number', defaultValue: 0, description: 'An effect writes it.' },
		{ kind: 'add_action', ref: 'a', surfaceRef: 's', name: 'Write a note', intent: 'Write one note.' },
		{ kind: 'add_action_rule', ref: 'r', surfaceRef: 's', actionRef: 'a', rule: { category: 'business', description: 'A locked note is not written.', condition: { left: 'note.locked', operator: 'is_true' }, effect: { type: 'block_action', reason: 'Locked.', description: 'Refused.' } } },
		{ kind: 'add_effect', surfaceRef: 's', actionRef: 'a', effect: { type: 'set_state', path: 'note.count', value: 1, description: 'One note more.' } }
	]);
}

const paths = async () => ((await door.read()).surfaces as { stateDefinitions: { path: string }[] }[]).flatMap((s) => s.stateDefinitions.map((d) => d.path));
const updatedAt = async () => String((await door.read()).updatedAt);
/** A valid batch: one more state. Saved when its path is on the feature. */
const addState = (path: string): Record<string, unknown>[] => [{ kind: 'add_state_definition', surfaceId: ids.s, path, type: 'string', defaultValue: '', description: 'Added by a scenario.' }];
const send = (operations: readonly Record<string, unknown>[], situation: Situation = {}, extra: Record<string, unknown> = {}) => door.post(apply, { operations, ...extra }, situation);
const tryBatch = (operations: readonly Record<string, unknown>[], situation: Situation = {}) => send(operations, situation, { dryRun: true });
const commit = (token: string, situation: Situation = {}, extra: Record<string, unknown> = {}) => door.post(apply, { commit: token, ...extra }, situation);
/** Another writer, a person or another AI client, saves the same feature. */
const anotherWriterSaves = async () => {
	const saved = await door.call<{ ok: boolean }>('apply_batch', { featureId: door.featureId, operations: addState(`note.other${++n}`) });
	expect(saved.ok).toBe(true);
};

beforeAll(async () => {
	await freshFeature();
}, 60_000);

afterAll(async () => {
	vi.useRealTimers();
	await door.close();
});

beforeEach(async () => {
	door.advanceEngineClock(0);
	door.engineOutOfReach(false);
	await freshFeature();
}, 60_000);

describe('Try a batch without saving', () => {
	const tried = async (situation: Situation = {}) => {
		const before = await updatedAt();
		const answer = await tryBatch(addState('note.tried'), situation);
		return { answer, savedNothing: (await updatedAt()) === before && !(await paths()).includes('note.tried') };
	};

	it('a designer tries a batch [unspa:a46d2b27:25fff109:e66ca4ed]', async () => {
		const { answer, savedNothing } = await tried();
		expect(batchOf(answer)).toMatchObject({ ok: true });
		expect(batchOf(answer)?.commitToken).toEqual(expect.any(String));
		expect(savedNothing).toBe(true);
	}, 60_000);

	it('the Community operator tries a batch [unspa:a46d2b27:25fff109:205bb62c]', async () => {
		const { answer } = await tried({ edition: 'community', role: 'operator' });
		expect(batchOf(answer)?.commitToken).toEqual(expect.any(String));
	}, 60_000);

	it('a viewer cannot try a batch [unspa:a46d2b27:25fff109:ff669b2e]', async () => {
		expect((await tried({ role: 'viewer' })).answer).toMatchObject({ status: 403 });
	}, 60_000);

	it('without sign-in a viewer tries a batch [unspa:a46d2b27:25fff109:7b575911]', async () => {
		const { answer } = await tried({ role: 'viewer', signIn: false });
		expect(batchOf(answer)?.commitToken).toEqual(expect.any(String));
	}, 60_000);

	it('outside the workspace no batch is tried [unspa:a46d2b27:25fff109:4fae555f]', async () => {
		expect((await tried({ role: 'none' })).answer).toMatchObject({ status: 404, message: 'Project not found' });
	}, 60_000);

	it('a feature of another project is not tried through this one [unspa:a46d2b27:25fff109:b4f1c791]', async () => {
		expect((await tried({ inProject: false })).answer).toMatchObject({ status: 404, message: 'Feature not found in project' });
	}, 60_000);

	it('an id another project also stores is refused [unspa:a46d2b27:25fff109:bdfc7f03]', async () => {
		const { answer, savedNothing } = await tried({ idHeldElsewhere: true });
		expect(answer.status).toBe(200);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(batchOf(answer)?.errors?.[0]).toContain('p-elsewhere');
		expect(savedNothing).toBe(true);
	}, 60_000);

	it('a state removed among other operations is refused [unspa:a46d2b27:25fff109:1de36478]', async () => {
		const answer = await tryBatch([{ kind: 'remove_state_definition', surfaceId: ids.s, stateDefinitionId: ids.unused }, ...addState('note.more')]);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(batchOf(answer)?.errors?.[0]).toContain('State deletion must use the checked deletion command');
	}, 60_000);

	it('a statement without a condition is refused [unspa:a46d2b27:25fff109:48536339]', async () => {
		const answer = await tryBatch([{ kind: 'add_feature_invariant', invariant: { name: 'Always', message: 'Broken.', description: 'No condition.' } }]);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(batchOf(answer)?.errors?.join(' ')).toContain('condition');
	}, 60_000);

	it('an action without a rule is refused [unspa:a46d2b27:25fff109:8794d72f]', async () => {
		const answer = await tryBatch([{ kind: 'add_action', ref: 'bare', surfaceId: ids.s, name: 'Erase a note', intent: 'Erase one.' }]);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(batchOf(answer)?.errors?.join(' ')).toContain('no rule declares when this action can or cannot run');
	}, 60_000);

	it('an unknown kind is refused [unspa:a46d2b27:25fff109:ea7c82c2]', async () => {
		const answer = await tryBatch([{ kind: 'add_effect', surfaceId: ids.s, actionId: ids.a, effect: { type: 'set_state', path: 'note.count', value: { kind: 'mystery', left: 1 }, description: 'An unknown kind.' } }]);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(batchOf(answer)?.errors?.join(' ')).toContain('mystery');
	}, 60_000);

	it('a batch the engine finds invalid is rejected [unspa:a46d2b27:25fff109:26f08b7f]', async () => {
		const answer = await tryBatch([
			{ kind: 'add_effect', surfaceId: ids.s, actionId: ids.a, effect: { type: 'set_state', path: 'note.nowhere', value: 1, description: 'Writes a state nobody declares.' } },
			{ kind: 'add_effect', surfaceId: ids.s, actionId: ids.a, effect: { type: 'set_state', path: 'note.elsewhere', value: 1, description: 'And another one.' } }
		]);
		expect(answer.status).toBe(200);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(batchOf(answer)?.errors?.length).toBeGreaterThanOrEqual(1);
	}, 60_000);

	it('no trial while the engine is silent [unspa:a46d2b27:25fff109:5a2d0a7f]', async () => {
		const answer = await tryBatch(addState('note.tried'), { engineAnswering: false });
		expect(answer.status).toBe(503);
		expect(answer.message).toContain('The behavior engine did not answer this batch');
	}, 60_000);
});

describe('Save a batch', () => {
	const saves = async (operations: readonly Record<string, unknown>[] = addState('note.saved'), situation: Situation = {}, extra: Record<string, unknown> = {}) => {
		const answer = await send(operations, situation, extra);
		return { answer, saved: (await paths()).includes('note.saved') };
	};

	it('a designer saves a batch [unspa:a46d2b27:0f4d4ffa:f4c964f3]', async () => {
		const { answer, saved } = await saves();
		expect(batchOf(answer)).toMatchObject({ ok: true });
		expect(saved).toBe(true);
	}, 60_000);

	it('a batch that removes an action is saved [unspa:a46d2b27:0f4d4ffa:75f0cce2]', async () => {
		const answer = await send([{ kind: 'remove_action', surfaceId: ids.s, actionId: ids.a }]);
		expect(batchOf(answer)).toMatchObject({ ok: true });
		const actions = ((await door.read()).surfaces as { actions: { id: string }[] }[]).flatMap((s) => s.actions.map((a) => a.id));
		expect(actions).not.toContain(ids.a);
	}, 60_000);

	it('a batch naming an outdated version is refused [unspa:a46d2b27:0f4d4ffa:d83b7d7b]', async () => {
		const read = await updatedAt();
		await anotherWriterSaves();
		const { answer, saved } = await saves(addState('note.saved'), {}, { expectedUpdatedAt: read });
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(batchOf(answer)?.raw?.conflict ?? (batchOf(answer) as { conflict?: boolean } | null)?.conflict).toBe(true);
		expect(saved).toBe(false);
	}, 60_000);

	it('without a version named the last write wins [unspa:a46d2b27:0f4d4ffa:74ccd120]', async () => {
		await anotherWriterSaves();
		const { answer, saved } = await saves();
		expect(batchOf(answer)).toMatchObject({ ok: true });
		expect(saved).toBe(true);
		// The writer now holds the latest version: the answer names the version just saved.
		const holds = (batchOf(answer) as { updatedAt?: string } | null)?.updatedAt ?? (batchOf(answer)?.raw?.updatedAt as string | undefined);
		expect(holds).toBe(await updatedAt());
	}, 60_000);

	it('a version that is not an instant is refused [unspa:a46d2b27:0f4d4ffa:1659b0db]', async () => {
		const { answer, saved } = await saves(addState('note.saved'), {}, { expectedUpdatedAt: 'yesterday' });
		expect(answer.status).toBe(400);
		expect(answer.message).toContain('ISO 8601 instant');
		expect(saved).toBe(false);
	}, 60_000);

	it('a viewer cannot save a batch [unspa:a46d2b27:0f4d4ffa:3b4ce35a]', async () => {
		const { answer, saved } = await saves(addState('note.saved'), { role: 'viewer' });
		expect(answer.status).toBe(403);
		expect(saved).toBe(false);
	}, 60_000);

	it('outside the workspace no batch is saved [unspa:a46d2b27:0f4d4ffa:d62e00bd]', async () => {
		const { answer, saved } = await saves(addState('note.saved'), { role: 'none' });
		expect(answer.status).toBe(404);
		expect(saved).toBe(false);
	}, 60_000);

	it('a feature of another project is not written through this one [unspa:a46d2b27:0f4d4ffa:11fc6417]', async () => {
		const { answer, saved } = await saves(addState('note.saved'), { inProject: false });
		expect(answer).toMatchObject({ status: 404, message: 'Feature not found in project' });
		expect(saved).toBe(false);
	}, 60_000);

	it('a save the engine did not answer is undecided [unspa:a46d2b27:0f4d4ffa:2f385157]', async () => {
		const { answer } = await saves(addState('note.saved'), { engineAnswering: false });
		expect(answer.status).toBe(503);
		expect(answer.message).toContain('re-read the feature before retrying');
	}, 60_000);

	it('a batch with an action without a rule is not saved [unspa:a46d2b27:0f4d4ffa:fe9df7f8]', async () => {
		const answer = await send([{ kind: 'add_action', ref: 'bare', surfaceId: ids.s, name: 'Erase a note', intent: 'Erase one.' }]);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		const names = ((await door.read()).surfaces as { actions: { name: string }[] }[]).flatMap((s) => s.actions.map((a) => a.name));
		expect(names).not.toContain('Erase a note');
	}, 60_000);

	it('a save under an id another project also stores is refused [unspa:a46d2b27:0f4d4ffa:3573bf72]', async () => {
		const { answer, saved } = await saves(addState('note.saved'), { idHeldElsewhere: true });
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(saved).toBe(false);
	}, 60_000);

	it('a save removing a state among other operations is refused [unspa:a46d2b27:0f4d4ffa:5445a7fd]', async () => {
		const { answer, saved } = await saves([{ kind: 'remove_state_definition', surfaceId: ids.s, stateDefinitionId: ids.unused }, ...addState('note.saved')]);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(saved).toBe(false);
		expect(await paths()).toContain('note.unused');
	}, 60_000);

	it('a save with a statement without a condition is refused [unspa:a46d2b27:0f4d4ffa:51cea736]', async () => {
		const answer = await send([{ kind: 'add_feature_invariant', invariant: { name: 'Always', message: 'Broken.', description: 'No condition.' } }]);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect((await door.read()).featureInvariants ?? []).toEqual([]);
	}, 60_000);

	it('a save with an unknown kind is refused [unspa:a46d2b27:0f4d4ffa:b949906e]', async () => {
		const before = await updatedAt();
		const answer = await send([{ kind: 'add_effect', surfaceId: ids.s, actionId: ids.a, effect: { type: 'set_state', path: 'note.count', value: { kind: 'mystery', left: 1 }, description: 'An unknown kind.' } }]);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(await updatedAt()).toBe(before);
	}, 60_000);

	it('a save the engine finds invalid writes nothing [unspa:a46d2b27:0f4d4ffa:346fbb0b]', async () => {
		const before = await updatedAt();
		const answer = await send([{ kind: 'add_effect', surfaceId: ids.s, actionId: ids.a, effect: { type: 'set_state', path: 'note.nowhere', value: 1, description: 'Writes a state nobody declares.' } }]);
		expect(answer.status).toBe(200);
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(await updatedAt()).toBe(before);
	}, 60_000);
});

describe('Save a tried batch with its token', () => {
	/** A trial of one more state: its token, live. */
	const trial = async () => {
		const tried = batchOf(await tryBatch(addState('note.tried')));
		expect(tried?.commitToken).toEqual(expect.any(String));
		return String(tried?.commitToken);
	};
	const saved = async () => (await paths()).includes('note.tried');

	it('a tried batch is saved by its token [unspa:a46d2b27:3af613db:ede0d511]', async () => {
		const token = await trial();
		expect(batchOf(await commit(token))).toMatchObject({ ok: true });
		expect(await saved()).toBe(true);
		// The token is spent: it saves nothing again.
		expect(batchOf(await commit(token))).toMatchObject({ ok: false });
	}, 60_000);

	it('a spent token saves nothing again [unspa:a46d2b27:3af613db:e91fdf14]', async () => {
		const token = await trial();
		await commit(token);
		const before = await updatedAt();
		const again = await commit(token);
		expect(again.status).toBe(200);
		expect(batchOf(again)).toMatchObject({ ok: false });
		expect(await updatedAt()).toBe(before);
	}, 60_000);

	it('an expired token saves nothing [unspa:a46d2b27:3af613db:18137979]', async () => {
		const token = await trial();
		door.advanceEngineClock(5 * 60_000 + 1_000);
		const late = await commit(token);
		expect(batchOf(late)).toMatchObject({ ok: false });
		expect(batchOf(late)?.errors?.join(' ')).toContain('expired');
		expect(await saved()).toBe(false);
	}, 60_000);

	it('a token over an outdated version is refused [unspa:a46d2b27:3af613db:5051c889]', async () => {
		const read = await updatedAt();
		const token = await trial();
		await anotherWriterSaves();
		const answer = await commit(token, {}, { expectedUpdatedAt: read });
		expect(batchOf(answer)).toMatchObject({ ok: false });
		expect(await saved()).toBe(false);
	}, 60_000);

	it('a viewer cannot save a token [unspa:a46d2b27:3af613db:2859dcd5]', async () => {
		const token = await trial();
		expect(await commit(token, { role: 'viewer' })).toMatchObject({ status: 403 });
		expect(await saved()).toBe(false);
	}, 60_000);

	it('outside the workspace no token is saved [unspa:a46d2b27:3af613db:436362e9]', async () => {
		const token = await trial();
		expect(await commit(token, { role: 'none' })).toMatchObject({ status: 404 });
		expect(await saved()).toBe(false);
	}, 60_000);

	it('a token save the engine did not answer is undecided [unspa:a46d2b27:3af613db:8f8fc35d]', async () => {
		const token = await trial();
		const answer = await commit(token, { engineAnswering: false });
		expect(answer.status).toBe(503);
		expect(answer.message).toContain('re-read the feature before retrying');
	}, 60_000);

	it('a token under an id another project also stores is refused [unspa:a46d2b27:3af613db:86ae2d55]', async () => {
		const token = await trial();
		expect(batchOf(await commit(token, { idHeldElsewhere: true }))).toMatchObject({ ok: false });
		expect(await saved()).toBe(false);
	}, 60_000);

	it('a token for another project feature is refused [unspa:a46d2b27:3af613db:7f54ea9d]', async () => {
		const token = await trial();
		expect(await commit(token, { inProject: false })).toMatchObject({ status: 404, message: 'Feature not found in project' });
		expect(await saved()).toBe(false);
	}, 60_000);
});

describe('Delete a state after checking what depends on it', () => {
	/** The formal engine of an Enterprise installation, as its answer reaches the platform: incoherent when anything else names the state. */
	const formal: StateDeletionCheckPort = {
		checkStateDeletion: async (_projectId, feature, _surfaceId, stateDefinitionId) => {
			const surfaces = (feature as { surfaces: { stateDefinitions: { id: string; path: string }[]; actions: unknown[]; rules: unknown[] }[] }).surfaces;
			const path = surfaces.flatMap((s) => s.stateDefinitions).find((d) => d.id === stateDefinitionId)?.path ?? '';
			const users = JSON.stringify(surfaces.map((s) => [s.actions, s.rules]));
			const used = path !== '' && users.includes(`"${path}"`);
			return used
				? { coherent: false, scope: 'feature', statePath: path, inconsistencies: [{ code: 'GLUING_CONDITION', message: `The state ${path} is still read or written.`, nodeIds: [] }] }
				: { coherent: true, scope: 'feature', statePath: path, inconsistencies: [] };
		}
	};
	const remove = (stateDefinitionId: string, situation: Situation = {}) =>
		door.post(deleteState, { surfaceId: ids.s, stateDefinitionId }, situation, formal);
	const present = async (path: string) => (await paths()).includes(path);

	it('a state nothing uses is deleted on Enterprise [unspa:a46d2b27:34344438:c9944043]', async () => {
		const answer = await remove(ids.unused);
		expect(answer.body).toMatchObject({ ok: true, message: 'State deleted. DPO checked this removal within the feature.', formalChecked: true });
		expect(await present('note.unused')).toBe(false);
	}, 60_000);

	it('a state nothing uses is deleted on Community [unspa:a46d2b27:34344438:8727e533]', async () => {
		const answer = await remove(ids.unused, { edition: 'community', role: 'operator' });
		expect(answer.body).toMatchObject({ ok: true, message: 'State deleted. Behavior validation passed.', formalChecked: false });
		expect(await present('note.unused')).toBe(false);
	}, 60_000);

	it('a deletion checked without saving removes nothing [unspa:a46d2b27:34344438:e8f2bb51]', async () => {
		const answer = await tryBatch([{ kind: 'remove_state_definition', surfaceId: ids.s, stateDefinitionId: ids.unused }]);
		expect(batchOf(answer)).toMatchObject({ ok: true });
		expect(batchOf(answer)?.raw).toMatchObject({ message: 'Deletion checked without saving. Submit the deletion again to apply it.' });
		expect(await present('note.unused')).toBe(true);
	}, 60_000);

	it('a state still used is kept on Enterprise [unspa:a46d2b27:34344438:9d681af3]', async () => {
		const answer = await remove(ids.locked);
		expect(answer.body).toMatchObject({ ok: false, code: 'GLUING_CONDITION' });
		expect(await present('note.locked')).toBe(true);
	}, 60_000);

	it('a state still used is kept on Community [unspa:a46d2b27:34344438:47ba3c92]', async () => {
		const answer = await remove(ids.count, { edition: 'community', role: 'operator' });
		expect(answer.body).toMatchObject({ ok: false, code: 'BEHAVIOR' });
		expect(await present('note.count')).toBe(true);
	}, 60_000);

	it('no deletion while the formal engine is silent [unspa:a46d2b27:34344438:37ee39ef]', async () => {
		const answer = await remove(ids.unused, { formalAnswering: false });
		expect(answer.body).toMatchObject({ ok: false, message: 'The formal engine could not check this deletion. Nothing was deleted. Try again when it is available.' });
		expect(await present('note.unused')).toBe(true);
	}, 60_000);

	it('Community deletes without the formal engine [unspa:a46d2b27:34344438:5c5cf75c]', async () => {
		const answer = await remove(ids.unused, { edition: 'community', role: 'operator', formalAnswering: false });
		expect(answer.body).toMatchObject({ ok: true });
		expect(await present('note.unused')).toBe(false);
	}, 60_000);

	it('no deletion the behaviour engine did not confirm [unspa:a46d2b27:34344438:0cfbc1f9]', async () => {
		const answer = await remove(ids.unused, { engineAnswering: false });
		expect(answer.body).toMatchObject({ ok: false, message: 'The behavior engine did not confirm the deletion. Reload the feature before retrying.' });
		expect(await present('note.unused')).toBe(true);
	}, 60_000);

	it('a viewer cannot delete a state [unspa:a46d2b27:34344438:9277fa17]', async () => {
		expect(await remove(ids.unused, { role: 'viewer' })).toMatchObject({ status: 403 });
		expect(await present('note.unused')).toBe(true);
	}, 60_000);

	it('outside the workspace no state is deleted [unspa:a46d2b27:34344438:87a11936]', async () => {
		expect(await remove(ids.unused, { role: 'none' })).toMatchObject({ status: 404 });
		expect(await present('note.unused')).toBe(true);
	}, 60_000);

	it('a state of another project feature is not deleted [unspa:a46d2b27:34344438:f9539942]', async () => {
		expect(await remove(ids.unused, { inProject: false })).toMatchObject({ status: 404, message: 'Feature not found in project' });
		expect(await present('note.unused')).toBe(true);
	}, 60_000);

	it('a shared feature id refuses the deletion [unspa:a46d2b27:34344438:5125e7e7]', async () => {
		const answer = await remove(ids.unused, { idHeldElsewhere: true });
		expect(answer.status).toBe(409);
		expect(answer.message).toContain('p-elsewhere');
		expect(await present('note.unused')).toBe(true);
	}, 60_000);
});

describe('what happens around a write', () => {
	// An engine of their own: the cooldown a silent engine leaves must not hold the other scenarios back.
	it('the engine goes silent [unspa:a46d2b27:85625533:6f9d044b]', async () => {
		const own = new EngineRoute('engine-goes-silent-test');
		try {
			expect(await own.engine.callJsonOrError('list_features', {})).toMatchObject({ ok: true });
			// The engine overran its time and the platform stopped it; it cannot be started again.
			own.engineOutOfReach(true);
			own.engine.recycle();
			expect(await own.engine.callJsonOrError('list_features', {})).toBeNull();
			expect(own.engine.available).toBe(false);
		} finally {
			await own.close();
		}
	}, 60_000);

	it('the engine answers again [unspa:a46d2b27:30d9c147:95a2c543]', async () => {
		const own = new EngineRoute('engine-answers-again-test');
		try {
			own.engineOutOfReach(true);
			expect(await own.engine.callJsonOrError('list_features', {})).toBeNull();
			expect(own.engine.available).toBe(false);
			// Reachable again: the first question after the platform's short wait starts it, and it answers.
			own.engineOutOfReach(false);
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(Date.now() + 11_000);
			expect(own.engine.available).toBe(true);
			expect(await own.engine.callJsonOrError('list_features', {})).toMatchObject({ ok: true });
		} finally {
			vi.useRealTimers();
			await own.close();
		}
	}, 60_000);

	const formalSilent: StateDeletionCheckPort = { checkStateDeletion: async () => null };
	const formalCoherent: StateDeletionCheckPort = { checkStateDeletion: async () => ({ coherent: true, scope: 'feature', statePath: 'note.unused', inconsistencies: [] }) };

	it('the formal engine goes silent [unspa:a46d2b27:abaf3a3b:1b243233]', async () => {
		const answer = await door.post(deleteState, { surfaceId: ids.s, stateDefinitionId: ids.unused }, {}, formalSilent);
		// The platform reads it silent: nothing is checked, nothing deleted.
		expect(answer.body).toMatchObject({ ok: false, code: 'UNAVAILABLE', formalChecked: false });
	}, 60_000);

	it('the formal engine answers again [unspa:a46d2b27:945602cf:6327ab28]', async () => {
		const refused = await door.post(deleteState, { surfaceId: ids.s, stateDefinitionId: ids.unused }, {}, formalSilent);
		expect(refused.body).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
		// The deletion refused while it was down goes through once it answers.
		const answered = await door.post(deleteState, { surfaceId: ids.s, stateDefinitionId: ids.unused }, {}, formalCoherent);
		expect(answered.body).toMatchObject({ ok: true, formalChecked: true });
	}, 60_000);

	it('a live token expires [unspa:a46d2b27:69d7ffac:6ad75192]', async () => {
		const token = String(batchOf(await tryBatch(addState('note.tried')))?.commitToken);
		door.advanceEngineClock(5 * 60_000 + 1_000);
		const late = batchOf(await commit(token));
		expect(late?.ok).toBe(false);
		expect(late?.errors?.join(' ')).toContain('Unknown or expired commitToken');
	}, 60_000);

	it('another writer saves first [unspa:a46d2b27:513125d4:e3672f85]', async () => {
		const read = await updatedAt();
		await anotherWriterSaves();
		// The version this writer read is no longer the current one.
		expect(await updatedAt()).not.toBe(read);
		const late = await send(addState('note.mine'), {}, { expectedUpdatedAt: read });
		expect(batchOf(late)).toMatchObject({ ok: false });
	}, 60_000);
});
