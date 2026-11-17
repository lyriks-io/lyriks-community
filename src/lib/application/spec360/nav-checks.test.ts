import { describe, expect, it } from 'vitest';
import type { ElementStanding, SpecElement } from '$domain/retrospec';
import { navChecks, viewAnchors } from './nav-checks';

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

describe('the band counts what the page on screen shows [criterion:c509fa9c]', () => {
	const elements = [
		'product', 'core:c1', 'feature:f1', 'action:f1:a1', 'rule:f1:r1', 'rule:project:p1', 'role:admin', 'role:guest', 'permissions',
		'journey:j1', 'branding', 'datamap', 'data:retention', 'stack:pg', 'health:backup', 'requirements:runtime', 'constraint:c1', 'term:t1'
	].map(element);

	it('counts a whole tab on its own page', () => {
		expect(viewAnchors(elements, 'features', null)).toEqual(['core:c1', 'feature:f1', 'action:f1:a1', 'rule:f1:r1', 'rule:project:p1']);
		expect(viewAnchors(elements, 'users', null)).toEqual(['role:admin', 'role:guest', 'permissions']);
		expect(viewAnchors(elements, 'glossary', null)).toEqual(['term:t1']);
	});

	it('counts each view of Technology & data on its own elements, Sources on none', () => {
		expect(viewAnchors(elements, 'tech', 'data-map')).toEqual(['datamap', 'data:retention']);
		expect(viewAnchors(elements, 'tech', 'architecture')).toEqual(['stack:pg']);
		expect(viewAnchors(elements, 'tech', 'operations')).toEqual(['health:backup']);
		expect(viewAnchors(elements, 'tech', 'requirements')).toEqual(['requirements:runtime', 'constraint:c1']);
		expect(viewAnchors(elements, 'tech', 'sources')).toEqual([]);
	});

	it('counts one profile on itself and Who can do what on the permissions', () => {
		expect(viewAnchors(elements, 'users', 'guest')).toEqual(['role:guest']);
		expect(viewAnchors(elements, 'users', 'matrix')).toEqual(['permissions']);
	});
});
