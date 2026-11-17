import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ActSelector from './ActSelector.svelte';

const act = (label: string) => ({ label, icon: 'check' as const, look: 'text-ink-700', onSelect: () => {} });

/** The acts of a card as one selector: the first in one click, the others under its arrow (ac-evo-form-question-acts). */
describe('the acts of a card are one selector [criterion:ac-leaf-ac-evo-form-question-acts]', () => {
	it('writes the first act in full beside a small arrow, the others folded under it', () => {
		const { body } = render(ActSelector, { props: { acts: [act('Validate'), act('Refuse'), act('Come back to it later')], label: 'Ce que le produit refuse' } });
		expect(body).toContain('Validate');
		expect(body).toContain('aria-label="Ce que le produit refuse: the other answers"');
		expect(body).toContain('aria-expanded="false"');
		expect(body).not.toContain('Refuse<');
		expect(body).not.toContain('role="menu"');
	});

	it('shows a single act alone, without the arrow', () => {
		const { body } = render(ActSelector, { props: { acts: [act('Come back to it later')], label: 'Le besoin' } });
		expect(body).toContain('Come back to it later');
		expect(body).not.toContain('aria-haspopup');
	});

	it('shows nothing when the card offers no act', () => {
		const { body } = render(ActSelector, { props: { acts: [], label: 'Le besoin' } });
		expect(body).not.toContain('<button');
	});
});
