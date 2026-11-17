import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import AddMenu from './AddMenu.svelte';

const entry = (label: string, unavailable?: string) => ({ label, icon: 'plus' as const, onSelect: () => {}, unavailable });

/** Each view adds what it holds from one Add menu, each entry named for what it adds (ac-evo-func-uml-edit). */
describe('a view adds from one Add menu [criterion:ac-leaf-ac-evo-func-uml-edit]', () => {
	it('folds the kinds a view adds under one Add button', () => {
		const { body } = render(AddMenu, { props: { entries: [entry('Add a person'), entry('Add a system'), entry('Add a use case')] } });
		expect(body).toContain('Add');
		expect(body).toContain('aria-haspopup="menu"');
		expect(body).toContain('aria-expanded="false"');
		expect(body).not.toContain('Add a person');
	});

	it('shows the one kind a view adds as a single button named for it', () => {
		const { body } = render(AddMenu, { props: { entries: [entry('Add a step')] } });
		expect(body).toContain('Add a step');
		expect(body).not.toContain('aria-haspopup');
	});

	it('greys an entry that cannot be used yet and says why', () => {
		const { body } = render(AddMenu, { props: { entries: [entry('Add a step', 'Add a use case first: a flow walks one through.')] } });
		expect(body).toMatch(/<button[^>]*disabled/);
		expect(body).toContain('title="Add a use case first: a flow walks one through."');
	});
});
