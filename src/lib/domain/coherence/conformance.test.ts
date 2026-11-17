import { describe, expect, it } from 'vitest';
import { CONFORMANCE_MEANS, conformanceOf, provenShare, type ConformanceRow } from './conformance';

/**
 * Proven against code (feat-control-center, "Measure what is proven against the
 * code"). Field case: a retro-spec bench read audit 100, coherence 77 and 264
 * green scenarios while four rules contradicted the code. Its index located
 * every entry and carried no verifiedAt stamp, so this reading says 0 %.
 */

const located = (provenAt?: string) => ({
	elements: [
		{ kind: 'action', location: { file: 'app/views.py', line: 12 } },
		{ kind: 'rule', location: null }
	],
	...(provenAt ? { provenAt } : {})
});
const unlocated = { elements: [{ kind: 'action', location: null }, { kind: 'rule', location: { file: 'a.py', line: 1 } }] };

describe('the share of located actions a passing run proved', () => {
	it('is the plain rounded share in between', () => {
		expect(provenShare(3, 4)).toBe(75);
		expect(provenShare(1, 3)).toBe(33);
	});

	it('earns 0 % and 100 %: one proven action is never 0 %, one unproven never 100 %', () => {
		expect(provenShare(0, 300)).toBe(0);
		expect(provenShare(1, 300)).toBe(1);
		expect(provenShare(199, 200)).toBe(99);
		expect(provenShare(5, 5)).toBe(100);
	});

	it('has no share of nothing', () => {
		expect(provenShare(0, 0)).toBeNull();
	});
});

describe('Proven against code over a project', () => {
	it('reads 0 % on a model that agrees with itself and was never run against the code', () => {
		const rows: ConformanceRow[] = [
			{ found: 300, actions: { a1: located(), a2: located() }, criteria: { total: 12, verified: 0, failing: 0 } },
			{ found: 162, actions: { a3: located() }, criteria: { total: 9, verified: 0, failing: 0 } }
		];
		const c = conformanceOf(rows);
		expect(c.reading).toBe('measured');
		expect(c.linked).toBe(true);
		expect(c.percent).toBe(0);
		expect(c.label).toBe('0% proven');
		expect(c.actions).toEqual({ proven: 0, located: 3 });
		expect(c.criteria).toEqual({ total: 21, verified: 0, failing: 0 });
		expect(c.entriesLocated).toBe(462);
		expect(c.detail).toBe('0 of 3 located actions proven · 0 of 21 criteria verified');
	});

	it('counts proven actions over LOCATED actions only, failing criteria apart', () => {
		const c = conformanceOf([
			{
				found: 30,
				actions: { a1: located('2026-11-01T10:00:00Z'), a2: located('2026-11-01T10:00:00Z'), a3: located('2026-11-01T10:00:00Z'), a4: located(), a5: unlocated },
				criteria: { total: 5, verified: 3, failing: 1 }
			}
		]);
		expect(c.actions).toEqual({ proven: 3, located: 4 });
		expect(c.percent).toBe(75);
		expect(c.label).toBe('75% proven');
		expect(c.detail).toBe('3 of 4 located actions proven · 3 of 5 criteria verified · 1 failing');
	});

	it('says No code linked, with no percentage, when nothing is located', () => {
		for (const rows of [[], [{ found: 0, actions: { a1: unlocated } }]] as ConformanceRow[][]) {
			const c = conformanceOf(rows);
			expect(c.reading).toBe('no_code_linked');
			expect(c.linked).toBe(false);
			expect(c.percent).toBeNull();
			expect(c.label).toBe('No code linked');
		}
	});

	it('says No action located when entries are located but not one action', () => {
		const c = conformanceOf([{ found: 12, actions: { a1: unlocated } }]);
		expect(c.reading).toBe('no_action_located');
		expect(c.linked).toBe(true);
		expect(c.percent).toBeNull();
		expect(c.label).toBe('No action located');
	});

	it('leaves criteria out, never zero, when the engine does not report them', () => {
		const c = conformanceOf([{ found: 4, actions: { a1: located('2026-11-01T10:00:00Z') } }]);
		expect(c.criteria).toBeNull();
		expect(c.percent).toBe(100);
		expect(c.detail).toBe('1 of 1 located action proven');
	});

	it('hands out the sentence the tooltip shows', () => {
		expect(conformanceOf([]).means).toBe(CONFORMANCE_MEANS);
		expect(CONFORMANCE_MEANS).toBe(
			'Share of modeled behavior proven by a passing run against the code; coherence and audit only prove the model is consistent.'
		);
	});
});
