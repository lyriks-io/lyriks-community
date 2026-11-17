import { describe, expect, it } from 'vitest';
import { pageKey } from './page-key';

describe('pageKey', () => {
	it('keeps the Specification 360° frame from one of its pages to another', () => {
		expect(pageKey('/projects/p/spec/features/a')).toBe(pageKey('/projects/p/spec/features/b'));
		expect(pageKey('/projects/p/spec/users')).toBe(pageKey('/projects/p/spec'));
		expect(pageKey('/projects/p/spec/tech/data-map')).toBe('/projects/p/spec');
	});

	it('mounts a new page when leaving the Specification 360° or changing project', () => {
		expect(pageKey('/projects/p/retrospec')).not.toBe(pageKey('/projects/p/spec'));
		expect(pageKey('/projects/q/spec')).not.toBe(pageKey('/projects/p/spec'));
		expect(pageKey('/projects/p/specification')).toBe('/projects/p/specification');
	});

	it('mounts every other page on its own address', () => {
		expect(pageKey('/projects/p/evolution')).toBe('/projects/p/evolution');
		expect(pageKey('/')).toBe('/');
	});
});
