import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import UserList from './UserList.svelte';

vi.mock('$ui/spec360/validation.svelte', () => ({ useValidation: () => ({ control: () => null }) }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => ({ editing: null }) }));
// Its review control is the standard one, tested where it lives (SpecControls); the list is read here alone.
vi.mock('./OwnValidation.svelte', () => ({ default: () => {} }));

describe('the Overview lists who uses the product, read only [criterion:90232fe6]', () => {
	const users = [
		{ id: 'guest', name: 'Guest', description: 'Someone not logged in.', userClass: 'end' as const },
		{ id: 'admin', name: 'Administrator', description: '', userClass: 'admin' as const }
	];
	const html = render(UserList, { props: { users, reach: { guest: 22, admin: 1 }, hrefOf: (id: string) => `/projects/p/spec/users/${id}` } }).body.replace(/<!--.*?-->/g, '');

	it('reads each user as a line: its name, its tag and how many actions it can perform, named', () => {
		expect(html).toContain('href="/projects/p/spec/users/guest"');
		expect(html).toMatch(/>Guest<\/strong>/);
		expect(html).toMatch(/>End user<\/span>/);
		expect(html).toMatch(/border-violet[^"]*">Admin<\/span>/);
		expect(html).toMatch(/>22<\/b> actions</);
		expect(html).toMatch(/>1<\/b> action</);
		// The count alone, no bar beside it (criterion 41a9c9d6).
		expect(html).not.toContain('clip-path');
	});

	it('shows its description on hover alone', () => {
		expect(html).toContain('title="Someone not logged in."');
	});
});
