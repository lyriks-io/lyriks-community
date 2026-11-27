import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { ClockPort, FoundationIdentityRepositoryPort, PortfolioRepositoryPort } from '$application/ports';
import { CheckProjectCreationUseCase } from '$application/portfolio/project-creation-scope';
import { CreateProjectUseCase } from '$application/portfolio/create-project';
import { PRICING_URL } from '$domain/licensing';
import { POST } from '../../../routes/api/projects/+server';
import { offerToast, PROJECT_NOT_CREATED, readRefusal, refusalIn, refusalToast } from './offer-refusal';

type Event = Parameters<typeof POST>[0];

const clock: ClockPort = { nowIso: () => '2026-11-20T00:00:00.000Z' };
const portfolio = { listDomains: async () => [], saveDomain: async () => {}, setMeta: async () => {} } as unknown as PortfolioRepositoryPort;
const drafts = { save: async () => {} } as unknown as FoundationIdentityRepositoryPort;

/**
 * What the project list receives when it adds a project to a Community
 * installation holding TodoMatic: the real route and the real creation behind
 * it, its refusal sent the way SvelteKit sends one to a fetch (JSON).
 */
async function addSecondProject(edition = 'community', granted = 1): Promise<Response> {
	const scope = new CheckProjectCreationUseCase(() => edition, () => granted, { list: async () => [{ id: 'todomatic', name: 'TodoMatic', description: '', industry: '', lastSavedAt: null }] });
	const services = { createProject: new CreateProjectUseCase(drafts, clock, portfolio, undefined, () => 'abc123', undefined, scope), audit: { record: () => {} } };
	const event = {
		locals: { services, authRequired: false, session: null },
		cookies: { get: () => undefined },
		request: new Request('http://platform/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Test' }) })
	} as unknown as Event;
	try {
		return await POST(event);
	} catch (e) {
		if (!isHttpError(e)) throw e;
		return new Response(JSON.stringify(e.body), { status: e.status, headers: { 'content-type': 'application/json' } });
	}
}

afterEach(() => vi.unstubAllGlobals());

/** What the project list and New Project show when the server refuses a project. */
const createdOrRefused = (res: Response, online: boolean) => refusalToast(res, PROJECT_NOT_CREATED, online);

describe('adding a second project on Community reads as an offer with View plans (EVO-006, feat 42)', () => {
	it('shows the toast More active projects are available from the Solo Builder plan. Upgrade to keep building. with View plans, never the raw answer [criterion:ac-leaf-aa128fda-4b78-45a3-93b4-e717fd5cc096]', async () => {
		const res = await addSecondProject();
		expect(res.status).toBe(403);
		const toast = await createdOrRefused(res, true);
		expect(toast.message).toBe('More active projects are available from the Solo Builder plan. Upgrade to keep building.');
		// The symptom: the server's JSON answer read as the toast.
		expect(toast.message).not.toContain('{');
		expect(toast.message).not.toContain('"message"');
		expect(toast.action?.label).toBe('View plans');
	});

	it('opens lyriks.io/pricing in a new tab from View plans, the page staying as it was [criterion:ac-leaf-aa128fda-4b78-45a3-93b4-e717fd5cc096]', async () => {
		const open = vi.fn();
		vi.stubGlobal('window', { open });
		const toast = await createdOrRefused(await addSecondProject(), true);
		toast.action?.run();
		expect(open).toHaveBeenCalledWith(PRICING_URL, '_blank', 'noopener,noreferrer');
		expect(PRICING_URL).toBe('https://lyriks.io/pricing');
	});

	it('writes the address as text where the installation allows no link out', async () => {
		const toast = await createdOrRefused(await addSecondProject(), false);
		expect(toast).toEqual({
			level: 'info',
			message: 'More active projects are available from the Solo Builder plan. Upgrade to keep building. The plans: lyriks.io/pricing'
		});
	});

	it('says The project was not created. alone when the answer cannot be read, and the server sentence of any other refusal', async () => {
		expect(await createdOrRefused(new Response('<html><body>Bad gateway</body></html>', { status: 502 }), true)).toEqual({ level: 'error', message: 'The project was not created.' });
		expect(await createdOrRefused(new Response('', { status: 500 }), true)).toEqual({ level: 'error', message: 'The project was not created.' });
		const viewer = new Response(JSON.stringify({ message: 'Only an owner, admin or designer of the workspace can create a project.' }), { status: 403 });
		expect(await createdOrRefused(viewer, true)).toEqual({ level: 'error', message: 'Only an owner, admin or designer of the workspace can create a project.' });
	});
});

describe('a refusal is read at the edge', () => {
	it('keeps a plan only when it names one, and a sentence only when there is one', async () => {
		expect(refusalIn({ message: ' Refused. ', plan: 'nobody' })).toEqual({ message: 'Refused.', plan: null });
		expect(refusalIn({ refusal: 'First.', message: 'Second.', plan: 'team' })).toEqual({ message: 'First.', plan: 'team' });
		expect(refusalIn('text')).toEqual({ message: null, plan: null });
		expect(await readRefusal(new Response('not json', { status: 400 }))).toEqual({ message: null, plan: null });
	});

	it('offers View plans on any offer where links out are allowed', () => {
		expect(offerToast('Offer.', true)).toMatchObject({ level: 'info', message: 'Offer.', action: { label: 'View plans' } });
	});
});

// EVO-016: an Enterprise key that grants N projects refuses the N+1st with its sentence, as a toast, without a plan to buy.
describe('adding a project beyond the number an Enterprise key grants [criterion:ac-leaf-ff8aad5f-23ae-48f8-b999-9ad426ac53b4]', () => {
	it('is refused by the server and shown as a toast saying the licence holds N active projects', async () => {
		const res = await addSecondProject('enterprise', 1);
		expect(res.status).toBe(403);
		expect(await createdOrRefused(res, true)).toEqual({
			level: 'error',
			message: "This installation's licence holds 1 active project. Ask for a key with more projects to keep building."
		});
	});
});

