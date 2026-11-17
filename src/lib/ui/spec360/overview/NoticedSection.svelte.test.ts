import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { noticedView } from '$application/spec360/noticed';
import { createEvolutionRequest, type EvolutionRequest } from '$domain/evolution';
import type { Finding } from '$domain/retrospec';
import type { SpecEdits } from '../edits.svelte';
import { FindingDecisions } from './finding-decisions.svelte';
import NoticedSection from './NoticedSection.svelte';

const point = (id: string, label: string, tone: 'major' | 'minor' = 'minor'): Finding => ({
	id: `point:${id}`,
	tone,
	text: `Point ${id}`,
	where: label,
	kind: { label, meaning: `What a ${label} is` },
	sheet: { kicker: '', title: id, sections: [] },
	gapIds: [id]
});
const html = (open: Finding[], requests: EvolutionRequest[] = []) =>
	render(NoticedSection, {
		props: {
			view: noticedView({ open, kept: [], requests, projectId: 'p' }),
			decisions: new FindingDecisions('p', {} as SpecEdits),
			writable: true,
			onOpen: () => {}
		}
	}).body;

describe('What Lyriks noticed reads as one folded line per type [criterion:4996a6b4]', () => {
	it('folds every type into one line that names it, counts it and explains it on hover', () => {
		const deadEnds = Array.from({ length: 300 }, (_, i) => point(`d${i}`, 'Dead end'));
		const body = html([point('m1', 'Missing rule', 'major'), ...deadEnds]);
		expect(body.match(/aria-expanded="false"/g)).toHaveLength(2);
		expect(body).toContain('title="What a Missing rule is"');
		expect(body).toContain('title="What a Dead end is"');
		expect(body).toContain('300 points');
		// Folded: not one of the 301 points is drawn.
		expect(body).not.toContain('Point d0');
		expect(body).not.toContain('Point m1');
		expect(body.indexOf('Missing rule')).toBeLessThan(body.indexOf('Dead end'));
	});

	it('opens a list of one type at once, its first ten points, the rest one click away', () => {
		const body = html(Array.from({ length: 14 }, (_, i) => point(`d${i}`, 'Dead end')));
		expect(body).toContain('aria-expanded="true"');
		expect(body).toContain('Point d9');
		expect(body).not.toContain('Point d10');
		expect(body).toContain('Show the 4 other points');
		// The type its line already names is not repeated on each point.
		expect(body).not.toContain('· Dead end');
	});
});

describe('a point sent to Evolutions names the request that carries it [criterion:d204c2f2]', () => {
	it('reads Sent to EVO-nnn on every point one request carries, and says on hover how many others it carries', () => {
		const settled = (id: string) => ({ id: `finding:${id}`, findingId: id, title: id, featureRef: null, blocking: false, outcome: 'fixed' as const, reason: '', sourceIds: [], materialisedAt: null });
		const request = createEvolutionRequest({ id: 'r-1', title: 'Settle the findings EVO-001 fixed', stage: 'specification', findingDrafts: ['e0', 'e1', 'e2'].map(settled) });
		const body = html(['e0', 'e1', 'e2', 'e3'].map((id) => point(id, 'Unhandled edge')), [request]);
		expect(body.match(/Sent to EVO-001/g)).toHaveLength(3);
		expect(body).not.toContain('Sent to Evolutions');
		expect(body).toContain('title="EVO-001, Settle the findings EVO-001 fixed, carries this point with 2 other points. Open it in Evolutions."');
		expect(body).toContain('href="/projects/p/evolution?request=r-1"');
		// The point no request carries still offers its own evolution.
		expect(body.match(/>New change</g)).toHaveLength(1);
	});
});

describe('several points are composed into one evolution [criterion:3f977777]', () => {
	const picked = (open: Finding[], requests: EvolutionRequest[] = []) => {
		const decisions = new FindingDecisions('p', {} as SpecEdits);
		decisions.picked = new Set(open.map((f) => f.id));
		return render(NoticedSection, { props: { view: noticedView({ open, kept: [], requests, projectId: 'p' }), decisions, writable: true, onOpen: () => {} } }).body;
	};
	const two = [point('a', 'Dead end'), point('b', 'Dead end')];

	it('counts the picked points in on wheels and offers New change alone while no request is open to changes', () => {
		const body = picked(two);
		expect(body).toContain('points picked');
		expect(body).toContain('>2</span>');
		// Large over the room of two digits, the words over the room of "points picked": a tick never resizes the bar.
		expect(body).toContain('width: 2ch; height: 1.2em;');
		expect(body).toContain('<span class="min-w-[13ch]">points picked</span>');
		expect(body).toContain('>New change</button>');
		expect(body).not.toContain('Add to an evolution');
	});

	it('offers Add to an evolution once a request is still open to changes', () => {
		const body = picked(two, [createEvolutionRequest({ id: 'r-1', stage: 'specification', title: 'Settle the findings' })]);
		expect(body).toContain('Add to an evolution');
	});
});

describe("while several points are picked, a point's own Reject and New change cannot be pressed [criterion:e241c011]", () => {
	const issue = (id: string): Finding => ({ ...point(id, 'Dead end'), decision: { issueId: id, question: 'q' } });
	const lines = (ticked: string[]) => {
		const decisions = new FindingDecisions('p', {} as SpecEdits);
		decisions.picked = new Set(ticked.map((id) => `point:${id}`));
		const body = render(NoticedSection, { props: { view: noticedView({ open: [issue('a'), issue('b'), issue('c')], kept: [], requests: [], projectId: 'p' }), decisions, writable: true, onOpen: () => {} } }).body;
		return { body, own: body.match(/<button[^>]*aria-label="(?:Reject|New change): [^"]*"[^>]*>/g) ?? [] };
	};
	const WHY = 'title="Several points are picked: use the bar at the foot of the screen, or clear the picks."';

	it('greys them on every line, ticked or not, and says why, the bar staying active', () => {
		const { body, own } = lines(['a', 'b']);
		expect(own).toHaveLength(6);
		for (const button of own) {
			expect(button).toMatch(/\sdisabled(=""|\s|>)/);
			expect(button).toContain(WHY);
		}
		const bar = body.slice(body.indexOf('aria-label="Points picked for an evolution"'));
		expect(bar).toContain('>New change</button>');
		expect(bar).not.toContain('disabled=""');
	});

	it.each([[['a']], [[]]])('leaves them active with %j picked', (ticked) => {
		const { own } = lines(ticked);
		expect(own).toHaveLength(6);
		for (const button of own) {
			expect(button).not.toMatch(/\sdisabled(=""|\s|>)/);
			expect(button).not.toContain(WHY);
		}
	});
});
