import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { createEvolutionRequest } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyDataDraft } from '$domain/data';
import { requestSummary, type EvolutionView } from '$lib/server/evolution-view.server';
import SpecificationTab from './SpecificationTab.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn() }));
vi.mock('./live-session.svelte', () => ({ useLiveSession: () => null }));

/**
 * Reject takes a feature out of the request: a drafted one through its draft,
 * any other by naming the features again, which a frozen version refuses. In
 * the Build the Specification still corrects the drafts (version N+1), so
 * Reject stays on a drafted feature and leaves the others, where it could
 * only be refused (2026-11-22, a Reject the server always answered no).
 */
const clean = (html: string) => html.replace(/<!--.*?-->/g, '');

function specification(frozen: boolean) {
	const request = { ...createEvolutionRequest({ id: 'r', title: 'Pay once', requester: 'Ana', stage: frozen ? 'implementation' : 'specification' }), frozen, specVersion: frozen ? 1 : 0 };
	const view: EvolutionView = { projectId: 'p', draft: { projectId: 'p', requests: [request], lastSavedAt: null }, features: createEmptyFeaturesDraft('p'), leaves: [], sources: [], glossaryTerms: [], productName: 'P', revision: 1, data: createEmptyDataDraft('p'), held: {}, coverage: {}, filled: {}, readings: {}, members: [], language: 'en', assistantAvailable: false };
	const saved = requestSummary(view, request, { id: 'Ana', kind: 'person', role: 'member', channel: 'page' });
	const leaves = [
		{ id: 'draft:d1', name: 'Pay an invoice', drafted: true, change: 'add', draftId: 'draft:d1', description: 'Pay once.', behaviour: 0 },
		{ id: 'f2', name: 'Refund a payment', drafted: false, change: null }
	];
	const fieldsOf = (leafId: string) => [{ path: '01-origin.objective', block: '01-origin', label: 'Objective', critical: true, leafId, value: 'Pay once.', filled: true, openQuestion: false, trail: null, pendingProposalId: null, thread: null }];
	const blank = createRawSnippet(() => ({ render: () => '<div></div>' }));
	return clean(
		render(SpecificationTab, {
			props: { projectId: 'p', dossier: { ...saved, leaves, used: [] }, members: [], actorId: 'Ana', canEdit: true, canValidate: true, canComment: true, graph: null, actionReadings: {}, fieldsOf, labelOf: () => '', journeyField: null, onDropSubject: () => {}, onGoSimulation: () => {}, journey: blank, datamap: blank } as never
		}).body
	);
}

// The cross that refuses a feature, named Reject <feature> (criterion 916e2ee4): no Reject word on the page.
const CROSS = /<button[^>]*aria-label="Reject [^"]*"[^>]*data-reject-state="offered"/g;
const rejects = (html: string) => html.match(CROSS)?.length ?? 0;

describe('Reject on the Specification of a change [criterion:e67a372d] [criterion:916e2ee4]', () => {
	it('refuses with the cross, never a Reject word', () => {
		expect(specification(false)).not.toMatch(/>\s*Reject\s*</);
	});

	it('offers Reject on every feature before the freeze', () => {
		expect(rejects(specification(false))).toBe(2);
	});

	it('in the Build, offers Reject on the drafted feature only', () => {
		const html = specification(true);
		expect(rejects(html)).toBe(1);
		const drafted = html.indexOf('Pay an invoice');
		const touched = html.indexOf('Refund a payment');
		const reject = html.search(CROSS);
		expect(drafted).toBeGreaterThan(-1);
		expect(touched).toBeGreaterThan(-1);
		// The one Reject left sits with the drafted feature, before the touched one.
		expect(reject).toBeGreaterThan(drafted);
		expect(reject).toBeLessThan(touched);
	});
});
