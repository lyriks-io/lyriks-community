import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { createEvolutionRequest } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyDataDraft } from '$domain/data';
import { requestSummary, type EvolutionView } from '$lib/server/evolution-view.server';
import SpecificationTab from './SpecificationTab.svelte';
import ValidateAllButton from './ValidateAllButton.svelte';
import StepValidateAll from './StepValidateAll.svelte';
import type { SectionElements } from './section-elements';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn() }));
vi.mock('./live-session.svelte', () => ({ useLiveSession: () => null }));

/**
 * The Specification of a change names a section's batch control as Knowledge does, Validate the whole section (N),
 * while its foot bar, which validates every section of the step at once, keeps Validate all (N) (EVO-009). The tab is
 * rendered with two drafted features waiting on the reader.
 */
const clean = (html: string) => html.replace(/<!--.*?-->/g, '');

function specification() {
	const request = createEvolutionRequest({ id: 'r', title: 'Pay once', requester: 'Ana', stage: 'specification' });
	const view: EvolutionView = { projectId: 'p', draft: { projectId: 'p', requests: [request], lastSavedAt: null }, features: createEmptyFeaturesDraft('p'), leaves: [], sources: [], glossaryTerms: [], productName: 'P', revision: 1, data: createEmptyDataDraft('p'), held: {}, coverage: {}, filled: {}, readings: {}, members: [], language: 'en', assistantAvailable: false };
	const saved = requestSummary(view, request, { id: 'Ana', kind: 'person', role: 'member', channel: 'page' });
	const leaves = [
		{ id: 'f1', name: 'Pay an invoice', drafted: true, change: 'add' },
		{ id: 'f2', name: 'Refund a payment', drafted: true, change: 'add' }
	];
	// Each feature holds one answer the reader has not validated yet.
	const fieldsOf = (leafId: string) => [{ path: '01-origin.objective', block: '01-origin', label: 'Objective', critical: true, leafId, value: 'Pay once.', filled: true, openQuestion: false, trail: null, pendingProposalId: null, thread: null }];
	const blank = createRawSnippet(() => ({ render: () => '<div></div>' }));
	return clean(
		render(SpecificationTab, {
			props: { projectId: 'p', dossier: { ...saved, leaves, used: [] }, members: [], actorId: 'Ana', canEdit: true, canValidate: true, canComment: true, graph: null, actionReadings: {}, fieldsOf, labelOf: () => '', journeyField: null, onDropSubject: () => {}, onGoSimulation: () => {}, journey: blank, datamap: blank } as never
		}).body
	);
}

describe("a section of a change's Specification reads Validate the whole section (N), the step's foot keeps Validate all (N) [criterion:ac-leaf-63244e32-81f7-4455-9f07-9df598950edf]", () => {
	it('offers Validate the whole section (2) on the features waiting on the reader, and Validate all (2) on the foot bar', () => {
		const html = specification();
		const features = html.slice(html.indexOf('id="sg-features"'));
		expect(features).toMatch(/<button[^>]*title="Validate the 2 features of this section still waiting on you"[^>]*>Validate the whole section \(2\)<\/button>/);
		expect(html).toMatch(/>Validate all \(2\)/);
		expect(html).not.toMatch(/>Validate all \(2\)<\/button>[\s\S]*id="sg-features"/);
	});

	it('names the button of a section with its count, and shows none while nothing of it waits on the reader', () => {
		const button = (count: number, what: SectionElements) => clean(render(ValidateAllButton, { props: { count, what, onclick: () => {} } }).body);
		for (const what of ['features', 'actions', 'elements', 'changes', 'findings'] as const) {
			expect(button(3, what)).toContain('>Validate the whole section (3)</button>');
			expect(button(3, what)).not.toContain('Validate all');
		}
		expect(button(0, 'features')).not.toContain('Validate the whole section');
	});

	it("keeps Validate all (N) for the step's foot bar, which validates every section at once", () => {
		const foot = clean(render(StepValidateAll, { props: { step: 'Specification', parts: [{ count: 2, one: 'feature' }, { count: 1, one: 'action' }], onclick: () => {} } }).body);
		expect(foot).toContain('Validate all (3)');
		expect(foot).not.toContain('Validate the whole section');
	});
});
