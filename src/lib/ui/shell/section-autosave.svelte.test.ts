import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SectionAutosave } from './section-autosave.svelte';
import type { Session, ToastNotifierPort } from '$application/ports';
import { REVISION_HEADER } from '$lib/shared/draft-revision';

interface TestDraft {
	projectId: string;
	value: string;
	lastSavedAt: string | null;
}

const session: Session = { isAuthenticated: true } as Session;

function makeController(overrides: { revision?: number } = {}) {
	const notify = vi.fn();
	const notifier: ToastNotifierPort = { notify } as unknown as ToastNotifierPort;
	let draft: TestDraft = { projectId: 'p1', value: 'a', lastSavedAt: null };
	const applied: TestDraft[] = [];
	const controller = new SectionAutosave<TestDraft>({
		endpoint: '/api/draft/test',
		session,
		notifier,
		getDraft: () => draft,
		applyRemote: (incoming) => {
			draft = incoming;
			applied.push(incoming);
		},
		onSaved: (savedAt) => (draft.lastSavedAt = savedAt),
		revision: overrides.revision ?? 3
	});
	return { controller, notify, applied, draft: () => draft, setDraft: (d: TestDraft) => (draft = d) };
}

function okResponse(revision: number) {
	return new Response(JSON.stringify({ savedAt: '2026-07-17T00:00:00Z', revision }), {
		status: 200
	});
}

describe('SectionAutosave', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('debounces touch and PUTs with the revision header, then adopts the new revision', async () => {
		const fetchMock = fetch as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue(okResponse(4));
		const { controller, draft } = makeController();

		controller.touch();
		expect(controller.status).toBe('saving');
		expect(fetchMock).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(700);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/api/draft/test');
		expect((init.headers as Record<string, string>)[REVISION_HEADER]).toBe('3');
		expect(controller.status).toBe('saved');
		expect(draft().lastSavedAt).toBe('2026-07-17T00:00:00Z');

		// The next save must present the server-issued revision.
		controller.touch();
		await vi.advanceTimersByTimeAsync(700);
		const [, second] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect((second.headers as Record<string, string>)[REVISION_HEADER]).toBe('4');
	});

	it('refuses to touch on an unauthenticated session', () => {
		const notify = vi.fn();
		const controller = new SectionAutosave<TestDraft>({
			endpoint: '/api/draft/test',
			session: { isAuthenticated: false } as Session,
			notifier: { notify } as unknown as ToastNotifierPort,
			getDraft: () => ({ projectId: 'p1', value: 'a', lastSavedAt: null }),
			applyRemote: () => {}
		});
		expect(() => controller.touch()).toThrow(/unauthenticated/);
	});

	it('keeps the old revision after a failed save so the retry is not a false conflict', async () => {
		const fetchMock = fetch as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		fetchMock.mockResolvedValueOnce(okResponse(4));
		const { controller } = makeController();

		await controller.flushNow();
		expect(controller.status).toBe('error');
		expect(controller.lastError).toContain('500');

		await controller.flushNow();
		const [, retry] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect((retry.headers as Record<string, string>)[REVISION_HEADER]).toBe('3');
		expect(controller.status).toBe('saved');
	});

	it('preserves the local draft on a 409 instead of reloading over it', async () => {
		const fetchMock = fetch as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue(new Response('conflict', { status: 409 }));
		const { controller, notify, draft } = makeController();
		draft().value = 'unsaved local value';

		await controller.flushNow();
		expect(controller.status).toBe('error');
		expect(controller.lastError).toBe('conflict');
		expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('changed elsewhere'));
		expect(draft().value).toBe('unsaved local value');
	});

	it('serializes in-flight saves and drains edits with the new revision', async () => {
		const fetchMock = fetch as ReturnType<typeof vi.fn>;
		let releaseFirst!: (response: Response) => void;
		fetchMock
			.mockReturnValueOnce(new Promise<Response>((resolve) => (releaseFirst = resolve)))
			.mockResolvedValueOnce(okResponse(5));
		const { controller, draft } = makeController();

		draft().value = 'first';
		controller.touch();
		await vi.advanceTimersByTimeAsync(700);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		draft().value = 'second';
		controller.touch();
		await vi.advanceTimersByTimeAsync(700);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		releaseFirst(okResponse(4));
		await vi.runAllTimersAsync();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		const [, second] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect((second.headers as Record<string, string>)[REVISION_HEADER]).toBe('4');
		expect(JSON.parse(second.body as string).value).toBe('second');
		expect(controller.status).toBe('saved');
	});

	it('applies a hydration immediately when not saving, and ignores the identical object', () => {
		const { controller, applied } = makeController();
		const incoming: TestDraft = { projectId: 'p1', value: 'remote', lastSavedAt: null };
		controller.hydrate(incoming, 5);
		expect(applied).toEqual([incoming]);
		controller.hydrate(incoming, 5); // same reference → echo, ignored
		expect(applied).toHaveLength(1);
	});

	it('parks a hydration arriving mid-save and applies it after the save iff it is newer', async () => {
		const fetchMock = fetch as ReturnType<typeof vi.fn>;
		let release!: (r: Response) => void;
		fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));
		const { controller, applied } = makeController();

		const flush = controller.flushNow(); // in flight, status 'saving'... after fetch starts
		const newer: TestDraft = { projectId: 'p1', value: 'remote-newer', lastSavedAt: null };
		controller.hydrate(newer, 9); // our save will settle at revision 4 → 9 is newer
		expect(applied).toHaveLength(0); // parked, not dropped-on-the-floor applied

		release(okResponse(4));
		await flush;
		expect(applied).toEqual([newer]); // reconciled after settle

		// And the adopted revision is the remote one: the next save presents 9.
		fetchMock.mockResolvedValue(okResponse(10));
		await controller.flushNow();
		const [, next] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
		expect((next.headers as Record<string, string>)[REVISION_HEADER]).toBe('9');
	});

	it('drops a parked hydration that our own save superseded', async () => {
		const fetchMock = fetch as ReturnType<typeof vi.fn>;
		let release!: (r: Response) => void;
		fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));
		const { controller, applied } = makeController();

		const flush = controller.flushNow();
		const stale: TestDraft = { projectId: 'p1', value: 'remote-stale', lastSavedAt: null };
		controller.hydrate(stale, 3); // pre-save snapshot; our save settles at 4

		release(okResponse(4));
		await flush;
		expect(applied).toHaveLength(0); // superseded → dropped
		expect(controller.status).toBe('saved');
	});

	it('adopts a custom mutation result and its revision', async () => {
		const fetchMock = fetch as ReturnType<typeof vi.fn>;
		fetchMock.mockResolvedValue(okResponse(10));
		const { controller, draft, applied } = makeController();
		const captured: TestDraft = {
			projectId: 'p1',
			value: 'captured',
			lastSavedAt: '2026-07-17T00:00:00Z'
		};

		controller.adoptSaved(captured, 9);
		expect(applied).toEqual([captured]);
		expect(draft().value).toBe('captured');
		await controller.flushNow();
		const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect((request.headers as Record<string, string>)[REVISION_HEADER]).toBe('9');
	});
});
