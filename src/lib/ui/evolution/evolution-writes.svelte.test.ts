import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateAll } from '$app/navigation';
import { pushToast } from '$ui/design-system';
import { EvolutionWrites } from './evolution-writes.svelte';
import { patchKey, type Patches } from './dossier-overlay';

/**
 * Every act a request page sends goes through EvolutionWrites (ac-evo-form-edit-optimistic): its outcome reads at
 * once, its operations save through /api/evolution, a refusal takes it off the page with what was not saved and
 * why. The server is stubbed at fetch; the optimistic layer is the real one.
 */

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));

const answer: Patches = { [patchKey.text('need.problem')]: { kind: 'text', value: 'Refunds take a week.' } };
const operation = { op: 'set_answer', requestId: 'r1', path: 'need.problem', value: 'Refunds take a week.' };
let request = { revision: 1 };

beforeEach(() => {
	request = { revision: 1 };
	vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('an act of a request page [criterion:ac-leaf-ac-evo-form-edit-optimistic]', () => {
	it('reads at once, saves its operations for the project, and leaves the page once the request is read again', async () => {
		let reply!: (r: Response) => void;
		const send = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>((resolve) => (reply = resolve)));
		vi.stubGlobal('fetch', send);
		const writes = new EvolutionWrites('p', () => request);
		const saving = writes.send(answer, [operation], 'the problem');
		expect(writes.patches).toEqual(answer);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		expect(send.mock.calls[0][0]).toBe('/api/evolution');
		expect(JSON.parse(String(send.mock.calls[0][1].body))).toEqual({ projectId: 'p', operations: [operation] });
		reply(Response.json({ ok: true, results: [{ ok: true, summary: 'Saved' }] }));
		await vi.waitFor(() => expect(invalidateAll).toHaveBeenCalledTimes(1));
		// Saved, not read back yet: the answer stays on the page.
		expect(writes.patches).toEqual(answer);
		request = { revision: 2 };
		expect(await saving).toBe(true);
		expect(writes.patches).toEqual({});
	});

	it('takes a refused act off the page at once, saying what was not saved and why', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, results: [{ ok: false, summary: 'The request is frozen.', detail: 'Reopen it first.' }] }, { status: 422 })));
		const writes = new EvolutionWrites('p', () => request);
		expect(await writes.send(answer, [operation], 'the problem')).toBe(false);
		expect(writes.patches).toEqual({});
		expect(pushToast).toHaveBeenCalledWith({ level: 'error', message: 'The problem was not saved: The request is frozen. Reopen it first.' });
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	it('reads the request again after a conflict, so the page shows what someone else saved', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, message: 'Someone changed it.' }, { status: 409 })));
		const writes = new EvolutionWrites('p', () => request);
		expect(await writes.send(answer, [operation], 'the problem')).toBe(false);
		expect(invalidateAll).toHaveBeenCalledTimes(1);
		expect(pushToast).toHaveBeenCalledWith({ level: 'error', message: 'The problem was not saved: Someone changed it.' });
	});
});
