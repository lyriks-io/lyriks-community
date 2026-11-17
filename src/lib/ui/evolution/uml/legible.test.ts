import { describe, expect, it } from 'vitest';
import { readFunctionalDiagram, readTechnicalDiagram } from '$domain/evolution';
import { fitEntireView } from '$ui/design-system/pan-zoom.svelte';
import { layoutFlow, layoutMachine, layoutUseCases, readingCanvasHeight } from './layout';
import { layoutComponents, layoutSequence } from './layout-tech';
import { diagramWords, linkLabel } from './words';

/**
 * Every text of a diagram reads in full (ac-evo-uml-legible), on the long
 * names a real request carries (Kutt's EVO-001): shapes grow to hold their
 * words and the layout makes room, so nothing is cut short and nothing
 * overlaps; a link never repeats the name of what it is on.
 */
const { diagram } = readFunctionalDiagram(`actor Administrator
actor Another link owner
actor Visitor
system Identity provider of the organisation
use case Expire links automatically: Visitor @[Expire links automatically](feature:feat-kutt-link-expiry)
use case Open a password-protected link: Visitor @[Open a password-protected link](feature:feat-kutt-unlock-link)
use case Send the verification email again to an account that never confirmed it: Administrator @[Manage users](feature:feat-kutt-admin-users)
use case Sign up and log in: Visitor, Identity provider of the organisation @[Sign up and log in](feature:feat-kutt-sign-in)
flow Use my own domain
  Another link owner: adds the same domain
  Product: saves it for them, its root showing this site's home page when it has no homepage
    refused when the first owner's links still point at it, or an administrator added it: the form reads "You can't add this domain."
    goes wrong when that domain is a user's own domain: the link is banned, the domain is left alone, and the dialog reads "The domain belongs to a user: it was left alone."
  Visitor: opens a link of the removed domain
states Domain owned by a user of the instance
  owned by an account of the instance -> removed by its owner from their settings: the owner removes it
  removed by its owner from their settings -> owned by an account of the instance: an account adds it once no other account's links point at it`);

const tech = readTechnicalDiagram(`actor Administrator
component Domains handler of the instance @[Use my own domain](feature:feat-kutt-custom-domain)
component Redirect @[Follow a short link](feature:feat-kutt-follow-link)
store Links of every account
system Identity provider of the organisation
link Domains handler of the instance -> Links of every account: counts a domain's links before it goes, and refuses before the database is asked
note Redirect: an unknown host answers not found unless DEFAULT_DOMAIN_ALIASES lists it, so an instance reached under several names keeps them
sequence Delete a domain that still has links
  Administrator -> Domains handler of the instance: deletes the domain from the Admin page, with Delete all links too left unticked
  Domains handler of the instance -> Links of every account: counts its links
    goes wrong when the database does not answer within the request's time: the dialog says the domain could not be deleted, and nothing changed`).diagram;

type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const noneOverlap = (boxes: readonly Box[]) => boxes.every((a, i) => boxes.slice(i + 1).every((b) => !overlap(a, b)));
const whole = (lines: readonly string[], text: string) => lines.join(' ') === text && !lines.some((l) => l.endsWith('…'));

describe('every text of a diagram reads in full [criterion:ac-leaf-ac-evo-uml-legible]', () => {
	it('grows each use case to hold its whole name, and keeps the ellipses and the people apart', () => {
		const layout = layoutUseCases(diagram);
		for (const uc of layout.useCases) expect(whole(uc.lines, uc.name)).toBe(true);
		const ovals = layout.useCases.map((u) => ({ x: u.cx - u.rx, y: u.cy - u.ry, w: 2 * u.rx, h: 2 * u.ry }));
		expect(noneOverlap(ovals)).toBe(true);
		for (const o of ovals) expect(o.x >= layout.frame.x && o.x + o.w <= layout.frame.x + layout.frame.w).toBe(true);
		for (const actor of layout.actors) expect(whole(actor.lines, actor.name)).toBe(true);
		const people = layout.actors.filter((a) => a.side === 'left').sort((a, b) => a.y - b.y);
		for (const [i, a] of people.entries()) if (i > 0) expect(a.y - people[i - 1].y).toBeGreaterThanOrEqual(118);
	});

	it("never repeats a link that bears the element's own name, and writes another name in full", () => {
		const layout = layoutUseCases(diagram);
		const of = (name: string) => layout.useCases.find((u) => u.name.startsWith(name))!.uses!;
		const words = diagramWords('en');
		expect(linkLabel(of('Expire links'), words)).toEqual(['↳ existing feature']);
		expect(linkLabel(of('Send the verification'), words)).toEqual(['↳ Manage users']);
		expect(linkLabel(of('Expire links'), diagramWords('fr'))).toEqual(['↳ fonctionnalité existante']);
	});

	it('writes every step and way out of a flow in full, growing the boxes and the lanes header, nothing on top of anything', () => {
		const flow = diagram.flows[0];
		const layout = layoutFlow(diagram, flow);
		const steps = layout.nodes.flatMap((n) => (n.kind === 'step' ? [n] : []));
		for (const s of steps) {
			const text = flow.steps[s.step].text;
			expect(whole(s.lines, text[0].toUpperCase() + text.slice(1))).toBe(true);
		}
		const exits = layout.nodes.flatMap((n) => (n.kind === 'exit' ? [n] : []));
		for (const e of exits) {
			const branch = flow.steps[e.step].branches[e.branch];
			expect(whole(e.when, branch.when)).toBe(true);
			expect(whole(e.then, branch.then)).toBe(true);
		}
		expect(noneOverlap([...steps, ...exits])).toBe(true);
		for (const lane of layout.lanes) expect(whole(lane.lines, lane.name)).toBe(true);
		expect(layout.header).toBeGreaterThanOrEqual(Math.max(...layout.lanes.map((l) => l.lines.length)) * 14);
	});

	it('writes every state and every cause in full, the states apart', () => {
		const machine = diagram.machines[0];
		const layout = layoutMachine(machine);
		for (const s of layout.states) expect(whole(s.lines, s.name)).toBe(true);
		for (const e of layout.edges) expect(whole(e.lines, machine.transitions[e.index].trigger)).toBe(true);
		expect(noneOverlap(layout.states)).toBe(true);
	});

	it('grows each part of the technical diagram to hold its name and its link, the rows apart', () => {
		const layout = layoutComponents(tech);
		for (const p of layout.parts) expect(whole(p.lines, p.name)).toBe(true);
		const boxes = layout.parts.filter((p) => p.kind !== 'actor').map((p) => ({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h }));
		expect(noneOverlap(boxes)).toBe(true);
		expect(layout.parts.find((p) => p.name === 'Redirect')!.uses).toEqual({ kind: 'feature', lines: ['Follow a short link'] });
		expect(whole(layout.links[0].lines, tech.links[0].label)).toBe(true);
		expect(layout.notes[0].lines.join(' ')).toBe(`${tech.notes[0].on}: ${tech.notes[0].text}`);
	});

	it('writes every message and what goes wrong in a sequence in full, its header as tall as its names', () => {
		const sequence = tech.sequences[0];
		const layout = layoutSequence(tech, sequence);
		for (const m of layout.messages) expect(whole(m.lines, sequence.messages[m.index].text)).toBe(true);
		for (const f of layout.fragments) {
			const failure = sequence.messages[f.message].failures[f.failure];
			expect(whole(f.when, failure.when)).toBe(true);
			expect(whole(f.then, failure.then)).toBe(true);
		}
		for (const p of layout.participants) expect(whole(p.lines, p.name)).toBe(true);
		expect(layout.lifelineTop - layout.headerY).toBeGreaterThanOrEqual(Math.max(...layout.participants.map((p) => p.h)));
	});

	it('cuts only a sentence longer than its bound, on an ellipsis', () => {
		const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
		const { diagram: d } = readFunctionalDiagram(`actor A\nuse case ${long}: A`);
		const lines = layoutUseCases(d).useCases[0].lines;
		expect(lines).toHaveLength(4);
		expect(lines[3].endsWith('…')).toBe(true);
	});

	it('opens the complete diagram in both dimensions, including large flows below the manual zoom floor [criterion:fa6c7dec]', () => {
		const tall = fitEntireView({ w: 1100, h: 400 }, { w: 2400, h: 3000 }, 1.25);
		expect(tall.scale).toBeCloseTo(368 / 3000);
		expect(tall.tx).toBeGreaterThanOrEqual(16);
		expect(tall.ty + 3000 * tall.scale).toBeLessThanOrEqual(400 - 16);
		const narrow = fitEntireView({ w: 1100, h: 2000 }, { w: 800, h: 600 }, 1.25);
		expect(narrow.scale).toBe(1.25);
		expect(narrow.tx).toBeCloseTo((1100 - 1000) / 2);
		expect(readingCanvasHeight(900)).toBe('clamp(400px, 900px, calc(100vh - 200px))');
		expect(readingCanvasHeight(0)).toBe('400px');
	});
});

describe('the labels of links that cross never cover one another [criterion:ac-leaf-ac-evo-uml-legible]', () => {
	it('moves a label lower than the one it would cover', () => {
		const { diagram: d } = readTechnicalDiagram(`component Domains handler
component API key check
store Links
store Domains
link Domains handler -> Domains: who owns a domain and who added it
link API key check -> Links: reads whose links each ownerless domain carries
link Domains handler -> Links: counts a domain's links before it goes`);
		const layout = layoutComponents(d);
		const boxes = layout.links.map((l) => {
			const w = Math.max(...l.lines.map((line) => line.length * 6.1));
			const top = l.anchor === 'middle' ? l.labelAt.y - (l.lines.length - 1) * 13 - 10 : l.labelAt.y - 10;
			return { x: l.anchor === 'middle' ? l.labelAt.x - w / 2 : l.labelAt.x, y: top, w, h: l.lines.length * 13 };
		});
		expect(noneOverlap(boxes)).toBe(true);
	});
});
