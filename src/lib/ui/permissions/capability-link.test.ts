import { describe, expect, it } from 'vitest';
import { capabilityHref } from './capability-link';

describe('capabilityHref', () => {
	it('opens a feature on its detail drawer, anchored in the tree behind it', () => {
		expect(capabilityHref('p1', 'feat-refunds', 'feature')).toBe(
			'/projects/p1/features?tab=tree&feature=feat-refunds&node=feat-refunds'
		);
	});

	it('opens a journey on the Experience journeys tab', () => {
		expect(capabilityHref('p1', 'journey-checkout', 'journey')).toBe(
			'/projects/p1/experience?tab=journeys&node=journey-checkout'
		);
	});

	it('opens a page in the Experience builder, on that screen', () => {
		expect(capabilityHref('p1', 'screen:scr-invoices', 'surface')).toBe(
			'/projects/p1/experience?tab=screens&screen=scr-invoices'
		);
	});

	it('opens a behavior surface on the Behavior tab of the feature that authored it', () => {
		// A dialog has no editor of its own — its owning leaf is the closest thing.
		expect(capabilityHref('p1', 'surface:feat-refunds:dlg-confirm', 'surface')).toBe(
			'/projects/p1/features?tab=behavior&node=feat-refunds'
		);
	});

	it('has no link for rows authored nowhere else', () => {
		// System capabilities are built in; off-structure rows are authored in the
		// matrix itself, so linking away from them would be a round trip to nowhere.
		expect(capabilityHref('p1', 'edit_permissions', 'system')).toBeNull();
		expect(capabilityHref('p1', 'cap-export', 'off_structure')).toBeNull();
	});

	it('escapes ids so a stray character cannot break the URL', () => {
		expect(capabilityHref('p1', 'feat a&b', 'feature')).toBe(
			'/projects/p1/features?tab=tree&feature=feat%20a%26b&node=feat%20a%26b'
		);
	});

	it('yields no link for a malformed surface id rather than a broken one', () => {
		expect(capabilityHref('p1', 'surface:no-separator', 'surface')).toBeNull();
	});
});
