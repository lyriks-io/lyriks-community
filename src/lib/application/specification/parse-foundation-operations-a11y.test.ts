import { describe, expect, it } from 'vitest';
import { parseOperationsDraft } from './parse-foundation-operations';

describe('parseOperationsDraft, accessibility standards', () => {
	it('keeps the standards picked from the list', () => {
		const draft = parseOperationsDraft({ quality: { a11yStandards: ['WCAG 2.2 AA', 'RGAA 4.1', ''] } }, 'p1');
		expect(draft.quality.a11yStandards).toEqual(['WCAG 2.2 AA', 'RGAA 4.1']);
	});

	it('reads a draft from before, with one free-text level, back as the standards it names', () => {
		const draft = parseOperationsDraft({ quality: { a11yLevel: 'WCAG 2.2 AA, Keyboard-only navigation' } }, 'p1');
		expect(draft.quality.a11yStandards).toEqual(['WCAG 2.2 AA', 'Keyboard-only navigation']);
	});

	it('holds no standard when nothing was answered', () => {
		expect(parseOperationsDraft({}, 'p1').quality.a11yStandards).toEqual([]);
	});
});
