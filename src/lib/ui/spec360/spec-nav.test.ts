import { describe, expect, it } from 'vitest';
import { chapterOf, chapterPath, corePath, specPathOf } from './spec-nav';

describe('the Specification 360° navigation', () => {
	it('reads the page path and its chapter from the URL', () => {
		expect(specPathOf('/projects/p1/spec', 'p1')).toBe('');
		expect(specPathOf('/projects/p1/spec/features/f1/', 'p1')).toBe('features/f1');
		expect(chapterOf('features/f1')).toBe('features');
		expect(chapterOf('tech/operations')).toBe('tech');
		expect(chapterOf('')).toBe('home');
	});

	it('opens Features on the list of the core features, each core feature read on its own page before its features [criterion:64fa19d5]', () => {
		expect(chapterPath('features')).toBe('features');
		expect(corePath('c1')).toBe('features/c1');
		expect(chapterOf('features/c1')).toBe('features');
		// A user's page (criterion 4146848b) sits in its chapter.
		expect(chapterOf('users/role-guest')).toBe('users');
	});

	it('addresses an action on its own page, under its feature [criterion:7d1e80b6]', () => {
		expect(chapterOf('features/f1/a2')).toBe('features');
	});
});
