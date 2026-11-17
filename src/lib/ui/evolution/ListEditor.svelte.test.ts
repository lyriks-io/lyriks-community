import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ListEditor from './ListEditor.svelte';

/** An answer read as a list is edited as one, a field per point (ac-evo-form-list-edit). */
describe('the list editor [criterion:ac-leaf-ac-evo-form-list-edit]', () => {
	it('opens one field per point, in their order, each with its own way out, and one more to add at the end', () => {
		const { body } = render(ListEditor, {
			props: { projectId: 'p', points: ['Pas de retrait à moins de 48 heures.', 'Six gâteaux par jour au plus.'], cite: false, onchange: () => {} }
		});
		expect(body.match(/<textarea/g)).toHaveLength(2);
		expect(body.indexOf('Pas de retrait à moins de 48 heures.')).toBeLessThan(body.indexOf('Six gâteaux par jour au plus.'));
		expect(body).toContain('aria-label="Remove point 2"');
		expect(body).toContain('Add a point');
	});

	it('opens the point clicked alone, the others reading as they did and opening on a click', () => {
		const points = ['Pas de retrait à moins de 48 heures.', 'Six gâteaux par jour au plus.', 'Pas de retrait le dimanche.'];
		const { body } = render(ListEditor, { props: { projectId: 'p', points, cite: false, only: 1, onchange: () => {} } });
		expect(body.match(/<textarea/g)).toHaveLength(1);
		expect(body).toMatch(/<textarea[^>]*>Six gâteaux par jour au plus\.<\/textarea>/);
		expect(body.match(/title="Edit this point"/g)).toHaveLength(2);
		expect(body.indexOf('Pas de retrait à moins de 48 heures.')).toBeLessThan(body.indexOf('Six gâteaux'));
		expect(body).not.toContain('aria-label="Remove point 1"');
		expect(body).toContain('aria-label="Remove point 2"');
	});

	it('opens every point when opened as a whole, from the pencil', () => {
		const { body } = render(ListEditor, { props: { projectId: 'p', points: ['Un.', 'Deux.', 'Trois.'], cite: false, only: null, onchange: () => {} } });
		expect(body.match(/<textarea/g)).toHaveLength(3);
		expect(body).not.toContain('title="Edit this point"');
	});

	it('opens one empty point for an answer with nothing yet', () => {
		const { body } = render(ListEditor, { props: { projectId: 'p', points: [], cite: false, placeholder: 'One refusal per line', onchange: () => {} } });
		expect(body.match(/<textarea/g)).toHaveLength(1);
		expect(body).toContain('One refusal per line');
	});
});
