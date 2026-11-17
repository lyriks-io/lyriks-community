import { describe, expect, it } from 'vitest';
import { pageValueLabel } from './page-value-labels';

describe('a section change reads a choice as its page shows it [criterion:ac-leaf-ac-evo-draft-section-read]', () => {
	it('names the choices of At a glance and Requirements by their label, and leaves any other value as it is', () => {
		expect(pageValueLabel({ path: 'definition.security.encryption' }, 'in_transit')).toBe('In transit');
		expect(pageValueLabel({ path: 'definition.market.languages' }, 'fr')).toBe('French');
		expect(pageValueLabel({ path: 'identity.formFactors' }, 'unknown_code')).toBe('unknown_code');
		expect(pageValueLabel({ path: 'operations.quality.browsers' }, 'Evergreen')).toBe('Evergreen');
	});
});
