import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRetrospecActs, emptyRetrospecDocument, type SpecElement } from '$domain/retrospec';
import { emptyDiscussions } from '$domain/discussions';
import { SpecValidation } from './validation.svelte';
import { SpecDiscussions } from './discussions.svelte';
import { sendChangeRequest } from './change-request';

/**
 * The cross of the four acts requests a change (criterion a4ef7658): the element is rejected and a discussion opens
 * on it saying what should change. Run on the real validation and the real discussions of the page, over a server
 * that answers each request as the test says.
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}), goto: vi.fn() }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const anchor = 'rule:f1:r1';
const elements: SpecElement[] = [{ id: anchor, title: 'Refuse to save', owner: 'product' }];

function page() {
	const started = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'outside', title: 'outside', tab: 'spec360' }], { actor: ana, now: '2026-11-18T02:00:00.000Z' });
	if (!started.ok) throw new Error(started.reason);
	const validation = new SpecValidation(() => ({ projectId: 'p', me: ana, canWrite: true, doc: started.doc, elements, team: [{ person: ana, jobIds: ['product'] }], baselines: [] }));
	const discussions = new SpecDiscussions('p', { email: ana.id, name: ana.name }, [], { document: emptyDiscussions(), revision: 1 });
	return { validation, discussions };
}
/** The server: the validation answers as asked, the discussion stays on its way so the page shows what it sent. */
function server(validation: Response) {
	const sent: { url: string; body: unknown }[] = [];
	vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
		sent.push({ url, body: JSON.parse(String(init.body)) });
		return url.endsWith('/spec/validation') ? validation : new Promise<Response>(() => {});
	}));
	return sent;
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('the cross requests a change [criterion:a4ef7658]', () => {
	it('rejects the element and opens a discussion saying what should change, the box keeping what was typed', async () => {
		const { validation, discussions } = page();
		const sent = server(Response.json({ ok: true }));
		discussions.drafts[anchor] = 'half a thought';
		expect(await sendChangeRequest(validation, discussions, anchor, 'Refuse to save', 'The admin may save too')).toBe(true);
		expect(sent.find((s) => s.url.endsWith('/spec/validation'))?.body).toEqual({ acts: [{ op: 'reject', itemId: anchor }] });
		const [thread] = discussions.threads(anchor);
		expect(thread.messages.map((m) => m.text)).toEqual(['Change requested: The admin may save too']);
		expect(discussions.drafts[anchor]).toBe('half a thought');
	});

	it('answers that the request was not saved when the server refuses the rejection', async () => {
		const { validation, discussions } = page();
		server(Response.json({ message: 'Permissions changed.' }, { status: 403 }));
		expect(await sendChangeRequest(validation, discussions, anchor, 'Refuse to save', 'The admin may save too')).toBe(false);
	});
});
