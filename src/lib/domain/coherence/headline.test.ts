import { describe, expect, it } from 'vitest';
import { coherenceHeadline, verdictFor } from './headline';
import type { Gap, GapProvenance } from './draft';
import type { GapSeverity } from './enums';

/**
 * One headline, two readers.
 *
 * Field case behind these tests: a completion audit reported "ready, 100" while
 * the Control Center, on the same project at the same moment, printed COHERENCE
 * 59 next to the word "Critical". Both numbers were real and neither was the
 * other's answer, but only one of them was reachable from outside the screen.
 * These tests hold the two readers to the same sentence.
 */
const gap = (
	id: string,
	severity: GapSeverity,
	provenance: GapProvenance,
	blocking = false
): Gap => ({
	id,
	severity,
	title: `finding ${id}`,
	detail: '',
	sourceStep: 'rules',
	blocking,
	provenance
});

describe('the word beside the number', () => {
	it('reads strong from the threshold the panel draws at', () => {
		expect(verdictFor(67, 0, 0)).toBe('strong');
		expect(verdictFor(66, 0, 0)).toBe('watch');
	});

	it('keeps "critical" for something blocking or severe, never for a long list', () => {
		expect(verdictFor(20, 0, 0)).toBe('watch');
		expect(verdictFor(20, 1, 0)).toBe('critical');
		expect(verdictFor(20, 0, 1)).toBe('critical');
	});

	it('never calls a healthy score critical, whatever the list holds', () => {
		expect(verdictFor(88, 4, 4)).toBe('strong');
	});
});

describe('the headline handed to a reader outside the screen', () => {
	it('carries the same number the panel prints', () => {
		const gaps = [
			...Array.from({ length: 9 }, (_, i) => gap(`d${i}`, 'low', 'declared')),
			gap('d9', 'medium', 'declared'),
			gap('d10', 'medium', 'declared'),
			gap('x1', 'low', 'detected'),
			gap('x2', 'medium', 'detected')
		];
		// The get.lyriks.io register, to the digit: what the screenshot showed.
		expect(coherenceHeadline(gaps).score).toBe(73);
	});

	it('never hands out a bare number: the word travels with it', () => {
		const headline = coherenceHeadline([gap('a', 'low', 'declared')]);
		expect(headline.verdict).toBe('strong');
		expect(headline.total).toBe(1);
	});

	it('counts what the panel says weighs most, not how long the list is', () => {
		const headline = coherenceHeadline([
			gap('a', 'high', 'detected', true),
			gap('b', 'low', 'declared'),
			gap('c', 'high', 'behavior')
		]);
		expect(headline.total).toBe(3);
		expect(headline.blocking).toBe(1);
		expect(headline.highSeverity).toBe(2);
	});

	it('names what to fix to move the number, heaviest first', () => {
		const headline = coherenceHeadline([
			gap('cheap', 'low', 'declared'),
			gap('worst', 'high', 'detected'),
			gap('middling', 'medium', 'detected')
		]);
		expect(headline.weighsMost.map((w) => w.id)).toEqual(['worst', 'middling', 'cheap']);
		expect(headline.weighsMost[0].costs).toBe(20);
		expect(headline.weighsMost[2].costs).toBe(1.6);
	});

	it('lists at most five, because a headline is not the register', () => {
		const gaps = Array.from({ length: 12 }, (_, i) => gap(`g${i}`, 'medium', 'detected'));
		expect(coherenceHeadline(gaps).weighsMost).toHaveLength(5);
	});

	it('reads an empty register as strong, and says nothing weighs', () => {
		const headline = coherenceHeadline([]);
		expect(headline).toMatchObject({
			score: 100,
			verdict: 'strong',
			total: 0,
			blocking: 0,
			highSeverity: 0
		});
		expect(headline.weighsMost).toEqual([]);
	});
});
