import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { HistoryLine } from '$domain/retrospec';
import MismatchHistory from './MismatchHistory.svelte';

const line = (over: Partial<HistoryLine> = {}): HistoryLine => ({ at: '2026-11-10T09:30:00.000Z', who: 'Ann', through: null, what: 'validated “Sign in”', note: null, ...over });
const body = (lines: readonly HistoryLine[]) => render(MismatchHistory, { props: { lines } }).body;
const count = (page: string) => page.split('data-history-line').length - 1;

describe('every action on Mismatch stays in a history only administrators read [criterion:64d191d6]', () => {
	it('gives the time in UTC, who acted and what', () => {
		const page = body([line()]);
		expect(page).toContain('2026-11-10 09:30 UTC');
		expect(page).toContain('Ann');
		expect(page).toContain('validated “Sign in”');
		expect(page).toContain('Only administrators see it.');
	});

	it('reads what the AI did through whose AI, and what must change', () => {
		const page = body([line({ who: 'Lyriks', through: 'Ann', what: 'reworked “Sign in”', note: 'With a key' })]);
		expect(page).toContain('through Ann');
		expect(page).toContain('With a key');
	});

	it('shows the first 25 lines, then offers the others', () => {
		const lines = Array.from({ length: 30 }, () => line());
		const page = body(lines);
		expect(count(page)).toBe(25);
		expect(page).toContain('Show all 30');
		expect(body(lines.slice(0, 25))).not.toContain('Show all');
	});

	it('says when nothing was done yet', () => {
		expect(body([])).toContain('No action recorded yet.');
	});
});
