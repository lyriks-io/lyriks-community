import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { Finding } from '$domain/retrospec';
import { PRICING_URL } from '$domain/licensing';
import { noticedView, type NoticedPoint } from '$application/spec360/noticed';
import { dismissAllToasts, toasts } from '$ui/design-system/toast.svelte';
import type { SpecEdits } from '../edits.svelte';

const scene = vi.hoisted(() => ({ page: { data: { onlineHelp: true } as Record<string, unknown> }, sent: [] as unknown[] }));
vi.mock('$app/state', () => ({ page: scene.page }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn(async () => {}) }));

const { FindingDecisions } = await import('./finding-decisions.svelte');
const { POST } = await import('../../../../routes/api/evolution/+server');

type Event = Parameters<typeof POST>[0];

/** The page's fetch, answered by the real Evolution route of an installation of that edition, a refusal sent as SvelteKit sends one (JSON). */
function installation(edition: string) {
	return async (url: string, init: RequestInit): Promise<Response> => {
		scene.sent.push(JSON.parse(String(init.body)));
		const event = { locals: { services: { installEdition: () => edition } }, cookies: { get: () => undefined }, request: new Request(new URL(url, 'http://platform'), init) } as unknown as Event;
		try {
			return await POST(event);
		} catch (e) {
			if (!isHttpError(e)) throw e;
			return new Response(JSON.stringify(e.body), { status: e.status, headers: { 'content-type': 'application/json' } });
		}
	};
}

const finding = (id: string): Finding => ({
	id: `point:${id}`,
	tone: 'minor',
	text: `Permissions not checked against the rules ${id}`,
	where: 'Permissions',
	kind: { label: 'Permissions not checked', meaning: 'A permission no rule reads' },
	sheet: { kicker: '', title: `Permissions not checked against the rules ${id}`, sections: [] },
	gapIds: [id]
});
const pointsOf = (ids: string[]): readonly NoticedPoint[] => noticedView({ open: ids.map(finding), kept: [], requests: [], projectId: 'todomatic' }).points;

const OFFER = 'Evolutions are available from the Solo Builder plan. Upgrade to open this evolution and keep building.';

beforeEach(() => {
	scene.sent = [];
	scene.page.data = { onlineHelp: true };
	dismissAllToasts();
});
afterEach(() => vi.unstubAllGlobals());

describe('New change on Community reads as the offer of Evolutions (EVO-006, feat 123)', () => {
	it('opens nothing on a point and shows the toast of the offer with View plans [criterion:ac-leaf-abf964ef-8922-4890-80c6-22921807af7e]', async () => {
		vi.stubGlobal('fetch', installation('community'));
		const decisions = new FindingDecisions('todomatic', {} as SpecEdits);
		const [point] = pointsOf(['g1']);
		await decisions.evolve(point);
		expect(scene.sent).toEqual([{ projectId: 'todomatic', operations: [expect.objectContaining({ op: 'open_request', findingIds: ['g1'] })] }]);
		expect(toasts()).toHaveLength(1);
		const [toast] = toasts();
		expect(toast.message).toBe(OFFER);
		// Nothing in front of the offer, and never the server's answer.
		expect(toast.message).not.toContain('The evolution was not opened.');
		expect(toast.action?.label).toBe('View plans');
		// Nothing opened: the point is back as it stood.
		expect(decisions.stateOf(point)).toBe('pending');
	});

	it('opens nothing on the points picked and shows the same offer [criterion:ac-leaf-abf964ef-8922-4890-80c6-22921807af7e]', async () => {
		vi.stubGlobal('fetch', installation('community'));
		const decisions = new FindingDecisions('todomatic', {} as SpecEdits);
		const points = pointsOf(['g1', 'g2']);
		decisions.pickAll(points);
		await decisions.evolveMany(points);
		expect(toasts().map((t) => [t.message, t.action?.label])).toEqual([[OFFER, 'View plans']]);
		expect(points.map((p) => decisions.stateOf(p))).toEqual(['pending', 'pending']);
	});

	it('opens lyriks.io/pricing in a new tab from View plans [criterion:ac-leaf-abf964ef-8922-4890-80c6-22921807af7e]', async () => {
		const open = vi.fn();
		vi.stubGlobal('fetch', installation('community'));
		vi.stubGlobal('window', { open });
		await new FindingDecisions('todomatic', {} as SpecEdits).evolve(pointsOf(['g1'])[0]);
		toasts()[0].action?.run();
		expect(open).toHaveBeenCalledWith(PRICING_URL, '_blank', 'noopener,noreferrer');
	});

	it('writes the address as text where the installation allows no link out', async () => {
		scene.page.data = { onlineHelp: false };
		vi.stubGlobal('fetch', installation('community'));
		await new FindingDecisions('todomatic', {} as SpecEdits).evolve(pointsOf(['g1'])[0]);
		expect(toasts().map((t) => [t.message, t.action])).toEqual([[`${OFFER} The plans: lyriks.io/pricing`, undefined]]);
	});

	it('says The evolution was not opened. alone when the answer cannot be read', async () => {
		vi.stubGlobal('fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
		await new FindingDecisions('todomatic', {} as SpecEdits).evolve(pointsOf(['g1'])[0]);
		expect(toasts().map((t) => [t.level, t.message])).toEqual([['error', 'The evolution was not opened.']]);
	});
});
