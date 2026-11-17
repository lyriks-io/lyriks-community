import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { createEvolutionRequest, createProposal } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyDataDraft } from '$domain/data';
import { proposalsPart, requestSummary, type EvolutionView } from '$lib/server/evolution-view.server';
import BriefingTab from './BriefingTab.svelte';

function briefing(editing: string | null, withSuggestion = false) {
	const request = createEvolutionRequest({ id: 'r1', title: 'A note for the baker', requester: 'Ana' });
	request.need.description = 'The customer asks for a note';
	request.need.situation = 'No note can be sent';
	request.need.objectives = 'A note reaches the baker';
	if (withSuggestion) request.proposals.push(createProposal({ id: 'suggestion', targetField: '00-need.situation', value: 'AI wording' }));
	const view: EvolutionView = {
		projectId: 'p', draft: { projectId: 'p', requests: [request], lastSavedAt: null },
		features: createEmptyFeaturesDraft('p'), leaves: [], sources: [], glossaryTerms: [], productName: 'P', revision: 1,
		data: createEmptyDataDraft('p'), held: {}, coverage: {}, filled: {},  readings: {}, members: [], language: 'en', assistantAvailable: false
	};
	const dossier = requestSummary(view, request, { id: 'Ana', kind: 'person', role: 'member', channel: 'page' });
	const proposals = proposalsPart(view, request, { id: 'Ana', kind: 'person', role: 'member', channel: 'page' }).proposals.entries;
	return render(BriefingTab, { props: {
		projectId: 'p', dossier, proposals,
		members: [], actorId: 'Ana', canEdit: true, canValidate: true, canComment: false, lang: 'en',
		versionsOf: () => [], nameOf: (id: string) => id, editing, onEdit: () => {}, openOwed: false,
		nextStep: { label: 'Solution', go: () => {} }, onGoSolution: () => {}
	} as never }).body;
}

describe('whole-page Briefing editing', () => {
	it('opens origin, situation and objectives together with their saved values [unspa:280520a6:dc714578:59d1cfb2]', () => {
		const html = briefing('all');
		expect(html).toContain('aria-label="Requester"');
		expect(html).toContain('The customer asks for a note');
		expect(html).toContain('No note can be sent');
		expect(html).toContain('A note reaches the baker');
		expect(html.match(/<textarea/g)).toHaveLength(4);
		expect(html).not.toContain('Done, then edit:');
	});

	it('keeps a section with an undecided AI suggestion out of the editors', () => {
		const html = briefing('all', true);
		expect(html).toContain('AI wording');
		expect(html.match(/<textarea/g)).toHaveLength(2);
	});
});
