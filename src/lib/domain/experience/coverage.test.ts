import { describe, it, expect } from 'vitest';
import {
	createEmptyExperienceDraft,
	createScreen,
	createJourney,
	createStep,
	ensureScreenRoot,
	createGroupNode,
	createElementNode,
	addNode,
	analyzeCoverage,
	type ProjectExperienceDraft
} from '$domain/experience';

/** A draft with one wired screen reachable as the entry, plus a second screen. */
function baseDraft(): { draft: ProjectExperienceDraft; homeId: string; detailId: string } {
	const draft = createEmptyExperienceDraft('p1');
	const home = createScreen({ name: 'Home' });
	const detail = createScreen({ name: 'Detail' });
	draft.screens.push(home, detail);

	// Home gets a layout with a button that navigates to Detail.
	const root = ensureScreenRoot(draft.builder, home.id); // also sets entry = home
	const btn = createElementNode(home.id, root, 'button');
	btn.label = 'Open detail';
	btn.wiring.transitions.push({
		id: 't1',
		trigger: 'click',
		effect: { kind: 'navigate', target: detail.id }
	});
	addNode(draft.builder, btn);

	// Detail gets a (non-empty) layout too.
	const dRoot = ensureScreenRoot(draft.builder, detail.id);
	addNode(draft.builder, createGroupNode(detail.id, dRoot, 'Body'));

	return { draft, homeId: home.id, detailId: detail.id };
}

describe('Experience plan-coverage', () => {
	it('reports a healthy plan with no blockers', () => {
		const { draft } = baseDraft();
		const r = analyzeCoverage(draft, { roles: [], entityNames: [] });
		expect(r.gaps.some((g) => g.severity === 'blocking')).toBe(false);
		const screens = r.dimensions.find((d) => d.key === 'screens')!;
		expect(screens.covered).toBe(2);
		expect(screens.total).toBe(2);
		const nav = r.dimensions.find((d) => d.key === 'navigation')!;
		expect(nav.covered).toBe(2); // both reachable from entry
	});

	it('flags a missing entry screen as blocking and caps the score', () => {
		const { draft } = baseDraft();
		draft.builder.entryScreenId = null;
		const r = analyzeCoverage(draft, { roles: [], entityNames: [] });
		expect(r.gaps.some((g) => g.id === 'entry-missing' && g.severity === 'blocking')).toBe(true);
		expect(r.readinessScore).toBeLessThanOrEqual(55);
	});

	it('flags an orphan screen unreachable from the entry', () => {
		const { draft } = baseDraft();
		draft.screens.push(createScreen({ name: 'Island' }));
		// give it a layout so the only complaint is reachability
		const isle = draft.screens[2];
		ensureScreenRoot(draft.builder, isle.id);
		const r = analyzeCoverage(draft, { roles: [], entityNames: [] });
		const orphan = r.gaps.find((g) => g.id === `orphan-${isle.id}`);
		expect(orphan).toBeTruthy();
		expect(orphan?.ref).toEqual({ screenId: isle.id }); // jump target
	});

	it('flags a broken navigation target as blocking', () => {
		const { draft, homeId } = baseDraft();
		const btn = Object.values(draft.builder.nodes).find(
			(n) => n.kind === 'element' && n.surfaceId === homeId
		)!;
		if (btn.kind === 'element') btn.wiring.transitions[0].effect.target = 'ghost-screen';
		const r = analyzeCoverage(draft, { roles: [], entityNames: [] });
		expect(r.gaps.some((g) => g.severity === 'blocking' && g.title.startsWith('Broken link'))).toBe(true);
	});

	it('flags unused roles and entities, and a dead action', () => {
		const { draft, detailId } = baseDraft();
		// a button on Detail with no binding and no transitions = dead action
		const dRoot = draft.builder.screenRoots[detailId];
		const dead = createElementNode(detailId, dRoot, 'button');
		dead.label = 'Nothing';
		addNode(draft.builder, dead);

		const r = analyzeCoverage(draft, {
			roles: [{ id: 'r1', name: 'Admin' }],
			entityNames: ['Expense']
		});
		expect(r.dimensions.find((d) => d.key === 'roles')!.covered).toBe(0);
		expect(r.dimensions.find((d) => d.key === 'entities')!.covered).toBe(0);
		const deadGap = r.gaps.find((g) => g.id === `dead-action-${dead.id}`);
		expect(deadGap).toBeTruthy();
		expect(deadGap?.ref).toEqual({ screenId: detailId, nodeId: dead.id }); // jump target
	});

	it('counts a journey as covered only when a step links a screen', () => {
		const { draft, homeId } = baseDraft();
		const j = createJourney('core-1', 0, { name: 'Checkout' });
		draft.journeys.push(j);
		draft.derivedCores.push({
			id: 'core-1',
			name: 'Payments',
			order: 0,
			tone: 'payment',
			sourceRefId: 'c1'
		});

		let r = analyzeCoverage(draft, { roles: [], entityNames: [] });
		expect(r.dimensions.find((d) => d.key === 'journeys')!.covered).toBe(0);
		expect(r.dimensions.find((d) => d.key === 'cores')!.covered).toBe(0);

		const step = createStep(j.id, 0, { name: 'Pay' });
		step.linkedScreenId = homeId;
		draft.steps.push(step);
		r = analyzeCoverage(draft, { roles: [], entityNames: [] });
		expect(r.dimensions.find((d) => d.key === 'journeys')!.covered).toBe(1);
		expect(r.dimensions.find((d) => d.key === 'cores')!.covered).toBe(1);
	});
});
