import { describe, expect, it } from 'vitest';
import { createEmptyExperienceDraft, createJourney, createStep, createScreen, createElementNode, createGroupNode, ensureScreenRoot, addNode, deriveJourneyFlow, simulate, generateAcceptanceTests } from './index';

function workflow() {
	const draft = createEmptyExperienceDraft('p');
	const editor = createScreen({ id: 'editor', name: 'Editor' });
	const result = createScreen({ id: 'result', name: 'Result' });
	draft.screens.push(editor, result);
	const root = ensureScreenRoot(draft.builder, editor.id);
	ensureScreenRoot(draft.builder, result.id);
	draft.builder.stateSeeds.push({ path: 'preview.ready', value: 'false' });
	// Deliberately insert the hidden action first: object order is not a plan.
	const publish = createElementNode(editor.id, root, 'button');
	publish.label = 'Publish';
	publish.wiring.visibleWhen = { path: 'preview.ready', op: 'truthy' };
	publish.wiring.transitions.push({ id: 'publish', trigger: 'click', effect: { kind: 'navigate', target: result.id } });
	addNode(draft.builder, publish);
	const preview = createElementNode(editor.id, root, 'button');
	preview.label = 'Prepare preview';
	preview.wiring.transitions.push({ id: 'prepare', trigger: 'click', effect: { kind: 'setState', target: 'preview.ready', value: 'true' } });
	addNode(draft.builder, preview);
	const journey = createJourney('core', 0, { name: 'Publish a document' });
	draft.journeys.push(journey);
	draft.steps.push(createStep(journey.id, 0, { linkedScreenId: editor.id }), createStep(journey.id, 1, { linkedScreenId: result.id }));
	return { draft, journey, preview, publish };
}

describe('stateful journey planning', () => {
	it('cannot use a hidden group child as an enabling interaction', () => {
		const { draft, journey, preview } = workflow();
		const root = draft.builder.nodes[draft.builder.screenRoots.editor];
		if (root.kind !== 'group') throw new Error('Expected root group');
		root.childIds = root.childIds.filter((id) => id !== preview.id);
		const hidden = createGroupNode('editor', root.id);
		hidden.visibleWhen = { path: 'never.open', op: 'truthy' };
		hidden.childIds.push(preview.id);
		preview.parentId = hidden.id;
		addNode(draft.builder, hidden);
		expect(deriveJourneyFlow(draft, journey).flowGaps.length).toBeGreaterThan(0);
	});

	it('performs same-screen enabling actions before navigating', () => {
		const { draft, journey, preview, publish } = workflow();
		const flow = deriveJourneyFlow(draft, journey);
		expect(flow.flowGaps).toEqual([]);
		expect(flow.script.map((a) => a.nodeId)).toEqual([preview.id, publish.id]);
		expect(simulate(draft.builder, { actions: flow.script }).ok).toBe(true);
	});

	it('identifies a visibility condition rather than blaming a null persona', () => {
		const { draft, publish } = workflow();
		const run = simulate(draft.builder, { actions: [{ nodeId: publish.id }] });
		expect(run.errors[0].kind).toBe('visibility');
		expect(run.errors[0].message).toContain('preview.ready');
		expect(run.errors[0].message).not.toContain('persona "null"');
	});

	it('retains permission diagnostics for an actual role restriction', () => {
		const { draft, publish } = workflow();
		publish.wiring.gate = { personaIds: ['admin'], allow: true, mode: 'visible' };
		const run = simulate(draft.builder, { personaId: 'reader', actions: [{ nodeId: publish.id }] });
		expect(run.errors[0].kind).toBe('permission');
	});

	it('supports an exact sequence on one screen without inventing a route', () => {
		const { draft, journey, preview } = workflow();
		draft.steps.splice(1);
		draft.steps[0].actions = [{ nodeId: preview.id }];
		const flow = deriveJourneyFlow(draft, journey);
		expect(flow.script).toEqual([{ nodeId: preview.id }]);
		expect(simulate(draft.builder, { actions: flow.script }).state['preview.ready']).toBe(true);
	});

	it('reports a bounded planning gap instead of bypassing an impossible guard', () => {
		const { draft, journey, preview } = workflow();
		preview.wiring.transitions[0].effect.value = 'false';
		const flow = deriveJourneyFlow(draft, journey);
		expect(flow.flowGaps.join(' ')).toContain('steps[].actions');
		expect(simulate(draft.builder, { actions: flow.script }).ok).toBe(false);
	});

	it('exports enabling actions to the real acceptance test, not just navigation', () => {
		const { draft } = workflow();
		const code = generateAcceptanceTests(draft).playwright;
		expect(code).toContain('name: "Prepare preview"');
		expect(code.indexOf('name: "Prepare preview"')).toBeLessThan(code.indexOf('name: "Publish"'));
	});

	it('marks failed explicit scripts as needing repair in generated tests', () => {
		const { draft, publish } = workflow();
		draft.steps.splice(1);
		draft.steps[0].actions = [{ nodeId: publish.id }];
		expect(generateAcceptanceTests(draft).playwright).toContain('The prototype simulation failed');
	});
});
