import { describe, expect, it } from 'vitest';
import { sidePlace } from './side-nav';

describe('the project navigation lights the page on screen [criterion:b2f17eef]', () => {
	it('reads the entry of every page of a project', () => {
		expect(sidePlace('/projects/kutt/spec')).toEqual({ entry: 'knowledge', tab: 'overview', item: null });
		expect(sidePlace('/projects/kutt/spec/')).toEqual({ entry: 'knowledge', tab: 'overview', item: null });
		expect(sidePlace('/projects/kutt/spec/tech/operations')).toEqual({ entry: 'knowledge', tab: 'tech', item: 'operations' });
		expect(sidePlace('/projects/kutt/spec/glossary').tab).toBe('glossary');
		expect(sidePlace('/projects/kutt/spec/noticed')).toEqual({ entry: 'noticed', tab: null, item: null });
		expect(sidePlace('/projects/kutt/retrospec').entry).toBe('retro');
		expect(sidePlace('/projects/kutt/evolution').entry).toBe('evolutions');
		expect(sidePlace('/projects/kutt/drift').entry).toBe('drift');
	});

	it('names the item a page shows: a core feature, a feature (its action pages too), a profile', () => {
		expect(sidePlace('/projects/kutt/spec/features/f%201')).toEqual({ entry: 'knowledge', tab: 'features', item: 'f 1' });
		expect(sidePlace('/projects/kutt/spec/features/f1/a9')).toEqual({ entry: 'knowledge', tab: 'features', item: 'f1' });
		expect(sidePlace('/projects/kutt/spec/users/u1')).toEqual({ entry: 'knowledge', tab: 'users', item: 'u1' });
		expect(sidePlace('/projects/kutt/spec/users/matrix')).toEqual({ entry: 'knowledge', tab: 'users', item: null });
	});

	it('lights nothing outside a project or on a page it has no entry for', () => {
		expect(sidePlace('/').entry).toBeNull();
		expect(sidePlace('/settings').entry).toBeNull();
		expect(sidePlace('/projects/kutt').entry).toBeNull();
		expect(sidePlace('/projects/kutt/foundation').entry).toBeNull();
	});
});

describe('Knowledge stays lit on every page of the specification, each chapter on its tab [criterion:8e942b12]', () => {
	it('underlines a chapter on its page and on every page under it', () => {
		const tab = (path: string) => sidePlace(`/projects/kutt/spec${path}`).tab;
		expect(['/features', '/features/c1', '/features/f3/a9'].map(tab)).toEqual(['features', 'features', 'features']);
		expect(['/users', '/users/u1', '/users/matrix'].map(tab)).toEqual(['users', 'users', 'users']);
		expect(['/experience', '/tech/data-map', '/tech/sources'].map(tab)).toEqual(['experience', 'tech', 'tech']);
	});

	it('keeps Knowledge lit on a page of the specification no tab names, and underlines no tab there', () => {
		expect(sidePlace('/projects/kutt/spec/discussions')).toEqual({ entry: 'knowledge', tab: null, item: null });
	});
});
