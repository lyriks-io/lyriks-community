import { describe, expect, it } from 'vitest';
import type { RetrospecEvent } from '$domain/retrospec';
import { notificationsFor } from './activity';
import { retrospecActivity } from './retrospec-activity';

const r = (over: Partial<RetrospecEvent>): RetrospecEvent => ({ kind: 'item_validated', authorEmail: 'carmen@x.io', authorName: 'Carmen Roux', at: '2026-10-26T10:00:00.000Z', text: 'validated “Invoicing”', href: '/projects/fac/retrospec?step=validation&item=f1', ...over });

describe('retrospec activity', () => {
	it('tells a person their AI finished the analysis, the one operator of an install without accounts included', () => {
		const text = 'Lyriks rebuilt the specification of Facturo: 3 features. See the result in the Specification 360°.';
		const events = retrospecActivity('fac', [r({ kind: 'analysis_finished', authorName: undefined, authorEmail: 'local', text, team: true })]);
		expect(notificationsFor(events, 'local-operator')).toEqual([
			expect.objectContaining({ kind: 'ai_done', line: 'finished the Reverse-Specification', text, where: 'Reverse-Specification' })
		]);
	});

	it('tells the person an item was shared with, and feeds the validations to the others', () => {
		const events = retrospecActivity('fac', [r({}), r({ kind: 'item_shared', text: 'shared “VAT rounding” with Dylan', toEmail: 'dylan@x.io', at: '2026-10-26T11:00:00.000Z' })]);
		const [shared] = notificationsFor(events, 'dylan@x.io');
		expect(shared.kind).toBe('shared');
		expect(events.map((e) => e.line)).toEqual(['validated “Invoicing”', 'shared “VAT rounding” with Dylan']);
	});
});

describe('the Specification 360° in the bell', () => {
	const base = { authorEmail: 'carmen@x.io', authorName: 'Carmen R.', at: '2026-10-26T12:00:00.000Z' };

	it('tells a reminded validator, from the person who reminded them, and nobody else', () => {
		const events = retrospecActivity('fac', [r({ ...base, kind: 'reminder', toEmail: 'sarah@x.io', toName: 'Sarah K.', text: 'Your validation of “Branding” is awaited in the Specification 360°.', href: '/projects/fac/spec/experience#kbt-branding' })]);
		expect(notificationsFor(events, 'sarah@x.io')).toEqual([expect.objectContaining({ kind: 'reminder', where: 'Specification 360°', href: '/projects/fac/spec/experience#kbt-branding' })]);
		expect(notificationsFor(events, 'dylan@x.io')).toEqual([]);
	});

	it('tells everyone on the project the analysis is ready, the person whose AI ran it included [criterion:f04182b8]', () => {
		const events = retrospecActivity('fac', [r({ kind: 'analysis_finished', authorName: undefined, authorEmail: 'carmen@x.io', team: true, text: 'ready', href: '/projects/fac/spec' })]);
		for (const me of ['carmen@x.io', 'sarah@x.io']) expect(notificationsFor(events, me)).toHaveLength(1);
	});

	it('tells the others a run started, never the person who started it [criterion:3fccc273]', () => {
		const events = retrospecActivity('fac', [r({ kind: 'run_started', team: true, text: 'started the Reverse-Specification of Facturo', href: '/projects/fac/retrospec' })]);
		expect(notificationsFor(events, 'sarah@x.io')).toEqual([expect.objectContaining({ kind: 'created', team: true })]);
		expect(notificationsFor(events, 'carmen@x.io')).toEqual([]);
	});

	it('tells the person who started a run that its LLM went silent, in the name of Lyriks, and nobody else [criterion:fcd8a267]', () => {
		const events = retrospecActivity('fac', [r({ kind: 'analysis_stopped', authorEmail: undefined, authorName: undefined, toEmail: 'carmen@x.io', text: 'stopped', href: '/projects/fac/retrospec' })]);
		expect(notificationsFor(events, 'carmen@x.io')).toEqual([expect.objectContaining({ actor: { id: 'lyriks', kind: 'lyriks' }, kind: 'info' })]);
		expect(notificationsFor(events, 'sarah@x.io')).toEqual([]);
	});

	it('tells the team the specification is validated, never the person who validated it', () => {
		const events = retrospecActivity('fac', [r({ ...base, kind: 'published', toEmails: ['sarah@x.io'], text: 'validated the Specification 360° of Facturo', href: '/projects/fac/evolution' })]);
		expect(notificationsFor(events, 'sarah@x.io')).toEqual([expect.objectContaining({ text: 'The Specification 360° is validated. You can now create evolutions.' })]);
		expect(notificationsFor(events, 'carmen@x.io')).toEqual([]);
	});
});
