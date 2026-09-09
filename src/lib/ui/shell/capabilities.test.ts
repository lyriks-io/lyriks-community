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

describe('supervision is withdrawn', () => {
	it('is registered but unreachable — no nav entry, no route, nothing to link', () => {
		const supervision = capabilityById('supervision');

		// Still registered, so stored references resolve to a name, not a dead string.
		expect(supervision).toMatchObject({ status: 'hidden', title: 'Supervision' });
		expect(supervision?.route).toBeUndefined();
		expect(NAV_CAPABILITIES.map((capability) => capability.id)).not.toContain('supervision');
		expect(PROJECT_TOOL_CAPABILITIES.map((capability) => capability.id)).not.toContain(
			'supervision'
		);
		// Control Center "Fix now" on a supervision gap must not offer a link either;
		// the layout falls back to the project root for a route-less capability.
		expect(resolveVisibleCapability('supervision')).toBeUndefined();
	});

	it('takes the AI Cost Governor with it — no redirect into a withdrawn page', () => {
		const finops = capabilityById('finops');

		expect(finops).toMatchObject({ status: 'hidden', partOf: 'supervision' });
		expect(finops?.route).toBeUndefined();
		expect(NAV_CAPABILITIES.map((capability) => capability.id)).not.toContain('finops');
		expect(resolveVisibleCapability('finops')).toBeUndefined();
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
