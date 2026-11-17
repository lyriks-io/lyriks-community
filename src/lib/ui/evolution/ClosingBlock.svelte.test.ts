import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import ClosingBlock from './ClosingBlock.svelte';
import DecisionLog from './DecisionLog.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const closing = (over: Record<string, unknown> = {}) => ({
	key: 'EVO-3',
	message: '✅ EVO-3 · Notes is closed in Lyriks.\nFull report: http://x/r',
	changes: [
		{ sign: '+', kind: 'Feature', label: 'Note to the baker', count: 1, noun: 'feature' },
		{ sign: '~', kind: 'Rule', label: 'A note is short', count: 1, noun: 'rule' }
	],
	compliance: { complying: 4, total: 4, cycles: 1 },
	version: { from: 'v1.0', to: 'v1.1' },
	ticketKey: 'FAC-242',
	ticketPost: null,
	specHref: '/projects/p/spec',
	...over
});
const block = (over: Record<string, unknown> = {}, canEdit = true) =>
	render(ClosingBlock, { props: { closing: closing(over), canEdit, actorId: 'ana@team.test', members: [{ id: 'ana@team.test', name: 'Ana' }], onDecisionLog: () => {} } as never }).body;

describe('the closing block', () => {
	it('shows the message to post, never claiming it was posted, and the version the spec moved to', () => {
		const html = block();
		expect(html).toContain('MESSAGE FOR THE TICKET · FAC-242');
		expect(html).not.toContain('POSTED TO');
		expect(html).toContain('To post on the ticket.');
		expect(html).toContain('KNOWLEDGE · v1.0 → v1.1');
		expect(html).toContain('Note to the baker');
		expect(html).toContain('Open Knowledge');
	});

	it('says it was posted once the AI reported it, by whom and on which tool', () => {
		const html = block({ ticketPost: { at: new Date().toISOString(), by: 'ana@team.test', byKind: 'ai_client', ticketKey: 'FAC-242', tool: 'Jira', commented: true, movedToDone: true, note: '' } });
		expect(html).toContain('POSTED TO JIRA · FAC-242');
		expect(html).toContain('Ticket moved to Done · comment posted by Lyriks · just now');
	});

	it('says why it was not posted, and reads without a version when the spec was never validated', () => {
		const html = block({ version: null, ticketKey: null, ticketPost: { at: new Date().toISOString(), by: 'bob@team.test', byKind: 'ai_client', ticketKey: 'FAC-1', tool: 'Jira', commented: false, movedToDone: false, note: 'No Jira connector' } });
		expect(html).toContain('Not posted on FAC-1: No Jira connector');
		expect(html).toContain('No version: the specification was never validated');
		expect(html).not.toContain('→');
	});
});

describe('the decision log', () => {
	const props = { title: 'EVO-3 · Notes', members: [{ id: 'ana@team.test', name: 'Ana', jobs: ['Product Owner'] }], onOpen: () => {}, onClose: () => {} };

	it('floats its count at the foot of the page while closed', () => {
		expect(render(DecisionLog, { props: { ...props, entries: [], open: false } }).body).toContain('Decision log · 0');
	});

	it('lists each decision with its step, what, why and who, and says when there is none yet', () => {
		const entries = [{ id: 'briefing', at: '2026-10-01T09:00:00.000Z', kind: 'briefing' as const, what: 'Briefing validated', why: 'Objectives: fewer calls', who: [{ id: 'ana@team.test', throughAi: true }] }];
		const html = render(DecisionLog, { props: { ...props, entries, open: true } }).body;
		expect(html).toContain('DECISION LOG');
		expect(html).toContain('Every decision, who took it and why. Nothing is lost between two meetings.');
		expect(html).toContain('BRIEFING');
		expect(html).toContain('Objectives: fewer calls');
		expect(html).toContain('Ana · Product Owner');
		expect(html).toContain('Through their AI client');
		expect(render(DecisionLog, { props: { ...props, entries: [], open: true } }).body).toContain('No decision yet.');
	});
});
