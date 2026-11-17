import { describe, it, expect } from 'vitest';
import {
	createEmptyExperienceDraft,
	createScreen,
	createJourney,
	createStep,
	ensureScreenRoot,
	createElementNode,
	addNode,
	analyzeCoverage,
	type ProjectExperienceDraft
} from '$domain/experience';

/** Two screens of the inventory and one journey whose two described steps visit both. */
function baseDraft(): { draft: ProjectExperienceDraft; homeId: string; detailId: string } {
	const draft = createEmptyExperienceDraft('p1');
	const home = createScreen({ name: 'Home' });
	const detail = createScreen({ name: 'Detail' });
	draft.screens.push(home, detail);
	const journey = createJourney('core', 0, { name: 'Browse', actorRoleIds: ['r1'] });
	draft.journeys.push(journey);
	const open = createStep(journey.id, 0, { name: 'Open home', linkedScreenId: home.id });
	const read = createStep(journey.id, 1, { name: 'Read detail', linkedScreenId: detail.id });
	draft.steps.push(open, read);
	draft.stepOperations.push({ id: 'op1', stepId: open.id, order: 0, kind: 'api', label: 'GET /home' });
	draft.stepDataReads.push({ id: 'dr1', stepId: read.id, order: 0, entityName: 'Order', mode: 'read', fields: [] });
	return { draft, homeId: home.id, detailId: detail.id };
}

describe('Experience plan-coverage', () => {
	it('reports a fully described plan with no gap, without any drawn layout', () => {
		const { draft } = baseDraft();
		const r = analyzeCoverage(draft, { roles: [{ id: 'r1', name: 'Buyer' }], entityNames: ['Order'] });
		expect(r.gaps).toEqual([]);
		expect(r.readinessScore).toBe(100);
	});

	it('never reads a drawn layout and never blocks', () => {
		const { draft, homeId } = baseDraft();
		// A layout with a dead button and a broken link used to block; it is not read any more.
		const root = ensureScreenRoot(draft.builder, homeId);
		const btn = createElementNode(homeId, root, 'button');
		btn.wiring.transitions.push({ id: 't1', trigger: 'click', effect: { kind: 'navigate', target: 'gone' } });
		addNode(draft.builder, btn);
		draft.builder.entryScreenId = null;
		const r = analyzeCoverage(draft, { roles: [{ id: 'r1', name: 'Buyer' }], entityNames: ['Order'] });
		expect(r.gaps).toEqual([]);
		expect(r.gaps.some((g) => g.severity === 'blocking')).toBe(false);
	});

	it('flags a screen no step visits and a step that lands on no screen', () => {
		const { draft, detailId } = baseDraft();
		const extra = createScreen({ name: 'Settings' });
		draft.screens.push(extra);
		draft.steps[1].linkedScreenId = 'gone';
		const r = analyzeCoverage(draft, { roles: [], entityNames: [] });
		const ids = r.gaps.map((g) => g.id);
		expect(ids).toContain(`screen-unvisited-${extra.id}`);
		expect(ids).toContain(`screen-unvisited-${detailId}`);
		expect(ids).toContain(`step-unlinked-${draft.steps[1].id}`);
		expect(r.gaps.every((g) => g.severity !== 'blocking')).toBe(true);
	});

	it('flags a journey without steps and a step that says nothing it does', () => {
		const { draft } = baseDraft();
		const empty = createJourney('core', 1, { name: 'Empty' });
		draft.journeys.push(empty);
		draft.stepOperations = [];
		const r = analyzeCoverage(draft, { roles: [], entityNames: [] });
		const byId = (id: string) => r.gaps.find((g) => g.id === id);
		expect(byId(`journey-unlinked-${empty.id}`)?.detail).toContain('no steps');
		expect(byId(`step-shallow-${draft.steps[0].id}`)?.severity).toBe('info');
		expect(byId(`step-shallow-${draft.steps[1].id}`)).toBeUndefined();
	});

	it('flags a role that performs no journey and an entity no step reads', () => {
		const { draft } = baseDraft();
		const r = analyzeCoverage(draft, {
			roles: [
				{ id: 'r1', name: 'Buyer' },
				{ id: 'r2', name: 'Auditor' }
			],
			entityNames: ['Order', 'Invoice']
		});
		const ids = r.gaps.map((g) => g.id);
		expect(ids).toContain('role-unused-r2');
		expect(ids).not.toContain('role-unused-r1');
		expect(ids).toContain('entity-unused-invoice');
		expect(ids).not.toContain('entity-unused-order');
	});
});

describe('Experience plan-coverage in French (spec language)', () => {
	const NB = '\u00a0';
	it('writes titles, details and labels in French, names quoted, ids unchanged', () => {
		const { draft } = baseDraft();
		const journey = createJourney('core', 0, { name: 'Checkout' });
		draft.journeys.push(journey);
		const r = analyzeCoverage(draft, { roles: [{ id: 'r9', name: 'Buyer' }], entityNames: ['Invoice'] }, 'fr');
		const byId = (id: string) => r.gaps.find((g) => g.id === id)!;
		expect(byId(`journey-unlinked-${journey.id}`).title).toBe(`«${NB}Checkout${NB}» n'a aucun écran`);
		expect(byId('role-unused-r9').title).toBe(`Le rôle «${NB}Buyer${NB}» n'effectue aucun parcours`);
		expect(byId('role-unused-r9').detail).toContain(`emprunte${NB}; son expérience`);
		expect(byId('entity-unused-invoice').title).toBe(`L'entité «${NB}Invoice${NB}» n'est lue par aucune étape`);
		expect(r.dimensions.find((d) => d.key === 'screens')!.label).toBe('Écrans visités');
	});

	it('keeps English byte-identical when no language is given', () => {
		const { draft } = baseDraft();
		draft.screens.push(createScreen({ name: 'Orphan' }));
		expect(analyzeCoverage(draft, { roles: [], entityNames: [] })).toEqual(
			analyzeCoverage(draft, { roles: [], entityNames: [] }, 'en')
		);
		expect(analyzeCoverage(draft, { roles: [], entityNames: [] }).gaps[0].title).toBe(
			'"Orphan" is visited by no step'
		);
	});
});
