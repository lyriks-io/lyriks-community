import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SetAsideProjectDialog from './SetAsideProjectDialog.svelte';

// EVO-016, criterion 601e615e: the dialog lists the N active projects, and Cancel changes nothing.
describe('the dialog that sets an active project aside [criterion:ac-leaf-601e615e-7310-47b4-a7d1-5b8d24f45605]', () => {
	const html = render(SetAsideProjectDialog, {
		props: {
			activeProjects: [
				{ id: 'a', name: 'Atlas' },
				{ id: 'b', name: 'Borealis' }
			],
			onpick: () => {},
			oncancel: () => {}
		}
	}).body;

	it('lists every active project to pick from, with Cancel', () => {
		expect(html).toContain('Atlas');
		expect(html).toContain('Borealis');
		expect(html.match(/type="radio"/g)).toHaveLength(2);
		expect(html).toContain('Cancel');
		expect(html).toContain('Set it aside');
	});

	it('sets nothing aside before a project is picked', () => {
		expect(html).toMatch(/aria-disabled="true"[^>]*>\s*Set it aside/);
	});
});
