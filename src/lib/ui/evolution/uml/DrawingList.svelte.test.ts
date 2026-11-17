import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DrawingList from './DrawingList.svelte';

/** Every drawing of a view is listed beside it, the one drawn marked, one holding a problem signed (ac-evo-func-uml, ac-evo-tech-uml). */
const flows = [
	{ name: 'Commander un gâteau sur mesure', detail: '2 steps', marked: false },
	{ name: 'Payer l’acompte', detail: '1 step', marked: true },
	{ name: 'Annuler une commande', detail: '0 steps', marked: false }
];
const props = (over: Record<string, unknown> = {}) => ({ entries: flows, active: null, onpick: () => {}, label: 'Flows', unclear: 'Something in this flow is unclear', ...over });

describe('the drawings of a view are listed beside it [criterion:ac-leaf-ac-evo-func-uml]', () => {
	it('lists every drawing at once, by its name and what it holds', () => {
		const { body } = render(DrawingList, { props: props() });
		for (const f of flows) expect(body).toContain(f.name);
		expect(body).toContain('2 steps');
		expect(body).toContain('1 step<');
		expect(body.match(/<button/g)).toHaveLength(3);
		expect(body).toContain('aria-label="Flows"');
	});

	it('marks the drawing drawn, and only that one', () => {
		const { body } = render(DrawingList, { props: props({ active: 'Payer l’acompte' }) });
		expect(body.match(/aria-current="true"/g)).toHaveLength(1);
		expect(body).toMatch(/aria-current="true"[^>]*>[\s\S]*?Payer l’acompte/);
		expect(body).toContain('bg-ink text-paper');
	});

	it('signs a drawing that holds a problem, in words as well as by its icon', () => {
		const { body } = render(DrawingList, { props: props() });
		expect(body.match(/Something in this flow is unclear/g)).toHaveLength(2);
	});

	it('lists the things whose states change and the sequences the same way [criterion:ac-leaf-ac-evo-tech-uml]', () => {
		const things = [
			{ name: 'Abonnement', detail: '5 states', marked: false },
			{ name: 'Paiement', detail: '5 states', marked: false }
		];
		const { body } = render(DrawingList, { props: props({ entries: things, active: 'Paiement', label: 'Things whose states change' }) });
		expect(body).toContain('aria-label="Things whose states change"');
		expect(body).toContain('5 states');
		expect(body.match(/<button/g)).toHaveLength(2);
	});
});
