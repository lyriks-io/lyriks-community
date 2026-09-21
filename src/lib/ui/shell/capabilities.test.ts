import { describe, expect, it } from 'vitest';
import { capabilityById, NAV_CAPABILITIES, PROJECT_TOOL_CAPABILITIES, resolveVisibleCapability } from './capabilities';

describe('knowledge graph navigation', () => {
	it('folds the graph into the Data & Architecture tabs, off the left nav', () => {
		const graph = capabilityById('graph');

		expect(graph).toMatchObject({ status: 'hidden', partOf: 'infrastructure' });
		expect(graph?.route?.('project-1')).toBe('/projects/project-1/infrastructure?tab=graph');
		// Control Center "Fix now" on a graph dimension lands on its host page.
		expect(resolveVisibleCapability('graph')?.id).toBe('infrastructure');
		expect(NAV_CAPABILITIES.map((capability) => capability.id)).not.toContain('graph');
		expect(PROJECT_TOOL_CAPABILITIES.map((capability) => capability.id)).not.toContain('graph');
	});
});

describe('evolution navigation', () => {
	it('folds evolution into the Features tabs, off the left nav', () => {
		const evolution = capabilityById('evolution');

		expect(evolution).toMatchObject({ status: 'hidden', partOf: 'features' });
		expect(evolution?.route?.('project-1')).toBe('/projects/project-1/features?tab=evolution');
		// Control Center "Fix now" on an evolution dimension lands on its host page.
		expect(resolveVisibleCapability('evolution')?.id).toBe('features');
		expect(NAV_CAPABILITIES.map((capability) => capability.id)).not.toContain('evolution');
		expect(PROJECT_TOOL_CAPABILITIES.map((capability) => capability.id)).not.toContain('evolution');
	});
});

describe('scope coverage is not surfaced', () => {
	it('has no page and no route — the ledger is agent-authored, not a human surface', () => {
		const scope = capabilityById('scope');

		expect(scope).toMatchObject({ status: 'hidden' });
		expect(scope?.route).toBeUndefined();
		expect(NAV_CAPABILITIES.map((capability) => capability.id)).not.toContain('scope');
		expect(PROJECT_TOOL_CAPABILITIES.map((capability) => capability.id)).not.toContain('scope');
		// Nothing may advertise a link to it: consumers treat a missing route as
		// "not navigable" (see the Capability contract).
		expect(resolveVisibleCapability('scope')).toBeUndefined();
	});
});

describe('retired operator modules', () => {
	it.each(['supervision', 'finops'])('does not advertise %s anywhere', (id) => {
		expect(capabilityById(id)).toBeUndefined();
		expect(resolveVisibleCapability(id)).toBeUndefined();
		expect(NAV_CAPABILITIES.map((capability) => capability.id)).not.toContain(id);
		expect(PROJECT_TOOL_CAPABILITIES.map((capability) => capability.id)).not.toContain(id);
	});

	it('preserves the Baselines route under Traceability', () => {
		expect(capabilityById('baselines')?.route?.('project-1')).toBe('/projects/project-1/traceability?tab=baselines');
	});
});

describe('project tools menu', () => {
	it('offers Documents & Sources only — Traceability stays deep-linkable but hidden', () => {
		expect(PROJECT_TOOL_CAPABILITIES.map((capability) => capability.id)).toEqual(['documents']);
		expect(capabilityById('traceability')?.route?.('project-1')).toBe(
			'/projects/project-1/traceability'
		);
	});
});
