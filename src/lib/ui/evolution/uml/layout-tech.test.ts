import { describe, expect, it } from 'vitest';
import { readTechnicalDiagram } from '$domain/evolution';
import { layoutComponents, layoutSequence } from './layout-tech';

/**
 * The Technical spec's diagram lays itself out (ac-evo-tech-uml): what the
 * change involves stands in the product's frame, the other systems outside,
 * nothing on top of anything, and a sequence reads top-down in the order the
 * parts act.
 */
const { diagram } = readTechnicalDiagram(`actor Baker
component Order service
component SMS sender: new
store Orders
store SMS deliveries: new
system SMS provider: new
link Order service -> SMS sender: asks for a text
link SMS sender -> SMS provider: sends the text
link SMS sender -> SMS deliveries: records each attempt
note SMS provider: 0.05 € per text
note SMS provider: down a few minutes a month
sequence Mark a bag ready
  Baker -> Order service: marks the bag ready
  Order service -> SMS sender: asks for a text
  SMS sender -> SMS provider: sends the text
    goes wrong when no answer within 10 s: retried for an hour
  SMS provider --> SMS sender: delivered
  SMS sender -> SMS sender: records the delivery`);

type Box = { x: number; y: number; w: number; h: number };
/** No link runs through a box it does not join, along every segment of its path. */
function expectNoLinkThroughABox(d: ReturnType<typeof readTechnicalDiagram>['diagram'], layout: ReturnType<typeof layoutComponents>) {
	for (const l of layout.links) {
		const link = d.links[l.index];
		for (const p of layout.parts) {
			if (p.name === link.from || p.name === link.to) continue;
			const crosses = l.points.slice(1).some((q, s) =>
				Array.from({ length: 41 }, (_, k) => k / 40).some((t) => {
					const from = l.points[s];
					const x = from.x + (q.x - from.x) * t;
					const y = from.y + (q.y - from.y) * t;
					return Math.abs(x - p.x) * 2 < p.w && Math.abs(y - p.y) * 2 < p.h;
				})
			);
			expect(crosses, `${link.from} -> ${link.to} crosses ${p.name}`).toBe(false);
		}
	}
}
const overlap = (a: Box, b: Box) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

describe('the technical diagram lays itself out [criterion:ac-leaf-ac-evo-tech-uml]', () => {
	it('puts the parts and the stores in the frame, the other systems out of it, and nothing on top of anything', () => {
		const layout = layoutComponents(diagram);
		const of = (kind: string) => layout.parts.filter((p) => p.kind === kind);
		const frameRight = layout.frame.x + layout.frame.w;
		for (const p of [...of('component'), ...of('store')]) expect(p.x + p.w / 2).toBeLessThanOrEqual(frameRight);
		for (const p of of('system')) expect(p.x - p.w / 2).toBeGreaterThan(frameRight);
		// People on top, the stores under the parts, and no link running through a box it does not join.
		for (const p of of('actor')) expect(p.y).toBeLessThan(layout.frame.y);
		for (const st of of('store')) for (const c of of('component')) expect(st.y).toBeGreaterThan(c.y);
		expectNoLinkThroughABox(diagram, layout);
		for (const [i, a] of layout.parts.entries()) for (const b of layout.parts.slice(i + 1)) expect(overlap(a, b), `${a.name} / ${b.name}`).toBe(false);
		expect(layout.links).toHaveLength(3);
		// The two notes on the provider are numbered on it and written in full under the drawing.
		expect(layout.parts.find((p) => p.name === 'SMS provider')?.notes).toEqual([1, 2]);
		expect(layout.notes.map((n) => n.number)).toEqual([1, 2]);
		expect(layout.notes[0].y).toBeGreaterThan(layout.frame.y + layout.frame.h);
	});

	it('takes a link around the parts standing between its two ends, inside the frame', () => {
		// Drawn by the built-in assistant for a cake order: three parts on one row, the screen linked past the website.
		const { diagram: cake } = readTechnicalDiagram(`actor Pâtissier
component Site
component Service commandes sur mesure: new
component Écran back-office: new
store Commandes sur mesure: new
store Photos d'inspiration: new
system Prestataire de paiement
link Site -> Service commandes sur mesure: envoie les demandes
link Service commandes sur mesure -> Commandes sur mesure: garde les demandes
link Service commandes sur mesure -> Photos d'inspiration: stocke la photo à part
link Écran back-office -> Service commandes sur mesure: traite les demandes
link Service commandes sur mesure -> Prestataire de paiement: crée le lien de paiement de l'acompte
link Prestataire de paiement -> Service commandes sur mesure: confirme le paiement par appel retour (webhook)
sequence Payer l'acompte
  Pâtissier -> Écran back-office: traite la demande
  Écran back-office -> Service commandes sur mesure: demande l'acompte`);
		const layout = layoutComponents(cake);
		expectNoLinkThroughABox(cake, layout);
		const around = layout.links.filter((l) => l.points.length > 2);
		expect(around.length).toBeGreaterThan(0);
		for (const l of around) for (const p of l.points) expect(p.y).toBeGreaterThan(layout.frame.y + 34);
		for (const p of layout.parts) if (p.kind !== 'actor' && p.kind !== 'system') expect(p.y + p.h / 2).toBeLessThan(layout.frame.y + layout.frame.h);
	});

	it('draws a sequence as lifelines in the order the parts act, its messages top-down and what goes wrong under its message', () => {
		const layout = layoutSequence(diagram, diagram.sequences[0]);
		expect(layout.participants.map((p) => p.name)).toEqual(['Baker', 'Order service', 'SMS sender', 'SMS provider']);
		const ys = layout.messages.map((m) => m.y);
		expect(ys).toEqual([...ys].sort((a, b) => a - b));
		expect(layout.messages.map((m) => m.reply)).toEqual([false, false, false, true, false]);
		expect(layout.messages[4].self).toBe(true);
		const [fragment] = layout.fragments;
		expect(fragment.y).toBeGreaterThan(layout.messages[2].y);
		expect(fragment.y + fragment.h).toBeLessThan(layout.messages[3].y);
	});
});
