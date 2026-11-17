import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { NO_SESSION_SENTENCE } from '$domain/evolution';
import type { ProposalRow } from '$lib/server/evolution-view.server';
import BlockControls from './BlockControls.svelte';
import SuggestionRows from './SuggestionRows.svelte';

/** The question the AI misses, asked in its suggestion with answers a click gives (ac-evo-live-card-ask). */
const proposal = {
	id: 'p1',
	targetField: '00-need.situation',
	leafId: null,
	value: 'Today the customer orders from the products of the day.',
	acceptable: { ok: true },
	ask: { question: 'Who asks for it?', choices: ['The customers', 'The baker'] },
	dialogue: []
} as unknown as ProposalRow;
const base = { projectId: 'p', requestId: 'r', kind: 'text' as const, canDecide: true };

describe('the question in the suggestion [criterion:ac-leaf-ac-evo-live-card-ask]', () => {
	it('shows the value, then the one thing missing, its answers and a box for one’s own words', () => {
		const { body } = render(SuggestionRows, { props: { ...base, proposal } });
		expect(body.indexOf('One thing is missing:')).toBeGreaterThan(body.indexOf('Today the customer orders'));
		expect(body).toContain('Who asks for it?');
		for (const choice of ['>The customers<', '>The baker<']) expect(body).toContain(choice);
		expect(body).toContain('Or in your own words…');
		expect(body).toContain('Send to your AI');
		// Off a request page there is no session: the answers say how to open one.
		expect(body).toContain(NO_SESSION_SENTENCE);
	});

	it('reads the answer once given, and keeps what was asked and answered under a rewritten value', () => {
		const answered = { ...proposal, ask: { ...proposal.ask!, answer: { body: 'The customers', by: 'ana', at: 'now' } } } as ProposalRow;
		const { body } = render(SuggestionRows, { props: { ...base, proposal: answered } });
		expect(body).toContain('You answered:');
		expect(body).not.toContain('Or in your own words…');
		const rewritten = { ...proposal, ask: null, dialogue: [{ question: 'Who asks for it?', answer: 'The customers', by: 'ana', at: 'now' }] } as ProposalRow;
		const after = render(SuggestionRows, { props: { ...base, proposal: rewritten } }).body;
		expect(after).toContain('Who asks for it?');
		expect(after).toContain('The customers');
		expect(after).not.toContain('One thing is missing:');
	});
});

describe('suggestions are decided where the section reads, never in its editor [criterion:ac-leaf-ac-evo-form-edit-suggestion]', () => {
	const edit = { on: false, toggle: () => {} };

	it('the pencil of a section where suggestions wait reads disabled, saying to accept or reject them first', () => {
		const { body } = render(BlockControls, { props: { edit: { ...edit, blocked: "Accept or reject your AI's suggestions first" } } });
		expect(body).toContain(`title="Accept or reject your AI's suggestions first"`);
		expect(body).toMatch(/<button[^>]*aria-pressed="false"[^>]*disabled/);
	});

	it('without a suggestion waiting the pencil opens the section, and an open editor can always be closed', () => {
		expect(render(BlockControls, { props: { edit } }).body).not.toMatch(/<button[^>]*aria-pressed="false"[^>]*disabled/);
		const open = render(BlockControls, { props: { edit: { on: true, toggle: () => {}, blocked: 'x' } } }).body;
		expect(open).toContain('Close editing');
		expect(open).not.toMatch(/<button[^>]*aria-pressed="true"[^>]*disabled/);
	});

	it('read mode shows the suggestion with Accept and Reject', () => {
		const { body } = render(SuggestionRows, { props: { ...base, proposal } });
		expect(body).toContain('Today the customer orders');
		for (const act of ['>Accept<', '>Reject<']) expect(body).toContain(act);
	});
});
