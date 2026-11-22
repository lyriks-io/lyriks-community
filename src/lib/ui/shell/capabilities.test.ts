import { describe, expect, it } from 'vitest';
import { capabilityById, navCapabilitiesFor, resolveVisibleCapability, sectionsOf } from './capabilities';

/**
 * The capability registry as the app reads it: where a point Lyriks noticed is fixed (resolveVisibleCapability, the
 * project layout), the old addresses capabilityById still answers, and the project's Settings the account menu
 * offers (navCapabilitiesFor, sectionsOf).
 */

describe('a point is fixed on the page the reader finds it under', () => {
	it('names a capability folded into another page after that page', () => {
		expect(capabilityById('graph')?.route?.('project-1')).toBe('/projects/project-1/infrastructure?tab=graph');
		expect(resolveVisibleCapability('graph')?.id).toBe('infrastructure');
	});

	it('names a page of its own after itself', () => {
		expect(resolveVisibleCapability('evolution')?.id).toBe('evolution');
		expect(capabilityById('evolution')?.route?.('project-1')).toBe('/projects/project-1/evolution');
	});

	it('names nothing for what has no page, so the caller falls back to its own label', () => {
		expect(capabilityById('scope')?.route).toBeUndefined();
		expect(resolveVisibleCapability('scope')).toBeUndefined();
	});

	it.each(['supervision', 'finops'])('knows nothing of the retired module %s', (id) => {
		expect(capabilityById(id)).toBeUndefined();
		expect(resolveVisibleCapability(id)).toBeUndefined();
	});

	it('keeps the Baselines address under Traceability', () => {
		expect(capabilityById('baselines')?.route?.('project-1')).toBe('/projects/project-1/traceability?tab=baselines');
	});
});

describe('the project settings [criterion:ac-leaf-ac-proj-settings]', () => {
	it('are offered only to whoever administers the project', () => {
		expect(navCapabilitiesFor(false).some((c) => c.adminOnly)).toBe(false);
		// Only Enterprise registers them: the open-source tree has no Settings entry at all.
		if (capabilityById('settings')) {
			expect(navCapabilitiesFor(true).at(-1)?.id).toBe('settings');
			expect(navCapabilitiesFor(false).map((c) => c.id)).not.toContain('settings');
			// The gear's menu lists the sections the Settings hold, the Team first.
			expect(sectionsOf('settings').map((c) => c.id)).toEqual(['team']);
			// The Team is a section of Settings, and its old address opens it there.
			expect(resolveVisibleCapability('team')?.id).toBe('settings');
			expect(capabilityById('team')?.route?.('p1')).toBe('/projects/p1/settings?section=team');
		} else {
			expect(navCapabilitiesFor(true).some((c) => c.foot)).toBe(false);
		}
	});
});
