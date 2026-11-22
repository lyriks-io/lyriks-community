import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { placeKey } from '$domain/evolution';
import FinalReport from './FinalReport.svelte';

const address = vi.hoisted(() => ({ url: new URL('http://localhost/evolution') }));
vi.mock('$app/state', () => ({ page: { get url() { return address.url; }, data: { projectName: 'Bakery' } } }));

const line = (id: string, verdict: string, decision = 'undecided') => ({
	id,
	verdict,
	decision,
	scope: 'request',
	requirement: `Cart › rule "Requirement ${id}"`,
	specStatement: `Spec of ${id}`,
	codeStatement: verdict === 'missing' ? 'Nothing proves it yet.' : 'located',
	filePath: verdict === 'missing' ? '' : 'src/cart.js',
	lineRange: '',
	acceptanceTestPassing: verdict === 'conform',
	href: ''
});
const dossier = (over: Record<string, unknown> = {}) =>
	({
		id: 'req-1',
		key: 'EVO-9',
		title: 'Baskets',
		stage: 'implementation',
		status: 'open',
		specVersion: 1,
		iteration: 1,
		docking: { points: [] },
		gate: { next: 'acceptance', ok: false, reason: 'Lines of this report are still undecided.' },
		path: [{ step: 'approval', validation: { validated: false, given: [], expected: [], gone: [] } }],
		deployment: null,
		waiver: null,
		...over
	}) as never;
const report = (lines: ReturnType<typeof line>[], status = 'ready') => ({ status, lines }) as never;

/** Opens the page on one line of the report, as a link to it does. */
const linkTo = (id: string) => {
	address.url = new URL(`http://localhost/evolution?at=${placeKey({ kind: 'line', id })}`);
};
const page = (props: Record<string, unknown>) =>
	render(FinalReport, {
		props: { projectId: 'p', canEdit: true, highlighted: null, onDevelopment: () => {}, actorId: 'me', ...props } as never
	}).body;

describe('Verification reads like the design, on the real report', () => {
	it('waits for the impact analysis, then for the first sync, before it reads anything', () => {
		address.url = new URL('http://localhost/evolution');
		const waiting = page({ dossier: dossier({ stage: 'coherence', docking: { points: [{ qualification: 'friction', risk: null }] } }), report: null });
		expect(waiting).toContain('The verification will be ready at the end of implementation');
		expect(waiting).toContain('The impact analysis is still waiting for 1 decision(s).');
		expect(waiting).toContain('Go to Implementation');
		expect(page({ dossier: dossier(), report: report([line('a', 'missing')]) })).toContain('Implementation has not started yet. Launch it to see the verification.');
	});

	it('opens on the executive summary, its score counted on what the spec asks', () => {
		address.url = new URL('http://localhost/evolution');
		const body = page({ dossier: dossier(), report: report([line('a', 'conform'), line('b', 'missing'), line('c', 'non_conform', 'validated')]) });
		expect(body).toContain('Executive summary');
		expect(body).toContain('Implemented at 67 % · 1 open point(s)');
		expect(body).toContain('2 of 3 requirements are compliant.');
		expect(body).toContain('See the results in detail →');
		expect(body).not.toContain('LLM instructions');
	});

	it('opens on the line a link names, with the fix drafted for the LLM', () => {
		linkTo('b');
		const body = page({ dossier: dossier(), report: report([line('a', 'conform'), line('b', 'missing')]) });
		expect(body).toContain('6.2');
		expect(body).toContain('To be implemented by the LLM:');
		expect(body).toContain('1. [E2] Implement: Spec of b');
		expect(body).toContain('Do not modify what is compliant: E1.');
		expect(body).toContain('Implement now');
	});

	it('finishes the request: acceptance testing, its approval, then closing it', () => {
		linkTo('a');
		const lines = [line('a', 'conform')];
		// A settled Build moves on its own: nothing is offered (EVO-011, criterion 3cf58130).
		expect(page({ dossier: dossier({ gate: { next: 'acceptance', ok: true, reason: null } }), report: report(lines) })).not.toContain('Start acceptance testing →');
		expect(page({ dossier: dossier({ stage: 'acceptance', gate: { next: 'delivered', ok: false, reason: 'Approval still waits.' } }), report: report(lines, 'closed') })).toContain(
			'Walk the change in acceptance testing, then approve it.'
		);
		const delivered = page({
			dossier: dossier({ stage: 'delivered', gate: { next: null, ok: true, reason: null }, path: [{ step: 'approval', validation: { validated: true, given: ['me'], expected: [], gone: [] } }] }),
			report: report(lines, 'closed'),
			members: [{ id: 'me', name: 'Dana' }]
		});
		expect(delivered).toContain('The evolution complies with the spec');
		expect(delivered).toContain('1 cycle(s), approved by Dana.');
		expect(delivered).toContain('Close the evolution');
		const closed = page({ dossier: dossier({ stage: 'delivered', status: 'closed', gate: { next: null, ok: true, reason: null } }), report: report(lines, 'closed') });
		expect(closed).toContain('Evolution EVO-9 closed');
		expect(closed).toContain('Closed ✓');
	});
});
