import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import UserMark from './UserMark.svelte';
import ActorMark from '../evolution/uml/ActorMark.svelte';

describe('one user mark, an admin with its shield [criterion:ac-leaf-ac-evo-func-uml]', () => {
	const mark = (admin: boolean, size = 44) => render(UserMark, { props: { admin, size } }).body;

	it('draws the user icon for everyone and adds the shield badge to an admin only', () => {
		expect(mark(false)).toContain('data-user-mark="end"');
		expect(mark(false)).not.toContain('data-admin-shield');
		expect(mark(true)).toContain('data-user-mark="admin"');
		expect(mark(true)).toContain('data-admin-shield');
	});

	it('keeps the badge readable at the smallest size the pages use', () => {
		expect(mark(true, 16)).toMatch(/data-admin-shield/);
		expect(mark(true, 16)).toContain('width: 9px');
	});

	it('draws a person of a diagram as the same mark, dashed when not declared, the shield for an admin', () => {
		const actor = (admin: boolean, dashed = false) => render(ActorMark, { props: { x: 100, y: 100, tone: 'stroke-ink-700', admin, dashed } }).body;
		expect(actor(false)).toContain('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2');
		expect(actor(false)).not.toContain('fill-evo-blue');
		expect(actor(true)).toContain('fill-evo-blue');
		expect(actor(false, true)).toContain('stroke-dasharray="3 2"');
		expect(actor(false)).not.toContain('<line');
	});
});
