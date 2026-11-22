import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvolutionWrites } from './evolution-writes.svelte';
import { SpecificationReadings, type SpecificationReading } from './specification-readings.svelte';
import { overlayActions, patchKey } from './dossier-overlay';
import { pendingSaves } from '$ui/shell/pending-saves.svelte';
import type { ActionReading } from '$lib/server/evolution-spec-actions.server';

/**
 * The actions of the Specification are read apart from the request (GET part=graph), and under load those
 * readings land late and out of order (lab 2026-11-19, EVO-002: the validations unchecked, then all checked
 * again, with nobody acting). The real write path and the real overlay run here; only the server is stubbed.
 */
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));

const KEY = 'element.action:a1@feature:feat-1';
const UNREAD = 'The engine did not answer, so the actions of the Specification cannot be read now.';
const graph = { nodes: [], counts: { existing: 0, added: 0, changed: 0, removed: 0, reached: 0 } };
const readingOf = (validatedBy: string[], extra: Partial<SpecificationReading<ActionReading>> = {}): SpecificationReading<ActionReading> => ({
	graph,
	actions: {
		[KEY]: { fingerprint: 'f', trail: { validation: validatedBy.length > 0 ? 'validated' : 'unvalidated', versionCount: 1, ...(validatedBy.length > 0 ? { validatedBy } : {}) }, thread: null } as ActionReading
	},
	readAt: '2026-11-20T00:30:00.000Z',
	version: 'drafts-1',
	...extra
});
const validate = { [patchKey.action(KEY)]: { kind: 'verdict' as const, verdict: { act: 'validate' as const } } };

/** Readings the test lands one by one, in the order it chooses. */
function server() {
	const pending: ((answer: SpecificationReading<ActionReading> | null) => void)[] = [];
	const readings = new SpecificationReadings<ActionReading>(() => new Promise((resolve) => pending.push(resolve)));
	return { readings, pending, begun: () => pending.length };
}

const saved = () => Response.json({ ok: true, results: [{ ok: true, op: 'validate_field', summary: 'Validated' }], revision: 12 });
const settle = () => new Promise((r) => setTimeout(r, 5));
const shownOf = (readings: SpecificationReadings<ActionReading>, writes: EvolutionWrites) => () => overlayActions(readings.actions, writes.patches, { actor: 'ana', needed: 1 })[KEY]?.trail.validation;

beforeEach(() => vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0)));
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('a validation the server accepted is never undone by an older reading [criterion:b33f1a03]', () => {
	it('holds the reading begun last, whatever order the readings land in', async () => {
		const { readings, pending } = server();
		const first = readings.load();
		const second = readings.load();
		pending[1](readingOf(['ana']));
		expect(await second).toBe(true);
		// The reading begun first lands last: it predates the other and is not held.
		pending[0](readingOf([]));
		expect(await first).toBe(true);
		expect(readings.actions[KEY].trail.validation).toBe('validated');
	});

	it('keeps a validated action checked when a reading begun before the save lands after it', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => saved()));
		const { readings, pending, begun } = server();
		const opened = readings.load();
		pending[0](readingOf([]));
		await opened;
		const writes = new EvolutionWrites('p', null);
		const shown = shownOf(readings, writes);
		// A live update had the page read the graph again just before the person validated.
		const early = readings.load();
		const sent = writes.send(validate, [{ op: 'validate_field' }], 'the action', () => readings.readAgain());
		expect(shown()).toBe('validated');
		await vi.waitFor(() => expect(begun()).toBe(3));
		// The early reading lands after the save: it does not know the validation, and it takes nothing off.
		pending[1](readingOf([]));
		await early;
		await settle();
		expect(writes.patches).toEqual(validate);
		expect(shown()).toBe('validated');
		// The reading begun after the save lands: the act leaves, the server's validation reads in its place.
		pending[2](readingOf(['ana']));
		expect(await sent).toBe(true);
		expect(writes.patches).toEqual({});
		expect(shown()).toBe('validated');
	});

	it('ends Saving at the server answer, and keeps the check as sent while the reading after the save takes longer than any delay [criterion:27bbfacd]', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
		vi.stubGlobal('fetch', vi.fn(async () => saved()));
		const { readings, pending, begun } = server();
		const first = readings.load();
		pending[0](readingOf([]));
		await first;
		const writes = new EvolutionWrites('p', null);
		const shown = shownOf(readings, writes);
		const sent = writes.send(validate, [{ op: 'validate_field' }], 'the action', () => readings.readAgain());
		expect(pendingSaves.waiting).toBe(1);
		await vi.advanceTimersByTimeAsync(30_000);
		// The server accepted: Saving is over, though the engine, busy with another session, has not answered the reading yet.
		expect(pendingSaves.waiting).toBe(0);
		expect(begun()).toBe(2);
		expect(shown()).toBe('validated');
		pending[1](readingOf(['ana']));
		expect(await sent).toBe(true);
		expect(shown()).toBe('validated');
	});

	it('takes a refused validation off at once, ends Saving and reads nothing again', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, results: [{ ok: false, op: 'validate_field', summary: 'The request is frozen.' }] }, { status: 422 })));
		const { readings, begun } = server();
		const writes = new EvolutionWrites('p', null);
		expect(await writes.send(validate, [{ op: 'validate_field' }], 'the action', () => readings.readAgain())).toBe(false);
		expect(writes.patches).toEqual({});
		expect(pendingSaves.waiting).toBe(0);
		expect(begun()).toBe(0);
	});

	it('keeps the act as sent when the readings after the save fail, until a later reading lands, never falling back to the older one', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => saved()));
		const { readings, pending, begun } = server();
		const opened = readings.load();
		pending[0](readingOf([]));
		await opened;
		const writes = new EvolutionWrites('p', null);
		const shown = shownOf(readings, writes);
		const sent = writes.send(validate, [{ op: 'validate_field' }], 'the action', () => readings.readAgain());
		for (let n = 2; n <= 3; n++) {
			await vi.waitFor(() => expect(begun()).toBe(n));
			pending[n - 1](null);
		}
		await settle();
		expect(writes.patches).toEqual(validate);
		expect(shown()).toBe('validated');
		// The next reading the page takes (the request moved, a live update) lands: the act leaves.
		const next = readings.load();
		pending[3](readingOf(['ana']));
		await next;
		expect(await sent).toBe(true);
		expect(writes.patches).toEqual({});
	});
});

describe('a reading the engine could not take keeps the last one and says so [criterion:c623df9c]', () => {
	it('shows the last good reading of the same drafts the server kept, saying when it was taken', async () => {
		const { readings, pending } = server();
		const loaded = readings.load();
		pending[0](readingOf(['ana'], { unread: UNREAD, readAt: '2026-11-20T00:12:00.000Z' }));
		await loaded;
		expect(readings.unread).toEqual({ reason: UNREAD, readAt: '2026-11-20T00:12:00.000Z' });
		expect(readings.actions[KEY].trail.validation).toBe('validated');
	});

	it('keeps its own last reading of the same drafts when the server has none, and clears once the engine answers', async () => {
		const { readings, pending } = server();
		const first = readings.load();
		pending[0](readingOf(['ana']));
		await first;
		const silent = readings.load();
		pending[1]({ graph: null, actions: {}, readAt: null, version: 'drafts-1', unread: UNREAD });
		await silent;
		expect(readings.graph).toBe(graph);
		expect(readings.unread).toEqual({ reason: UNREAD, readAt: '2026-11-20T00:30:00.000Z' });
		const back = readings.load();
		pending[2](readingOf(['ana']));
		await back;
		expect(readings.unread).toBeNull();
	});

	it('never shows a reading of older drafts while the engine does not answer', async () => {
		const { readings, pending } = server();
		const first = readings.load();
		pending[0](readingOf(['ana']));
		await first;
		const silent = readings.load();
		pending[1]({ graph: null, actions: {}, readAt: null, version: 'drafts-2', unread: UNREAD });
		await silent;
		expect(readings.graph).toBeNull();
		expect(readings.actions).toEqual({});
		expect(readings.unread).toEqual({ reason: UNREAD, readAt: null });
	});
});
