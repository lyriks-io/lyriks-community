import { describe, expect, it } from 'vitest';
import type { ElementStanding, SpecElement } from '$domain/retrospec';
import { navChecks } from './nav-checks';

const element = (id: string): SpecElement => ({ id, title: id, owner: 'product' });
const standing = (state: ElementStanding['state']) => ({ state, required: [], validated: [], waitingOn: [] }) as unknown as ElementStanding;
const read = (states: Record<string, ElementStanding['state']>) =>
	navChecks(
		Object.keys(states).map(element),
		Object.fromEntries(Object.entries(states).map(([id, s]) => [id, standing(s)]))
	).sort();

describe('the navigation checks the entries a draft validated [criterion:8e942b12]', () => {
	it('checks an entry once every element it shows is validated, and none of a part still waiting', () => {
		const checks = read({
			product: 'ok',
			problem: 'ok',
			target: 'waiting',
			'feature:f1': 'ok',
			'action:f1:a1': 'ok',
			'rule:f1:r1': 'ok',
			'flow:f1': 'ok',
			'feature:f2': 'ok',
			'action:f2:a1': 'todo',
			'core:c1': 'ok'
		});
		expect(checks).toContain('feature:f1');
		expect(checks).toContain('core:c1');
		expect(checks).not.toContain('overview');
		expect(checks).not.toContain('feature:f2');
		expect(checks).not.toContain('features');
	});

	it('checks a fold once everything under it is, the product rules with Features and the permissions with Users', () => {
		const checks = read({ 'core:c1': 'ok', 'feature:f1': 'ok', 'rule:project:p1': 'ok', 'role:admin': 'ok', permissions: 'todo' });
		expect(checks).toContain('features');
		expect(checks).toContain('role:admin');
		expect(checks).not.toContain('users');
	});

	it('places every part of Experience and of Tech and data on its own entry', () => {
		const checks = read({
			branding: 'ok',
			'component:btn': 'ok',
			'journey:j1': 'waiting',
			datamap: 'ok',
			'data:retention': 'ok',
			'stack:pg': 'ok',
			'health:backup': 'todo',
			'requirements:runtime': 'ok',
			'constraint:c1': 'ok',
			'term:t1': 'ok'
		});
		expect(checks).toEqual(['experience:design', 'glossary', 'tech:architecture', 'tech:data-map', 'tech:requirements']);
	});

	it('checks nothing that shows no element', () => {
		expect(read({})).toEqual([]);
	});
});
