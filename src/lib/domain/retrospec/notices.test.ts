import { describe, expect, it } from 'vitest';
import { LINE_MAX, type NoticeRun } from '../activity/notice';
import { retrospecActivity } from '../activity/retrospec-activity';
import { notificationsFor } from '../activity/activity';
import { applyRetrospecActs } from './acts';
import { emptyRetrospecDocument, type RetrospecDocument } from './document';
import { retrospecEvents } from './events';
import { CONNECTED_MS } from './presence';

/** What the notifications of a Reverse-Specification and of its validation say, in the brief's feed order (feat-ai-session, feat-feedback-docs). */

const carmen = { id: 'carmen@acme.io', name: 'Carmen Martin' };
const hugo = { id: 'hugo@acme.io', name: 'Hugo Bernard' };
const T0 = '2026-11-05T10:00:00.000Z';
const read = (runs: readonly NoticeRun[] | undefined) => (runs ?? []).map((r) => (r.strong ? `**${r.text}**` : r.text)).join('');

function acted(doc: RetrospecDocument, acts: Parameters<typeof applyRetrospecActs>[1], actor = carmen, now = T0): RetrospecDocument {
	const out = applyRetrospecActs(doc, acts, { actor, now });
	if (!out.ok) throw new Error(out.reason);
	return out.doc;
}
const started = (): RetrospecDocument => acted(emptyRetrospecDocument(), [{ op: 'start', mode: 'repo', baseline: {} }]);
const later = (d: RetrospecDocument): RetrospecDocument => ({
	...d,
	runs: d.runs.map((r) => ({ ...r, complementary: { fromRunId: null, fromCommit: null, scope: 'delta' as const } }))
});
const input = { projectId: 'tsk', productName: 'Taskora', auditEntries: [] as { performedAt: string; actor: string }[] };
const names = [
	...['Tasks', 'Projects', 'Permissions', 'Reminders', 'Export'].map((name) => ({ name, core: true })),
	...Array.from({ length: 26 }, (_, i) => ({ name: `Feature ${i + 1}`, core: false }))
];
const taskora = { cores: 5, features: 26, rules: 247, users: 11, names };

describe('a finished Reverse-Specification is announced to the project as Lyriks work [criterion:f04182b8]', () => {
	const finished = (d: RetrospecDocument, figures?: typeof taskora | { cores: number; features: number; rules: number; users: number }) =>
		retrospecEvents(d, { ...input, auditEntries: [{ performedAt: '2026-11-05T11:00:00.000Z', actor: carmen.id }], figures }).find((e) => e.kind === 'analysis_finished');

	it('says the specification is ready, what Lyriks found with the figures in bold, at INFO under REVERSE-SPECIFICATION', () => {
		const e = finished(started(), taskora);
		expect(e).toMatchObject({
			team: true,
			href: '/projects/tsk/spec',
			notice: { section: 'Reverse-Specification', level: 'info', title: 'The specification is ready to review.', action: { label: 'Review the Specification 360°', icon: 'go' } }
		});
		expect(read(e?.notice?.body)).toBe('Lyriks went through the whole product and rebuilt its specification: **26 features**, five of them at the core, **247 rules** and **11 users**.');
		expect(e?.notice?.line).toBe('26 features, 247 rules and 11 users uncovered.');
	});

	it('pictures the features found, the core ones first and set apart, a count of the others, then the figures', () => {
		const visual = finished(started(), taskora)?.notice?.visual;
		expect(visual?.kind).toBe('chips');
		if (visual?.kind !== 'chips') return;
		expect(visual.chips.slice(0, 6)).toEqual([
			{ label: 'Tasks', strong: true },
			{ label: 'Projects', strong: true },
			{ label: 'Permissions', strong: true },
			{ label: 'Reminders', strong: true },
			{ label: 'Export', strong: true },
			{ label: 'Feature 1' }
		]);
		expect(visual.chips).toHaveLength(8);
		expect(visual.more).toBe(23);
		expect(visual.figures).toEqual([
			{ n: '26', label: 'features' },
			{ n: '247', label: 'rules' },
			{ n: '11', label: 'users' }
		]);
	});

	it('leaves out a figure the specification does not hold, with its words', () => {
		expect(read(finished(started(), { cores: 0, features: 3, rules: 0, users: 2 })?.notice?.body)).toBe(
			'Lyriks went through the whole product and rebuilt its specification: **3 features** and **2 users**.'
		);
		expect(read(finished(started())?.notice?.body)).toBe('Lyriks went through the whole product and rebuilt its specification.');
		expect(finished(started())?.notice?.visual).toBeUndefined();
	});

	it('says a later run that read what changed brought the specification up to date', () => {
		expect(read(finished(later(started()), taskora)?.notice?.body)).toMatch(/^Lyriks read what changed in the product and brought its specification up to date\. It now holds \*\*26 features\*\*/);
	});

	it('names last the person who closed the analysis before the final check', () => {
		const closed = acted(started(), [{ op: 'end_analysis' }], carmen, '2026-11-05T10:40:00.000Z');
		const e = retrospecEvents(closed, input).find((x) => x.kind === 'analysis_finished');
		expect(e?.notice?.title).toBe('The specification is ready to review.');
		expect(read(e?.notice?.body)).toBe("The analysis was closed before Lyriks's final check: what was read is ready to review. **Carmen Martin** closed it.");
	});
});

describe('everyone on the project hears that a Reverse-Specification started [criterion:3fccc273]', () => {
	it('says what Lyriks does, then who launched it, follows its progress and lights the step it is on', () => {
		const e = retrospecEvents(started(), { ...input, underWay: { pct: 18, seenAt: T0, now: Date.parse(T0) + 60_000, phase: 'features' } }).find((x) => x.kind === 'run_started');
		expect(e).toMatchObject({ team: true, notice: { section: 'Reverse-Specification', level: 'info', title: 'The Reverse-Specification has started.', progress: 18, action: { label: 'Follow the progress', icon: 'go' } } });
		expect(read(e?.notice?.body)).toBe("Lyriks is now reading the product. You'll be notified when the full specification is ready. **Carmen Martin** launched the process.");
		expect(e?.notice?.line).toBe('Carmen Martin launched the analysis of Taskora.');
		expect(e?.notice?.visual).toEqual({
			kind: 'steps',
			steps: [
				{ label: 'Reading', sub: 'The code', state: 'done' },
				{ label: 'Mapping', sub: 'Features', state: 'now' },
				{ label: 'Writing', sub: 'Rules', state: 'todo' },
				{ label: 'Ready', sub: 'To review', state: 'todo' }
			]
		});
	});

	it('shows no bar and lights the first step once it is no longer under way', () => {
		const e = retrospecEvents(started(), input).find((x) => x.kind === 'run_started');
		expect(e?.notice?.progress).toBeUndefined();
		expect(e?.notice?.visual?.kind === 'steps' && e.notice.visual.steps.map((s) => s.state)).toEqual(['now', 'todo', 'todo', 'todo']);
	});

	it('says the specification is being updated when a later run reads what changed, with the date of the analysis it updates', () => {
		const first = acted(started(), [{ op: 'end_analysis' }], carmen, '2026-10-28T09:00:00.000Z');
		const doc: RetrospecDocument = later({ ...first, runs: [first.runs[0], { ...first.runs[0], id: 'run-2', startedAt: '2026-11-05T09:00:00.000Z', analysisEndedAt: null, analysisEndedBy: null }] });
		const e = retrospecEvents(doc, input).find((x) => x.kind === 'run_started' && x.at === '2026-11-05T09:00:00.000Z');
		expect(e?.notice?.title).toBe('The specification is being updated.');
		expect(read(e?.notice?.body)).toBe(
			"Lyriks is reading what changed in the product since the last analysis on Oct 28 and is bringing the specification up to date. You'll be notified when it is ready. **Carmen Martin** launched the update."
		);
		expect(e?.notice?.visual?.kind === 'steps' && e.notice.visual.steps.map((s) => `${s.label}:${s.sub}:${s.state}`)).toEqual(['Last analysis:Oct 28:done', 'Update:In progress:now', 'Changes:To review:todo']);
	});
});

describe('a Reverse-Specification whose LLM went silent tells the person who started it that it stopped [criterion:fcd8a267]', () => {
	const seenAt = '2026-11-05T10:20:00.000Z';
	const silent = { pct: 62, seenAt, now: Date.parse(seenAt) + CONNECTED_MS + 60_000 };

	it('says it stopped at its share, after what it wrote, at DRIFT, with a gauge of what is kept', () => {
		const e = retrospecEvents(started(), { ...input, underWay: silent, figures: { cores: 3, features: 14, rules: 131, users: 4 } }).find((x) => x.kind === 'analysis_stopped');
		expect(e).toMatchObject({
			toEmail: carmen.id,
			at: new Date(Date.parse(seenAt) + CONNECTED_MS).toISOString(),
			href: '/projects/tsk/retrospec',
			notice: { section: 'Reverse-Specification', level: 'drift', title: 'The Reverse-Specification stopped unexpectedly.', action: { label: 'Relaunch the analysis', icon: 'relaunch' } }
		});
		expect(read(e?.notice?.body)).toBe(
			'The AI went silent and interrupted Lyriks at **62%**, after **14 features** and **131 rules**. What was analyzed is kept: relaunch the process to finish the specification.'
		);
		expect(e?.notice?.line).toBe('Stopped at 62% on Taskora.');
		expect(e?.notice?.visual).toEqual({ kind: 'gauge', pct: 62, status: 'Stopped · AI silent', kept: '14 features · 131 rules kept' });
	});

	it('is gone while the LLM still calls, and a later run names its share alone', () => {
		const calling = { ...silent, now: Date.parse(seenAt) + 30_000 };
		expect(retrospecEvents(started(), { ...input, underWay: calling }).some((x) => x.kind === 'analysis_stopped')).toBe(false);
		expect(retrospecEvents(started(), input).some((x) => x.kind === 'analysis_stopped')).toBe(false);
		const e = retrospecEvents(later(started()), { ...input, underWay: silent, figures: taskora }).find((x) => x.kind === 'analysis_stopped');
		expect(read(e?.notice?.body)).toBe('The AI went silent and interrupted Lyriks at **62%**. What was analyzed is kept: relaunch the process to finish the specification.');
	});
});

describe('the validation of the specification tells when it is complete, when an element is rejected and when a review waits [criterion:4fce1259]', () => {
	const inReview = () => acted(acted(started(), [{ op: 'end_analysis' }], carmen, '2026-11-05T10:40:00.000Z'), [{ op: 'start_review', total: 10 }], carmen, '2026-11-05T10:41:00.000Z');

	it('tells the person who leads the validation that an element was rejected, quoting what the rejecter said on it', () => {
		const rejected = acted(inReview(), [{ op: 'reject', itemId: 'feat-permissions', title: 'Permissions', tab: 'spec360' }], hugo, '2026-11-05T11:00:00.000Z');
		const withReason: RetrospecDocument = { ...rejected, comments: { 'feat-permissions': [{ id: 'c1', by: hugo, at: '2026-11-05T11:00:30.000Z', text: 'Admins can’t delete tasks in archived projects.', resolved: false }] } };
		const e = retrospecEvents(withReason, input).find((x) => x.kind === 'item_rejected');
		expect(e).toMatchObject({ toEmails: [carmen.id], notice: { section: 'Specification', level: 'drift', title: 'A validation was rejected.', action: { label: 'See the reason' } } });
		expect(read(e?.notice?.body)).toBe('**“Permissions”** was rejected: it needs another look before it can be validated. **Hugo Bernard** rejected it.');
		expect(e?.notice?.visual).toEqual({ kind: 'people', rows: [{ person: hugo, sub: 'Permissions', badge: 'Rejected' }], quote: 'Admins can’t delete tasks in archived projects.' });
		const activity = retrospecActivity('tsk', [e!]);
		expect(notificationsFor(activity, carmen.id)).toHaveLength(1);
		expect(notificationsFor(activity, hugo.id)).toHaveLength(0);
	});

	it('never tells the lead of their own rejection', () => {
		const own = acted(inReview(), [{ op: 'reject', itemId: 'feat-export', title: 'Export', tab: 'spec360' }], carmen, '2026-11-05T11:00:00.000Z');
		expect(retrospecEvents(own, input).find((x) => x.kind === 'item_rejected')?.toEmails).toEqual([]);
	});

	it('tells a reminded validator their review is still pending, with them waiting and the person who reminded them', () => {
		const reminded = acted(inReview(), [{ op: 'remind', itemId: 'feat-export', title: 'Export', to: hugo }], carmen, '2026-11-05T12:00:00.000Z');
		const e = retrospecEvents(reminded, input).find((x) => x.kind === 'reminder');
		expect(e?.notice).toMatchObject({ section: 'Specification', level: 'action', title: 'Your review is still pending.', action: { label: 'Start reviewing' } });
		expect(read(e?.notice?.body)).toBe('**“Export”** waits for your validation in the Specification 360°. **Carmen Martin** reminded you.');
		expect(e?.notice?.visual?.kind === 'people' && e.notice.visual.rows.map((r) => r.badge)).toEqual(['Waiting', 'Asked']);
	});

	it('certifies the specification fully validated, stamped with the people who validated it', () => {
		const validated = acted(inReview(), [{ op: 'validate', itemId: 'feat-export', title: 'Export', tab: 'spec360' }], hugo, '2026-11-05T12:00:00.000Z');
		const published = acted(validated, [{ op: 'publish', baselineId: 'b1', notify: [hugo] }], carmen, '2026-11-05T13:00:00.000Z');
		const e = retrospecEvents(published, { ...input, figures: taskora }).find((x) => x.kind === 'published');
		expect(e?.notice).toMatchObject({ section: 'Specification', level: 'certified', title: 'The specification is fully validated.', action: { label: 'Open the specification' } });
		expect(read(e?.notice?.body)).toBe('Every element of the specification is validated: it is now the reference for future evolutions. **Carmen Martin** validated it.');
		expect(e?.notice?.visual).toEqual({ kind: 'stamp', word: 'Validated', line: 'Validated by 1 person · 26 features', people: [hugo] });
	});
});

describe('every line a Reverse-Specification toast reads holds in 80 characters [criterion:31f7e46d]', () => {
	it('cuts a long product name on a word', () => {
		const long = { ...input, productName: 'The extraordinarily long-named enterprise resource planning suite of Taskora Industries' };
		const e = retrospecEvents(started(), long).find((x) => x.kind === 'run_started');
		expect(e?.notice?.line.length).toBeLessThanOrEqual(LINE_MAX);
		expect(e?.notice?.line.endsWith('…')).toBe(true);
	});
});
