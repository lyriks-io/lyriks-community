import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ReportReading from './ReportReading.svelte';

const line = (id: string, verdict: string, decision: string, requirement: string, scope = 'request') => ({
	id,
	verdict,
	decision,
	scope,
	requirement,
	specStatement: '',
	codeStatement: verdict === 'missing' ? 'Nothing proves it yet.' : 'located',
	filePath: null,
	lineRange: null
});

const reading = (lines: ReturnType<typeof line>[]) =>
	render(ReportReading, {
		props: { report: { status: 'ready', lines } as never, specVersion: 1, canEdit: true, busy: false, highlighted: null, run: async () => null }
	}).body;

/** What waits on a person reads open; what is settled folds behind one count (ac-evo-impl-layout, ac-evo-impl-bar). */
describe('the Build report shows only what waits on a person [criterion:ac-leaf-ac-evo-impl-layout]', () => {
	const body = reading([
		line('a', 'non_conform', 'undecided', 'The slot counts its orders.'),
		line('b', 'non_conform', 'validated', 'The note is kept with the order.'),
		line('c', 'conform', 'undecided', 'The basket shows its total.'),
		line('f', 'conform', 'validated', 'The slot is shown with the order.'),
		line('d', 'missing', 'undecided', 'The refusal invites a call.'),
		line('e', 'conform', 'undecided', 'An older guarantee.', 'inherited')
	]);

	it('lists open the lines nobody decided yet, with their decision', () => {
		expect(body).toContain('The slot counts its orders.');
		expect(body).toContain('The refusal invites a call.');
		expect(body).toContain('Validate');
	});

	it('folds a line already decided with what the code proves, behind one count', () => {
		expect(body).not.toContain('The note is kept with the order.');
		expect(body).not.toContain('The basket shows its total.');
		// A conform line someone also validated is still proved by the code, never counted as a decision.
		expect(body).toContain('3 settled: 2 proved by the code, 1 decided');
	});

	it('counts the older points once, and never says "nothing located" beside a line still to build', () => {
		expect(body.match(/older point/g)).toHaveLength(1);
		expect(body).not.toContain('An older guarantee.');
		expect(body).not.toContain('Nothing proves it yet.');
	});

	it('counts the lines in the verdict it opens on, never in a second bar beside it [criterion:ac-leaf-ac-evo-impl-bar]', () => {
		expect(body).not.toContain('Lines this request brought');
		expect(body).toContain('2 non-conform');
	});
});
