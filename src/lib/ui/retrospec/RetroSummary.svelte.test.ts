import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { Finding } from '$domain/retrospec';
import { FINAL_CHECK_KIND } from '$domain/retrospec';
import RetroSummary from './RetroSummary.svelte';

/** What the summary of the Reverse page says of Project health and the points still to review. */

const finding = (id: string, over: Partial<Finding> = {}): Finding => ({
	id,
	tone: 'major',
	text: `Point ${id}`,
	where: FINAL_CHECK_KIND.label,
	kind: FINAL_CHECK_KIND,
	sheet: { kicker: 'K', title: `Point ${id}`, sections: [] },
	...over
});

const body = (findings: Finding[]) =>
	render(RetroSummary, {
		props: {
			findings,
			validated: true,
			onFinding: () => {},
			onOpenSpec: () => {},
			health: { score: 10, verdict: 'critical', blocking: 2, total: 12, codeLinked: true }
		}
	}).body;

describe('the Reverse page reads the same Project health and the same points as the Overview and Health [criterion:1b4a3935]', () => {
	it('names the measure on its chip with its score and its word, in the words of the Overview', () => {
		const page = body([finding('a')]);
		expect(page).toMatch(/Project health 10\/100 · Critical/);
		expect(page).toContain('How sound the spec is: complete, coherent, proven against the code.');
		expect(page).toContain('Now: 12 points wait, 2 of them blocking.');
	});

	it('counts the points it is given, the final check first, then the other points, and says they stay in Health', () => {
		const page = body([finding('a', { unconfirmed: true }), finding('b'), finding('c', { tone: 'minor' })]);
		expect(page).toMatch(/What Lyriks noticed · 3/);
		expect(page).toMatch(/Could not be confirmed · 1/);
		expect(page).toMatch(/Other points · 2/);
		expect(page).toContain('Each point stays in Health until someone settles it.');
		expect(page).not.toContain('Read from the code');
	});
});
