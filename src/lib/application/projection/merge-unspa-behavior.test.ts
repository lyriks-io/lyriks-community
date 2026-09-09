import { describe, expect, it } from 'vitest';
import {
	mergeFeatureInvariants,
	mergeMirroredEntities,
	mergeMirroredEvents,
	mergeMirroredPersonas,
	mergeMirroredSurfaces,
	mergePersonas,
	mergeSurfaces,
	pruneOrphanedReachabilityGoals
} from './merge-unspa-behavior';

/**
 * The contract: re-syncing the Lyriks projection refreshes identity/structure
 * but never destroys behavior authored in the unspaghettit engine.
 */
describe('mergeSurfaces', () => {
	it('preserves engine-authored depth while refreshing Lyriks-owned fields', () => {
		const projected = [
			{
				id: 'srf-j1',
				name: 'New name',
				description: 'fresh',
				stateDefinitions: [],
				rules: [],
				invariants: [],
				actions: [
					{
						id: 'act-s1',
						name: 'Submit (renamed)',
						intent: 'fresh intent',
						parameters: [],
						rules: [],
						invariants: [],
						effects: [{ id: 'eff-s1-0', type: 'emit_event', event: 'submitted' }]
					}
				]
			}
		];
		const existing = [
			{
				id: 'srf-j1',
				name: 'Old name',
				stateDefinitions: [{ path: 'expense.status' }],
				rules: [{ id: 'r1' }],
				invariants: [{ id: 'inv1' }],
				actions: [
					{
						id: 'act-s1',
						name: 'Old action name',
						parameters: [{ name: 'amount' }],
						rules: [{ id: 'ar1' }],
						invariants: [{ id: 'ai1' }],
						scenarios: [{ id: 'sc1' }],
						effects: [
							{ id: 'eff-s1-0', type: 'emit_event', event: 'submitted' },
							{ id: 'eff-state-1', type: 'set_state', path: 'expense.status' }
						]
					}
				]
			}
		];

		const [s] = mergeSurfaces(projected, existing) as Array<Record<string, unknown>>;
		// Lyriks-owned identity refreshed
		expect(s.name).toBe('New name');
		expect(s.description).toBe('fresh');
		// engine-owned surface depth preserved
		expect(s.stateDefinitions).toHaveLength(1);
		expect(s.rules).toHaveLength(1);
		expect(s.invariants).toHaveLength(1);

		const a = (s.actions as Array<Record<string, unknown>>)[0];
		expect(a.name).toBe('Submit (renamed)'); // Lyriks owns the name/intent
		expect(a.intent).toBe('fresh intent');
		expect(a.parameters).toHaveLength(1); // engine depth preserved
		expect(a.rules).toHaveLength(1);
		expect(a.invariants).toHaveLength(1);
		expect(a.scenarios).toHaveLength(1);
		// effects unioned by id: the authored set_state survives alongside the emit_event
		expect((a.effects as unknown[]).map((e) => (e as { id: string }).id)).toEqual([
			'eff-s1-0',
			'eff-state-1'
		]);
	});

	it('owns eff-ui-* set_state effects: refreshed when re-projected, dropped when unwired', () => {
		const projected = [
			{
				id: 'srf-screen-scr1',
				name: 'Home',
				actions: [
					{
						id: 'act-btn1',
						name: 'Add',
						effects: [{ id: 'eff-ui-btn1-t1', type: 'set_state', path: 'cart.open', value: true }]
					}
				]
			}
		];
		const existing = [
			{
				id: 'srf-screen-scr1',
				name: 'Home',
				actions: [
					{
						id: 'act-btn1',
						name: 'Add',
						effects: [
							// stale value from an earlier wiring — must be replaced, not unioned
							{ id: 'eff-ui-btn1-t1', type: 'set_state', path: 'cart.open', value: false },
							// wiring removed in the builder — must be dropped
							{ id: 'eff-ui-btn1-t9', type: 'set_state', path: 'legacy.flag', value: true },
							// engine-authored (minted id) — must survive
							{ id: 'ab12cd34', type: 'set_state', path: 'expense.status', value: 'draft' }
						]
					}
				]
			}
		];
		const [s] = mergeSurfaces(projected, existing) as Array<Record<string, unknown>>;
		const a = (s.actions as Array<Record<string, unknown>>)[0];
		const effects = a.effects as Array<{ id: string; value?: unknown }>;
		expect(effects.map((e) => e.id)).toEqual(['eff-ui-btn1-t1', 'ab12cd34']);
		expect(effects[0].value).toBe(true); // the fresh projection wins
	});

	it('drops surfaces/actions the projection no longer produces (deletions propagate)', () => {
		const projected = [{ id: 'srf-j1', name: 'J1', actions: [] }];
		const existing = [
			{ id: 'srf-j1', name: 'old', actions: [{ id: 'act-only', name: 'Step deleted in Lyriks' }] },
			{ id: 'srf-deleted', name: 'Journey deleted in Lyriks', actions: [] }
		];
		const out = mergeSurfaces(projected, existing) as Array<Record<string, unknown>>;
		expect(out.map((s) => s.id)).toEqual(['srf-j1']); // srf-deleted gone
		const j1 = out[0];
		expect(j1.actions).toEqual([]); // act-only gone
	});

	it('preserves engine-owned surfaces and actions that the projection does not know', () => {
		const projected = [{ id: 'srf-j1', name: 'J1', actions: [{ id: 'act-s1', name: 'Known' }] }];
		const existing = [
			{
				id: 'srf-j1',
				name: 'J1',
				actions: [{ id: 'act-s1', name: 'Known' }, { id: 'ab12cd34', name: 'Engine action' }]
			},
			{ id: 'ff99aa00', name: 'Engine surface', actions: [] }
		];
		const out = mergeSurfaces(projected, existing) as Array<Record<string, unknown>>;
		expect(out.map((surface) => surface.id)).toEqual(['srf-j1', 'ff99aa00']);
		expect((out[0].actions as Array<{ id: string }>).map((action) => action.id)).toEqual([
			'act-s1',
			'ab12cd34'
		]);
	});
});

describe('mergePersonas', () => {
	it('refreshes identity, preserves overrides, drops personas with no Lyriks actor', () => {
		const projected = [{ id: 'per-employee', name: 'Employee', description: 'fresh' }];
		const existing = [
			{
				id: 'per-employee',
				name: 'old',
				stateOverrides: [{ path: 'expense.hasReceipt', value: true }],
				parameterOverrides: [],
				persistAcrossSurfaces: true
			},
			{
				id: 'per-over-limit',
				name: 'Persona with no actor role',
				stateOverrides: [],
				parameterOverrides: [{ parameterName: 'amount', value: 5000 }]
			}
		];
		const out = mergePersonas(projected, existing) as Array<Record<string, unknown>>;
		expect(out.map((p) => p.id)).toEqual(['per-employee']); // per-over-limit dropped
		const emp = out[0];
		expect(emp.name).toBe('Employee'); // Lyriks owns identity
		expect(emp.stateOverrides).toHaveLength(1); // engine override preserved
		expect(emp.persistAcrossSurfaces).toBe(true);
	});

	it('defaults override arrays so the dashboard never crashes', () => {
		const out = mergePersonas([{ id: 'per-x', name: 'X' }], []) as Array<Record<string, unknown>>;
		expect(out[0].stateOverrides).toEqual([]);
		expect(out[0].parameterOverrides).toEqual([]);
	});

	it('preserves an engine-owned persona that has no Lyriks actor role', () => {
		const out = mergePersonas(
			[{ id: 'per-employee', name: 'Employee' }],
			[{ id: 'b8f21a3c', name: 'Engine persona', stateOverrides: [], parameterOverrides: [] }]
		) as Array<Record<string, unknown>>;
		expect(out.map((persona) => persona.id)).toEqual(['per-employee', 'b8f21a3c']);
	});
});

/**
 * The Core-bridge mirror visits a leaf that unspa owns: it may add its Core's
 * journeys and refresh them, but an Experience save must never erase behavior
 * authored on that leaf via `apply_behavior_batch`.
 */
describe('mergeMirrored* (Core-bridge mirror on a leaf feature)', () => {
	it('refreshes a Lyriks-owned state definition, keeps engine-owned ones, drops the ones Lyriks no longer projects', () => {
		const projected = [
			{
				id: 'srf-screen-home',
				name: 'Home',
				stateDefinitions: [
					{ id: 'st-seed-coherence_score', path: 'coherence.score', type: 'number', seeded: true, initial: '72' }
				],
				rules: [],
				invariants: [],
				actions: []
			}
		];
		const existing = [
			{
				id: 'srf-screen-home',
				name: 'Home',
				stateDefinitions: [
					// The first projection typed the seed as a string; the engine shared it since.
					{ id: 'st-seed-coherence_score', path: 'coherence.score', type: 'string', seeded: true, initial: '72', sharedWith: ['srf-other'] },
					// Authored in the engine: not Lyriks' to touch.
					{ id: 'a62f763c', path: 'suggestions.available', type: 'number', defaultValue: 0 },
					// A field Lyriks used to project and no longer does: the user deleted it.
					{ id: 'st-old-field', path: 'form.gone', type: 'string' }
				],
				rules: [],
				invariants: [],
				actions: []
			}
		];
		const [s] = mergeSurfaces(projected, existing) as Array<Record<string, unknown>>;
		const defs = s.stateDefinitions as Array<Record<string, unknown>>;
		expect(defs.map((d) => d.id)).toEqual(['st-seed-coherence_score', 'a62f763c']);
		expect(defs[0]).toMatchObject({ type: 'number', sharedWith: ['srf-other'] });
	});

	it('keeps engine-authored surfaces the projection does not produce', () => {
		const projected = [{ id: 'srf-journey-organize', name: 'Find & resume a chat', actions: [] }];
		const existing = [
			{
				id: 'fc4f27f2',
				name: 'Pinned conversations',
				actions: [{ id: 'a1', name: 'Pin the conversation' }]
			}
		];
		const out = mergeMirroredSurfaces(projected, existing) as Array<Record<string, unknown>>;
		expect(out.map((s) => s.id)).toEqual(['srf-journey-organize', 'fc4f27f2']);
		expect((out[1].actions as unknown[])).toHaveLength(1);
	});

	it('still refreshes the surfaces it does project, preserving their depth', () => {
		const projected = [{ id: 'srf-j1', name: 'New name', actions: [] }];
		const existing = [{ id: 'srf-j1', name: 'Old name', rules: [{ id: 'r1' }] }];
		const [s] = mergeMirroredSurfaces(projected, existing) as Array<Record<string, unknown>>;
		expect(s.name).toBe('New name');
		expect(s.rules).toHaveLength(1);
	});

	it('keeps engine-authored personas and events', () => {
		// Engine personas carry minted (hex) ids, not the Lyriks `per-` convention.
		const personas = mergeMirroredPersonas(
			[{ id: 'per-free', name: 'Free Member' }],
			[{ id: 'b8f21a3c', name: 'Authored in unspa', stateOverrides: [], parameterOverrides: [] }]
		) as Array<Record<string, unknown>>;
		expect(personas.map((p) => p.id)).toEqual(['per-free', 'b8f21a3c']);

		const events = mergeMirroredEvents(
			[{ id: 'e1', name: 'chat.resumed' }],
			[
				{ id: 'e-old', name: 'chat.resumed' }, // same name, re-projected: no duplicate
				{ id: 'e2', name: 'chat.pinned' }
			]
		) as Array<Record<string, unknown>>;
		expect(events.map((e) => e.name)).toEqual(['chat.resumed', 'chat.pinned']);
	});
});

describe('mergeMirrored* tombstones (MR 7 — user-deleted Lyriks nodes stay gone)', () => {
	it('suppresses a Lyriks-owned surface the user deleted, while keeping engine surfaces', () => {
		const projected = [{ id: 'srf-a', name: 'Kept journey', actions: [] }];
		const existing = [
			{ id: 'srf-a', name: 'Kept journey (old)', actions: [] },
			{ id: 'srf-b', name: 'Deleted journey', actions: [] }, // Lyriks-owned, user deleted
			{ id: 'fc4f27f2', name: 'Dashboard surface', actions: [] } // engine-authored
		];
		const out = mergeMirroredSurfaces(projected, existing, new Set(['srf-b'])) as Array<Record<string, unknown>>;
		expect(out.map((s) => s.id)).toEqual(['srf-a', 'fc4f27f2']); // srf-b gone, engine kept
	});

	it('never lets a tombstone drop an engine-authored node', () => {
		const existing = [{ id: 'fc4f27f2', name: 'Dashboard surface', actions: [] }];
		// Even if the engine id is (wrongly) in the tombstone set, it must survive.
		const out = mergeMirroredSurfaces([], existing, new Set(['fc4f27f2'])) as Array<Record<string, unknown>>;
		expect(out.map((s) => s.id)).toEqual(['fc4f27f2']);
	});

	it('suppresses a deleted entity on the data mirror', () => {
		const out = mergeMirroredEntities(
			[{ id: 'ent-keep' }],
			[{ id: 'ent-keep' }, { id: 'ent-gone' }, { id: 'engine-ent' }],
			new Set(['ent-gone'])
		) as Array<Record<string, unknown>>;
		expect(out.map((e) => e.id)).toEqual(['ent-keep', 'engine-ent']);
	});

	it('suppresses a deleted event by name', () => {
		const events = mergeMirroredEvents(
			[{ id: 'e1', name: 'chat.resumed' }],
			[{ id: 'e2', name: 'chat.deleted' }],
			new Set(['chat.deleted'])
		) as Array<Record<string, unknown>>;
		expect(events.map((e) => e.name)).toEqual(['chat.resumed']);
	});

	it('by ownership alone (no tombstone) keeps engine surfaces but drops deleted Lyriks ones', () => {
		const out = mergeMirroredSurfaces(
			[{ id: 'srf-a', actions: [] }],
			[
				{ id: 'srf-b', actions: [] }, // Lyriks-owned, no longer projected → deleted → dropped
				{ id: 'd41c9e', actions: [] } // engine-authored → kept
			]
		) as Array<Record<string, unknown>>;
		expect(out.map((s) => s.id)).toEqual(['srf-a', 'd41c9e']);
	});
});

describe('mergeFeatureInvariants', () => {
	it('keeps engine invariants when the projection has none', () => {
		expect(mergeFeatureInvariants([], [{ id: 'fi1' }])).toEqual([{ id: 'fi1' }]);
		expect(mergeFeatureInvariants([], [])).toEqual([]);
		expect(mergeFeatureInvariants([], undefined)).toEqual([]);
	});
});

describe('pruneOrphanedReachabilityGoals', () => {
	const surfaces = [
		{
			id: 'srf-a',
			stateDefinitions: [{ id: 'sd1', path: 'cart.itemCount', type: 'number', defaultValue: 0 }]
		}
	];

	it('keeps goals whose condition paths are still declared', () => {
		const goals = [
			{
				id: 'g1',
				kind: 'reachable',
				condition: { left: 'cart.itemCount', operator: 'greater_than', right: { kind: 'literal', value: 0 } }
			}
		];
		expect(pruneOrphanedReachabilityGoals(goals, surfaces)).toEqual(goals);
	});

	it('drops a goal whose path left with its deleted surface', () => {
		const goals = [
			{
				id: 'g1',
				kind: 'reachable',
				condition: { left: 'checkout.completed', operator: 'equals', right: { kind: 'literal', value: true } }
			},
			{
				id: 'g2',
				kind: 'reachable',
				condition: { left: 'cart.itemCount', operator: 'greater_than', right: { kind: 'literal', value: 0 } }
			}
		];
		const out = pruneOrphanedReachabilityGoals(goals, surfaces) as Array<{ id: string }>;
		expect(out.map((g) => g.id)).toEqual(['g2']);
	});

	it('walks composite conditions and right-side state expressions', () => {
		const goals = [
			{
				id: 'g1',
				kind: 'always_reachable',
				condition: {
					kind: 'all',
					conditions: [
						{ left: 'cart.itemCount', operator: 'greater_than', right: { kind: 'literal', value: 0 } },
						{ left: 'cart.itemCount', operator: 'equals', right: { kind: 'state', path: 'gone.path' } }
					]
				}
			}
		];
		expect(pruneOrphanedReachabilityGoals(goals, surfaces)).toEqual([]);
	});

	it('treats the simulator clock as always declared and passes non-arrays through', () => {
		const goals = [
			{
				id: 'g1',
				kind: 'reachable',
				condition: { left: 'clock.now', operator: 'greater_than', right: { kind: 'literal', value: 10 } }
			}
		];
		expect(pruneOrphanedReachabilityGoals(goals, surfaces)).toEqual(goals);
		expect(pruneOrphanedReachabilityGoals(undefined, surfaces)).toBeUndefined();
	});
});
