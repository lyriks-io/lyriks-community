import { describe, expect, it } from 'vitest';
import { createEmptyUsersDraft, type PermissionGrant } from '$domain/users';
import { capabilityRegistry, reviewCapabilityReferences, validateCapabilityReferences } from './capability-registry';

describe('canonical capability registry', () => {
	const draft = createEmptyUsersDraft('p');
	const registry = capabilityRegistry(draft, { features: [], journeys: [], surfaces: [{ id: 'screen:editor', label: 'Editor', source: 'surface', sourceRefId: 'editor', sourceRefLabel: 'Editor' }] });
	it('exposes the exact permission payload and supported verbs', () => {
		expect(registry.find(r => r.capabilityId === 'screen:editor')).toMatchObject({ capabilitySource: 'surface', actions: ['view', 'create', 'read', 'update', 'delete'] });
	});
	it('rejects bare screen ids and gives the correction before persistence', () => {
		const issues = validateCapabilityReferences({ ...draft, permissions: [{ roleId: 'author', capabilitySource: 'surface', capabilityId: 'editor' }] }, registry);
		expect(issues[0].message).toContain('Use "screen:editor"');
	});
	it('rejects dangling ids and mismatched source namespaces', () => {
		for (const grant of [{ capabilityId: 'screen:unknown', capabilitySource: 'surface' as const }, { capabilityId: 'screen:editor', capabilitySource: 'feature' as const }]) {
			expect(validateCapabilityReferences({ ...draft, permissions: [{ ...grant, roleId: 'author' }] }, registry)).toHaveLength(1);
		}
	});
	it('accepts a grant that resolves exactly', () => {
		expect(validateCapabilityReferences({ ...draft, permissions: [{ roleId: 'author', capabilitySource: 'surface', capabilityId: 'screen:editor' }] }, registry)).toEqual([]);
	});
});

/**
 * The matrix has to survive a capability being renamed or removed.
 *
 * A grant whose capability is gone gives nobody anything: it is dead data. What
 * these pin is that the matrix cleans it and says so, while still refusing a
 * caller who invents an id now, and above all that the section can ALWAYS be
 * saved. Refusing a stored dead row walls the section shut for good, because
 * removing that row is itself a write, and the field case that proved it was a
 * feature renamed to `feat-fb747-knowledge-graph` leaving `feat-knowledge-graph`
 * grants behind: every later save of the access matrix answered 400, including
 * the ones that would have repaired it.
 */
describe('a renamed or removed capability never wedges the matrix shut', () => {
	const draft = createEmptyUsersDraft('p');
	const registry = capabilityRegistry(draft, {
		features: [{ id: 'feat-fb747-knowledge-graph', label: 'Explore the knowledge graph', source: 'feature', sourceRefId: 'feat-fb747-knowledge-graph', sourceRefLabel: 'Explore the knowledge graph' }],
		journeys: [],
		surfaces: []
	});
	const dead: PermissionGrant = { roleId: 'role-designer', capabilitySource: 'feature', capabilityId: 'feat-knowledge-graph', action: 'read' };
	const live: PermissionGrant = { roleId: 'role-designer', capabilitySource: 'feature', capabilityId: 'feat-fb747-knowledge-graph', action: 'read' };
	const withGrants = (...permissions: PermissionGrant[]) => ({ ...draft, permissions });

	it('drops a stored grant whose capability no longer exists, and names what it dropped', () => {
		const review = reviewCapabilityReferences(withGrants(dead, live), withGrants(dead), registry);
		expect(review.issues).toEqual([]);
		expect(review.permissions).toEqual([live]);
		expect(review.dropped).toHaveLength(1);
		expect(review.dropped[0]).toMatchObject({ roleId: 'role-designer', capabilityId: 'feat-knowledge-graph' });
		expect(review.dropped[0].reason).toContain('gave nobody anything');
	});

	it('refuses the same id when the caller is introducing it now', () => {
		const review = reviewCapabilityReferences(withGrants(dead), draft, registry);
		expect(review.dropped).toEqual([]);
		expect(review.issues).toHaveLength(1);
		expect(review.issues[0].message).toContain('does not resolve');
	});

	it('lets the write that repairs the matrix through, which is the whole point', () => {
		// The exact shape of the field failure: the stored matrix carries dead rows,
		// and the save that would add a legitimate grant carries them along.
		const stored = withGrants(dead, { ...dead, action: 'view' });
		const incoming = withGrants(dead, { ...dead, action: 'view' }, live);
		const review = reviewCapabilityReferences(incoming, stored, registry);
		expect(review.issues).toEqual([]);
		expect(review.permissions).toEqual([live]);
		expect(review.dropped).toHaveLength(2);
	});

	it('leaves a matrix with nothing dead exactly as it was', () => {
		const review = reviewCapabilityReferences(withGrants(live), withGrants(live), registry);
		expect(review).toMatchObject({ issues: [], dropped: [], permissions: [live] });
	});

	it('tells a stored grant from a new one by the whole row, not the capability alone', () => {
		// Same dead capability, a different role: the second row is being introduced
		// even though its capability was already dead elsewhere, so it is refused.
		const review = reviewCapabilityReferences(
			withGrants(dead, { ...dead, roleId: 'role-viewer' }),
			withGrants(dead),
			registry
		);
		expect(review.dropped).toHaveLength(1);
		expect(review.issues).toHaveLength(1);
	});

	it('keeps validateCapabilityReferences strict, since a fresh check has nothing stored', () => {
		expect(validateCapabilityReferences(withGrants(dead), registry)).toHaveLength(1);
	});
});
