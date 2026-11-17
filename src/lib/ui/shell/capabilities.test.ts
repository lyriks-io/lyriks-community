import { describe, expect, it } from 'vitest';
import { capabilityById, NAV_CAPABILITIES, navCapabilitiesFor, PROJECT_TOOL_CAPABILITIES, resolveVisibleCapability, sectionsOf } from './capabilities';

describe('knowledge graph navigation', () => {
	it('folds the graph into the Tech & Data tabs, off the left nav', () => {
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
	it('gives evolution its own left-nav page, set apart as the last entry', () => {
		const evolution = capabilityById('evolution');

		expect(evolution).toMatchObject({ status: 'built' });
		expect(evolution?.partOf).toBeUndefined();
		expect(evolution?.route?.('project-1')).toBe('/projects/project-1/evolution');
		// Control Center "Fix now" on an evolution dimension lands on its own page.
		expect(resolveVisibleCapability('evolution')?.id).toBe('evolution');
		// The last of the pages; the project's Settings stand apart under them (ac-proj-settings).
		const nav = NAV_CAPABILITIES.filter((capability) => !capability.foot).map((capability) => capability.id);
		expect(nav.at(-1)).toBe('evolution');
		expect(NAV_CAPABILITIES.filter((capability) => capability.featured).map((c) => c.id)).toEqual([
			'evolution'
		]);
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

describe('the project settings [criterion:ac-leaf-ac-proj-settings]', () => {
	it('are a gear at the very foot of the left nav, shown only to whoever administers the project', () => {
		for (const cap of NAV_CAPABILITIES.filter((c) => c.foot)) expect(cap).toMatchObject({ adminOnly: true });
		expect(navCapabilitiesFor(false).some((c) => c.adminOnly)).toBe(false);
		// Only Enterprise registers them: the open-source tree has no Settings entry at all.
		if (capabilityById('settings')) {
			expect(NAV_CAPABILITIES.at(-1)?.id).toBe('settings');
			expect(navCapabilitiesFor(true).at(-1)?.id).toBe('settings');
			expect(navCapabilitiesFor(false).map((c) => c.id)).not.toContain('settings');
			// The gear's menu lists the sections the Settings hold, the Team first.
			expect(sectionsOf('settings').map((c) => c.id)).toEqual(['team']);
			// The Team is a section of Settings, and its old address opens it there.
			expect(resolveVisibleCapability('team')?.id).toBe('settings');
			expect(capabilityById('team')?.route?.('p1')).toBe('/projects/p1/settings?section=team');
		} else {
			expect(NAV_CAPABILITIES.some((c) => c.foot)).toBe(false);
		}
	});
});
