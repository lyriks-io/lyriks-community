import { describe, it, expect } from 'vitest';
import {
	addNode,
	createElementNode,
	createDataRead,
	createEmptyExperienceDraft,
	ensureScreenRoot,
	createJourney,
	createOperation,
	createStep,
	type ProjectExperienceDraft
} from '$domain/experience';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
import { createEmptyUsersDraft, createRole, type ProjectUsersDraft } from '$domain/users';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import {
	buildExperienceProjection,
	experienceDraftToBehaviorOps,
	experienceResidueFromDraft
} from './experience-projection';

/** A small draft: one role, one journey (under core A) with two steps, step 1 linked to a screen. */
function sampleDraft(projectId = 'p1'): ProjectExperienceDraft {
	const draft = createEmptyExperienceDraft(projectId);
	draft.screens = [
		{
			id: 'scr1',
			name: 'Home',
			templateId: null,
			description: '',
			category: null,
			parentScreen: null,
			path: '',
			device: 'auto',
			deviceW: 1024,
			deviceH: 768
		}
	];
	draft.journeys = [createJourney('coreA', 0, { id: 'J1', name: 'Checkout', actorRoleIds: ['R1'] })];
	draft.steps = [
		createStep('J1', 0, { id: 'S1', name: 'Open cart', linkedScreenId: 'scr1' }),
		createStep('J1', 1, { id: 'S2', name: 'Pay' })
	];
	draft.stepOperations = [createOperation('S1', 0, { id: 'O1', kind: 'event', label: 'cart.opened' })];
	draft.stepDataReads = [createDataRead('S1', 0, { id: 'D1', entityName: 'Cart', mode: 'read' })];
	return draft;
}

function usersWith(roleId = 'R1', name = 'Shopper'): ProjectUsersDraft {
	const u = createEmptyUsersDraft('p1');
	return { ...u, roles: [createRole({ id: roleId, name })] };
}

function featuresWithLeaf(): ProjectFeaturesDraft {
	const f = createEmptyFeaturesDraft('p1');
	f.cores = [{ id: 'coreA', name: 'Core A', description: '', tone: 'custom' }];
	f.features = [
		{ id: 'leaf1', name: 'L1', coreId: 'coreA', parentFamilyId: null, description: '', unspaghettitFeatureId: 'leaf1' }
	];
	return f;
}

describe('experienceResidueFromDraft', () => {
	it('stores the authored draft but drops the recomputed derivedCores', () => {
		const draft = sampleDraft();
		draft.derivedCores = [{ id: 'coreA', name: 'Core A', order: 0, tone: 'custom', sourceRefId: 'coreA' }];
		const residue = experienceResidueFromDraft(draft);
		expect('derivedCores' in residue).toBe(false);
		expect(residue.journeys).toEqual(draft.journeys);
		expect(residue.steps).toEqual(draft.steps);
	});
});

describe('experienceDraftToBehaviorOps', () => {
	it('types a leftover seed from its value, so a numeric seed is a number state, not a string', () => {
		const draft = sampleDraft();
		// A builder screen, so the seeds no input element consumes land on it.
		draft.builder = { ...draft.builder, screenRoots: { scr1: 'root-scr1' } };
		draft.builder.stateSeeds = [
			{ path: 'coherence.score', value: '72' },
			{ path: 'menu.open', value: 'false' },
			{ path: 'auth.email', value: 'ada@company.com' }
		];
		const ops = experienceDraftToBehaviorOps(draft, { features: null, users: usersWith() });
		const upsert = ops.find((o) => o.kind === 'upsertExperienceFeature');
		if (upsert?.kind !== 'upsertExperienceFeature') throw new Error('unreachable');
		const surfaces = upsert.surfaces as { stateDefinitions: { id: string; path: string; type: string; seeded?: boolean }[] }[];
		const seeded = surfaces.flatMap((s) => s.stateDefinitions).filter((st) => st.seeded);
		const typeOf = (path: string) => seeded.find((st) => st.path === path)?.type;
		expect(typeOf('coherence.score')).toBe('number');
		expect(typeOf('menu.open')).toBe('boolean');
		expect(typeOf('auth.email')).toBe('string');
		expect(seeded.find((st) => st.path === 'coherence.score')?.id).toBe('st-seed-coherence_score');
	});

	it('projects journeys to workflow surfaces + steps to actions + personas', () => {
		const ops = experienceDraftToBehaviorOps(sampleDraft(), {
			features: null,
			users: usersWith()
		});
		const upsert = ops.find((o) => o.kind === 'upsertExperienceFeature');
		expect(upsert).toBeTruthy();
		if (upsert?.kind !== 'upsertExperienceFeature') throw new Error('unreachable');
		expect(upsert.featureId).toBe('p1__experience');

		const surfaces = upsert.surfaces as { id: string; type: string; name: string; actions: { id: string }[]; transitions: unknown[] }[];
		const workflow = surfaces.find((s) => s.id === 'srf-J1')!;
		expect(workflow.type).toBe('workflow');
		expect(workflow.name).toBe('Checkout');
		expect(workflow.actions.map((a) => a.id)).toEqual(['act-S1', 'act-S2']);
		// step sequence + the step→screen link transition
		expect(workflow.transitions).toContainEqual({ id: 'seq-S1', from: 'act-S1', to: 'act-S2' });
		expect(workflow.transitions).toContainEqual({
			id: 'lnk-S1',
			fromAction: 'act-S1',
			toSurface: 'srf-screen-scr1'
		});

		const personas = upsert.personas as { id: string; name: string }[];
		expect(personas).toContainEqual(expect.objectContaining({ id: 'per-R1', name: 'Shopper' }));

		expect(ops.some((o) => o.kind === 'ensureProjectFeatureId')).toBe(true);
	});

	it('does NOT copy journeys onto leaves: the journey lives once, on Experience', () => {
		const ops = experienceDraftToBehaviorOps(sampleDraft(), {
			features: featuresWithLeaf(),
			users: usersWith()
		});
		// The retired Core-bridge mirror used to push a mirrorFeatureBehavior op per
		// leaf; removing it is what stops the duplication / silent-deletion class.
		expect(ops.some((o) => o.kind === 'mirrorFeatureBehavior')).toBe(false);
		// The journey surface still exists — on the Experience aux feature.
		const upsert = ops.find((o) => o.kind === 'upsertExperienceFeature');
		if (upsert?.kind !== 'upsertExperienceFeature') throw new Error('unreachable');
		expect((upsert.surfaces as { id: string }[]).map((s) => s.id)).toContain('srf-J1');
	});

	it('projects a select with literal options as an enum parameter and state, a text input as a string', () => {
		const draft = sampleDraft();
		const wiringOf = (path: string, inputType?: 'text' | 'number') => ({
			binding: { targetKind: 'state' as const, targetRef: path },
			gate: null,
			validations: [],
			scenarios: [],
			transitions: [],
			...(inputType ? { inputType } : {})
		});
		draft.builder = {
			...draft.builder,
			screenRoots: { scr1: 'root-scr1' },
			nodes: {
				period: {
					id: 'period',
					surfaceId: 'scr1',
					parentId: 'root-scr1',
					kind: 'element',
					elementKind: 'select',
					label: 'Period',
					options: ['7d', '30d', '90d', '30d'],
					wiring: wiringOf('dashboard.period')
				},
				note: {
					id: 'note',
					surfaceId: 'scr1',
					parentId: 'root-scr1',
					kind: 'element',
					elementKind: 'input',
					label: 'Note',
					wiring: wiringOf('dashboard.note', 'text')
				}
			}
		};
		const ops = experienceDraftToBehaviorOps(draft, { features: null, users: usersWith() });
		const upsert = ops.find((o) => o.kind === 'upsertExperienceFeature');
		if (upsert?.kind !== 'upsertExperienceFeature') throw new Error('unreachable');
		type Param = { name: string; type: string; enumValues?: string[]; bindToStatePath: string };
		type StateDef = { path: string; type: string; enumValues?: string[] };
		const screen = (upsert.surfaces as { id: string; actions: { parameters: Param[] }[]; stateDefinitions: StateDef[] }[]).find(
			(s) => s.id === 'srf-screen-scr1'
		)!;
		const params = screen.actions.flatMap((a) => a.parameters);
		// The select writes an enum of exactly its (deduped) options, so the engine's
		// enum-typed bus for dashboard.period receives an enum, not a free string.
		expect(params.find((p) => p.bindToStatePath === 'dashboard.period')).toEqual({
			name: 'period',
			type: 'enum',
			enumValues: ['7d', '30d', '90d'],
			bindToStatePath: 'dashboard.period'
		});
		expect(screen.stateDefinitions.find((st) => st.path === 'dashboard.period')).toMatchObject({
			type: 'enum',
			enumValues: ['7d', '30d', '90d']
		});
		// A text input stays a string and carries no value set.
		const note = params.find((p) => p.bindToStatePath === 'dashboard.note')!;
		expect(note.type).toBe('string');
		expect('enumValues' in note).toBe(false);
		expect(screen.stateDefinitions.find((st) => st.path === 'dashboard.note')).not.toHaveProperty('enumValues');
	});

	it('derives kernel set_state effects from builder state wirings', () => {
		const draft = sampleDraft();
		draft.builder = {
			...draft.builder,
			screenRoots: { scr1: 'root-scr1' },
			nodes: {
				btn1: {
					id: 'btn1',
					surfaceId: 'scr1',
					parentId: 'root-scr1',
					kind: 'element',
					elementKind: 'button',
					label: 'Add to cart',
					wiring: {
						binding: null,
						gate: null,
						validations: [],
						scenarios: [],
						transitions: [
							{ id: 't1', trigger: 'click', effect: { kind: 'setState', target: 'cart.open', value: 'true' } },
							{ id: 't2', trigger: 'click', effect: { kind: 'toggleState', target: 'menu.open' } },
							{ id: 't3', trigger: 'click', effect: { kind: 'incrementState', target: 'cart.count', value: '2' } }
						]
					}
				}
			}
		};
		const ops = experienceDraftToBehaviorOps(draft, { features: null, users: usersWith() });
		const upsert = ops.find((o) => o.kind === 'upsertExperienceFeature');
		if (upsert?.kind !== 'upsertExperienceFeature') throw new Error('unreachable');
		const surfaces = upsert.surfaces as {
			id: string;
			actions: { id: string; requiredStates: string[]; effects: { id: string; type: string; path?: string; value?: unknown }[] }[];
		}[];
		const action = surfaces.find((s) => s.id === 'srf-screen-scr1')!.actions.find((a) => a.id === 'act-btn1')!;
		expect(action.effects.map((e) => e.id)).toEqual(['eff-ui-btn1-t1', 'eff-ui-btn1-t2', 'eff-ui-btn1-t3']);
		expect(action.effects[0]).toMatchObject({ type: 'set_state', path: 'cart.open', value: true });
		expect(action.effects[1]).toMatchObject({
			type: 'set_state',
			path: 'menu.open',
			value: { kind: 'not', operand: { kind: 'state', path: 'menu.open' } }
		});
		expect(action.effects[2]).toMatchObject({
			type: 'set_state',
			path: 'cart.count',
			value: {
				kind: 'add',
				left: { kind: 'state', path: 'cart.count' },
				right: { kind: 'literal', value: 2 }
			}
		});
		expect(action.requiredStates).toEqual(
			expect.arrayContaining(['cart.open', 'menu.open', 'cart.count'])
		);
	});

	it('declares a leftover simulator seed with the type its feature declares, never string by default', () => {
		const draft = sampleDraft();
		draft.builder = {
			...draft.builder,
			screenRoots: { scr1: 'root-scr1' },
			entryScreenId: 'scr1',
			nodes: {},
			stateSeeds: [
				{ path: 'cart.count', value: '3' },
				{ path: 'lecture.statut', value: 'arrete' },
				{ path: 'cart.open', value: 'false' },
				{ path: 'tickets.left', value: '12' },
				{ path: 'greeting', value: 'hello' }
			]
		};
		const declaredStates = new Map([
			['cart.count', { type: 'number' }],
			['lecture.statut', { type: 'enum', enumValues: ['arrete', 'en_lecture', 'en_pause'] }]
		]);
		const ops = experienceDraftToBehaviorOps(draft, { features: null, users: usersWith(), declaredStates });
		const upsert = ops.find((o) => o.kind === 'upsertExperienceFeature');
		if (upsert?.kind !== 'upsertExperienceFeature') throw new Error('unreachable');
		const surface = (upsert.surfaces as { id: string; stateDefinitions: Record<string, unknown>[] }[]).find(
			(s) => s.id === 'srf-screen-scr1'
		)!;
		const byPath = Object.fromEntries(surface.stateDefinitions.map((d) => [d.path as string, d]));
		// Declared by a feature: its type, its enum values, the seed in that shape.
		expect(byPath['cart.count']).toMatchObject({ type: 'number', defaultValue: 3, initial: '3', seeded: true });
		expect(byPath['lecture.statut']).toMatchObject({
			type: 'enum',
			enumValues: ['arrete', 'en_lecture', 'en_pause'],
			defaultValue: 'arrete'
		});
		// Declared by nobody: the shape of the value decides.
		expect(byPath['cart.open']).toMatchObject({ type: 'boolean', defaultValue: false });
		expect(byPath['tickets.left']).toMatchObject({ type: 'number', defaultValue: 12 });
		expect(byPath['greeting']).toMatchObject({ type: 'string', defaultValue: 'hello' });
		expect(Object.values(byPath).every((d) => (d.id as string).startsWith('st-seed-'))).toBe(true);
	});

	it('declares leftover seeds once, on the entry screen only', () => {
		const draft = sampleDraft();
		draft.builder = {
			...draft.builder,
			screenRoots: { nav: 'root-nav', scr1: 'root-scr1' },
			entryScreenId: 'scr1',
			nodes: {},
			stateSeeds: [{ path: 'cart.count', value: '3' }]
		};
		const ops = experienceDraftToBehaviorOps(draft, { features: null, users: usersWith() });
		const upsert = ops.find((o) => o.kind === 'upsertExperienceFeature');
		if (upsert?.kind !== 'upsertExperienceFeature') throw new Error('unreachable');
		const surfaces = upsert.surfaces as { id: string; stateDefinitions: { path: string }[] }[];
		expect(surfaces.find((s) => s.id === 'srf-screen-scr1')!.stateDefinitions.map((d) => d.path)).toEqual(['cart.count']);
		expect(surfaces.find((s) => s.id === 'srf-screen-nav')!.stateDefinitions).toEqual([]);
	});

	it('marks builder screen surfaces as presentation, but not the journey surfaces', () => {
		const draft = sampleDraft();
		// A builder screen root makes buildBuilderBehavior emit a `screen` surface.
		draft.builder = { ...draft.builder, screenRoots: { scr1: 'root-scr1' } };
		const ops = experienceDraftToBehaviorOps(draft, { features: null, users: usersWith() });
		const upsert = ops.find((o) => o.kind === 'upsertExperienceFeature');
		if (upsert?.kind !== 'upsertExperienceFeature') throw new Error('unreachable');
		const surfaces = upsert.surfaces as { id: string; type: string; presentation?: boolean }[];
		const screen = surfaces.find((s) => s.id === 'srf-screen-scr1')!;
		const workflow = surfaces.find((s) => s.id === 'srf-J1')!;
		// Screen surfaces are UI → excluded from behavior maturity (unspaghettit >= 0.10.0).
		expect(screen.type).toBe('screen');
		expect(screen.presentation).toBe(true);
		// Journey (workflow) surfaces carry the modeled behavior and stay scored.
		expect(workflow.type).toBe('workflow');
		expect(workflow.presentation).toBeUndefined();
	});
});

describe('buildExperienceProjection (kernel overlay / two-way binding)', () => {
	/** Build a kernel experience feature snapshot from the draft's own projection. */
	function kernelFeatureFrom(draft: ProjectExperienceDraft, users: ProjectUsersDraft): UnspaFeatureSnapshot {
		const ops = experienceDraftToBehaviorOps(draft, { features: null, users });
		const upsert = ops.find((o) => o.kind === 'upsertExperienceFeature');
		if (upsert?.kind !== 'upsertExperienceFeature') throw new Error('no upsert');
		return {
			format: 'unspaghettit',
			version: 1,
			feature: { id: upsert.featureId, name: 'Experience', surfaces: upsert.surfaces, personas: upsert.personas, events: upsert.events }
		} as UnspaFeatureSnapshot;
	}

	it('returns the residue draft untouched when the kernel has no experience feature yet', () => {
		const draft = sampleDraft();
		const residue = experienceResidueFromDraft(draft);
		const out = buildExperienceProjection('p1', residue, null);
		expect(out.journeys).toEqual(draft.journeys);
		expect(out.steps).toEqual(draft.steps);
		expect(out.derivedCores).toEqual([]);
	});

	it('round-trips journeys/steps through the kernel overlay, decorated by residue', () => {
		const draft = sampleDraft();
		const feature = kernelFeatureFrom(draft, usersWith());
		const out = buildExperienceProjection('p1', experienceResidueFromDraft(draft), feature);
		expect(out.journeys.map((j) => ({ id: j.id, name: j.name, coreId: j.coreId, actorRoleIds: j.actorRoleIds }))).toEqual([
			{ id: 'J1', name: 'Checkout', coreId: 'coreA', actorRoleIds: ['R1'] }
		]);
		expect(out.steps.map((s) => ({ id: s.id, name: s.name, linkedScreenId: s.linkedScreenId }))).toEqual([
			{ id: 'S1', name: 'Open cart', linkedScreenId: 'scr1' },
			{ id: 'S2', name: 'Pay', linkedScreenId: null }
		]);
		// the per-step underlays are preserved from residue for live steps
		expect(out.stepOperations).toHaveLength(1);
		expect(out.stepDataReads).toHaveLength(1);
	});

	it('surfaces a journey + step authored purely in unspa (dashboard edit shows up)', () => {
		const draft = sampleDraft();
		const feature = kernelFeatureFrom(draft, usersWith());
		// Simulate a dashboard edit: rename J1's surface and add a brand-new journey J2.
		const f = feature.feature as { surfaces: { id: string; name: string; type: string; actions: unknown[]; transitions: unknown[] }[] };
		f.surfaces.find((s) => s.id === 'srf-J1')!.name = 'Renamed Checkout';
		f.surfaces.push({
			id: 'srf-J2',
			name: 'Support',
			type: 'workflow',
			actions: [{ id: 'act-S9', name: 'Contact' }],
			transitions: []
		});

		const out = buildExperienceProjection('p1', experienceResidueFromDraft(draft), feature);
		expect(out.journeys.map((j) => j.id)).toEqual(['J1', 'J2']);
		expect(out.journeys.find((j) => j.id === 'J1')!.name).toBe('Renamed Checkout'); // rename round-trips
		const j2 = out.journeys.find((j) => j.id === 'J2')!;
		expect(j2.name).toBe('Support');
		expect(j2.coreId).toBe(''); // orphaned — the author re-homes it
		expect(out.steps.find((s) => s.id === 'S9')!.journeyId).toBe('J2');
	});

	it('drops a journey deleted in unspa and prunes its orphaned step underlays', () => {
		const draft = sampleDraft();
		const feature = kernelFeatureFrom(draft, usersWith());
		// Dashboard deletes step S1's action (removing the only op/read owner).
		const f = feature.feature as { surfaces: { id: string; actions: { id: string }[] }[] };
		const wf = f.surfaces.find((s) => s.id === 'srf-J1')!;
		wf.actions = wf.actions.filter((a) => a.id !== 'act-S1');

		const out = buildExperienceProjection('p1', experienceResidueFromDraft(draft), feature);
		expect(out.steps.map((s) => s.id)).toEqual(['S2']);
		expect(out.stepOperations).toHaveLength(0); // O1 belonged to S1 → pruned
		expect(out.stepDataReads).toHaveLength(0); // D1 belonged to S1 → pruned
	});

	it('round-trips screen names and engine-authored actions into editable builder elements', () => {
		const draft = sampleDraft();
		const root = ensureScreenRoot(draft.builder, 'scr1');
		const button = createElementNode('scr1', root, 'button');
		addNode(draft.builder, { ...button, id: 'checkout', label: 'Checkout' });
		const feature = kernelFeatureFrom(draft, usersWith());
		const surfaces = (feature.feature as { surfaces: { id: string; name: string; actions: { id: string; name: string }[] }[] }).surfaces;
		const screen = surfaces.find((surface) => surface.id === 'srf-screen-scr1')!;
		screen.name = 'Storefront';
		screen.actions[0].name = 'Pay now';
		screen.actions.push({ id: '8f3d2a', name: 'Ask support' });

		const out = buildExperienceProjection('p1', experienceResidueFromDraft(draft), feature);
		expect(out.screens.find((item) => item.id === 'scr1')?.name).toBe('Storefront');
		expect(out.builder.nodes.checkout).toMatchObject({ label: 'Pay now' });
		const imported = Object.values(out.builder.nodes).find(
			(node) => node.kind === 'element' && node.kernelActionId === '8f3d2a'
		);
		expect(imported).toMatchObject({ elementKind: 'button', label: 'Ask support' });

		const roundTrip = kernelFeatureFrom(out, usersWith());
		const roundTripScreen = (roundTrip.feature as { surfaces: { id: string; actions: { id: string }[] }[] }).surfaces.find(
			(surface) => surface.id === 'srf-screen-scr1'
		)!;
		expect(roundTripScreen.actions.map((action) => action.id)).toEqual([
			'act-checkout',
			'8f3d2a'
		]);
	});

	it('does not resurrect a builder action deleted from its kernel screen', () => {
		const draft = sampleDraft();
		const root = ensureScreenRoot(draft.builder, 'scr1');
		const button = createElementNode('scr1', root, 'button');
		addNode(draft.builder, { ...button, id: 'checkout', label: 'Checkout' });
		const feature = kernelFeatureFrom(draft, usersWith());
		const surfaces = (feature.feature as { surfaces: { id: string; actions: unknown[] }[] }).surfaces;
		surfaces.find((surface) => surface.id === 'srf-screen-scr1')!.actions = [];

		const out = buildExperienceProjection('p1', experienceResidueFromDraft(draft), feature);
		expect(out.builder.nodes.checkout).toBeUndefined();
	});
});
