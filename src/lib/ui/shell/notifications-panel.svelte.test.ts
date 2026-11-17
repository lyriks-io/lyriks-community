import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { BellNotification } from '$lib/shared/app-chrome';
import NotificationsPanel from './NotificationsPanel.svelte';
import NotificationToasts from './NotificationToasts.svelte';
import { arrivals, notificationDay, notificationPlace } from './notification-view';
import { shell } from './shell-state.svelte';

/** A notification reads as one row of the panel, and a new one shows as a short toast (feat-feedback-docs). */

const at = new Date(Date.now() - 8 * 3_600_000).toISOString();
const ready: BellNotification = {
	id: 'tsk|retro:analysis_finished',
	kind: 'lyriks',
	where: 'Taskora · Reverse-Specification',
	at,
	level: 'info',
	title: 'The specification is ready to review.',
	body: [{ text: 'What it found: ' }, { text: '26 features', strong: true }, { text: '.' }],
	line: '26 features, 247 rules and 11 users uncovered.',
	visual: { kind: 'chips', chips: [{ label: 'Tasks', strong: true }, { label: 'Comments' }], more: 24, figures: [{ n: '26', label: 'features' }] },
	action: { label: 'Review the Specification 360°', icon: 'go' },
	dismiss: 'Got it',
	unread: true,
	initials: 'LY',
	color: '#111114',
	href: '/projects/tsk/spec'
};
const stopped: BellNotification = {
	...ready,
	id: 'tsk|retro:analysis_stopped',
	kind: 'alert',
	level: 'drift',
	at: new Date(Date.now() - 12 * 60_000).toISOString(),
	title: 'The Reverse-Specification stopped unexpectedly.',
	body: [{ text: 'at ' }, { text: '62%', strong: true }],
	action: { label: 'Relaunch the analysis', icon: 'relaunch' },
	visual: { kind: 'gauge', pct: 62, status: 'Stopped · AI silent', kept: '14 features kept' },
	dismiss: 'Later'
};

const page = (items: BellNotification[]) => {
	shell.toggle('notifications');
	return render(NotificationsPanel, { props: { items } }).body;
};

afterEach(() => shell.close());

describe('a notification reads as one row: its project and when, what happened, one line [criterion:65fdff0a]', () => {
	it('reads its project, how long ago, its sentence and its line, in that order', () => {
		const html = page([ready]);
		const order = ['<b>Taskora</b>', '8 h ago', 'The specification is ready to review.', '26 features, 247 rules and 11 users uncovered.'].map((s) => html.indexOf(s));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	it('leaves the level, the picture, the button and Got it to the card of Home', () => {
		const html = page([ready, stopped]);
		for (const gone of ['Drift', 'Relaunch the analysis', 'Got it', 'Later', 'data-kind=']) expect(html).not.toContain(gone);
	});

	it('groups the rows under the reader\'s day, and the tabs count what is unread', () => {
		// Noon of the day before, whatever the hour this runs at: "36 h ago" reads Earlier in the morning.
		const noonYesterday = new Date();
		noonYesterday.setDate(noonYesterday.getDate() - 1);
		noonYesterday.setHours(12, 0, 0, 0);
		const yesterday = { ...ready, id: 'tsk|y', at: noonYesterday.toISOString() };
		const html = page([stopped, yesterday]);
		expect(html.indexOf('>Today<')).toBeGreaterThan(-1);
		expect(html.indexOf('>Today<')).toBeLessThan(html.indexOf('>Yesterday<'));
		expect(html).toContain('Unread · 2');
	});

	it('splits the place and sets the day apart', () => {
		expect(notificationPlace('Taskora · Reverse-Specification')).toEqual({ project: 'Taskora', section: 'Reverse-Specification' });
		const now = Date.parse('2026-11-08T12:00:00Z');
		expect(notificationDay('2026-11-08T01:00:00Z', now, 'UTC')).toBe('Today');
		expect(notificationDay('2026-11-07T23:00:00Z', now, 'UTC')).toBe('Yesterday');
		expect(notificationDay('2026-11-05T23:00:00Z', now, 'UTC')).toBe('Earlier');
	});
});

describe('in All, a notification already read is told from an unread one [criterion:88ed514a]', () => {
	it('marks an unread row and says Unread to a screen reader, and fades a read one', () => {
		const html = page([ready]);
		expect(html).toMatch(/class="nr un/);
		expect(html).toContain('Unread:');
		const read = page([{ ...ready, unread: false }]);
		expect(read).not.toMatch(/class="nr un/);
	});
});

describe('a notification that arrives while the app is open shows for a few seconds as a short card [criterion:31f7e46d]', () => {
	const unread = (n: BellNotification) => n.unread;

	it('takes everything already listed as seen on the first reading, then tells only what arrived unread, newest first', () => {
		const first = arrivals(null, [ready], unread);
		expect(first.arrived).toEqual([]);
		const later = { ...stopped, id: 'tsk|later', at: new Date().toISOString() };
		const read = { ...stopped, id: 'tsk|read', unread: false };
		const next = arrivals(first.known, [ready, stopped, later, read], unread);
		expect(next.arrived.map((n) => n.id)).toEqual(['tsk|later', stopped.id]);
		expect(arrivals(next.known, [ready, stopped, later], unread).arrived).toEqual([]);
	});

	it('renders no toast for what the list held when the app opened', () => {
		const html = render(NotificationToasts, { props: { items: [ready, stopped] } }).body;
		expect(html).toContain('ntt-host');
		expect(html).not.toContain('ntt-card');
	});
});
