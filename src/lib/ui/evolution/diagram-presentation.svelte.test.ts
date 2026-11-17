import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { createEvolutionRequest } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyDataDraft } from '$domain/data';
import { requestSummary, type EvolutionView } from '$lib/server/evolution-view.server';
import RequestBar from './RequestBar.svelte';
import SpecificationTab from './SpecificationTab.svelte';
import DataChanges from './DataChanges.svelte';
import FunctionalDiagram from './uml/FunctionalDiagram.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn() }));
vi.mock('./live-session.svelte', () => ({ useLiveSession: () => null }));
const diagram = 'actor Visitor\nuse case Pay: Visitor\nflow Pay\n  Visitor: confirms the invoice\n  Product: saves the payment\n    refused when the invoice was paid: show the original receipt';
function dossier() {
 const request = createEvolutionRequest({ id: 'r', title: 'Pay once', requester: 'Ana', stage: 'specification' });
 const view: EvolutionView = { projectId: 'p', draft: { projectId: 'p', requests: [request], lastSavedAt: null }, features: createEmptyFeaturesDraft('p'), leaves: [], sources: [], glossaryTerms: [], productName: 'P', revision: 1, data: createEmptyDataDraft('p'), held: {}, coverage: {}, filled: {},  readings: {}, members: [], language: 'en', assistantAvailable: false };
 return requestSummary(view, request, { id: 'Ana', kind: 'person', role: 'member', channel: 'page' });
}
function specification(withJourney = false, withFeature = false) {
 const saved = dossier();
 const drawing = createRawSnippet(() => ({ render: () => render(FunctionalDiagram, { props: { value: diagram, editable: false, save: async () => {}, productName: 'P', lang: 'en', initialView: 'flows' } as never }).body }));
 return render(SpecificationTab, { props: { projectId: 'p', dossier: { ...saved, used: withFeature ? [{ id: 'old', name: 'Existing feature' }] : [] }, members: [], actorId: 'Ana', canEdit: true, canValidate: true, canComment: true, graph: null, actionReadings: {}, actionsRead: () => ({}), fieldsOf: () => [], labelOf: () => '', journeyField: withJourney ? { path: 'step.functional_spec.diagram', leafId: null, value: diagram, filled: true, trail: null } : null, onDropSubject: () => {}, onGoSimulation: () => {}, journey: drawing, datamap: createRawSnippet(() => ({ render: () => '<div data-fake-map>Legend for a populated diagram</div>' })) } as never }).body;
}

describe('Evolution diagram and empty-state presentation', () => {
 it('keeps the detail header free of the All changes shortcut [criterion:4e47139d]', () => {
  const html = render(RequestBar, { props: { title: 'Pay once', requestKey: 'EVO-001', tabs: [], openTab: 'specification', onSelect: () => {}, onBack: () => {}, status: 'In progress', inProgress: true, standing: 'Specification' } }).body;
  expect(html).toContain('Pay once');
  expect(html).not.toContain('All changes');
 });
 it('shows the exact no-data reading and comment icon with no empty Actions section or datamap furniture [criterion:a1ff3708] [criterion:0b575202]', () => {
  const html = specification();
  expect(html).toContain('This evolution changes no data.');
  expect(html).toContain('aria-label="Comments"');
  expect(html).not.toContain('id="sg-actions"');
  expect(html).not.toContain('Validate at least one feature');
  expect(html).not.toContain('data-fake-map');
  expect(html).not.toContain('>Datamap</h3>');
  expect(html).not.toContain('Validate the data changes');
  expect(html).not.toContain('radial-gradient');
 });
 it('retains the unvalidated-action instruction when a feature actually exists', () => {
  const html = specification(false, true);
  expect(html).toContain('id="sg-actions"');
  expect(html).toContain('Validate at least one feature');
 });
 it('puts dots on only the drawing while surrounding tabs and review content stay plain [criterion:fa6c7dec]', () => {
  const html = specification(true);
  expect(html.match(/radial-gradient/g)).toHaveLength(1);
  expect(html).toContain('Views of the diagram');
  expect(html).toContain('Flow of');
 });
 it('says no data consistently for the bare drawing, including a landed request', () => {
  const saved = dossier();
  for (const landed of [false, true]) {
   const html = render(DataChanges, { props: { projectId: 'p', requestId: 'r', drafts: [], view: saved.data.view, canEdit: false, landed, bare: true } }).body;
   expect(html).toContain('This evolution changes no data.');
   expect(html).not.toContain('radial-gradient');
  }
 });
 it('keeps the historical acknowledgment when declared data changes already landed', () => {
  const saved = dossier();
  const html = render(DataChanges, { props: { projectId: 'p', requestId: 'r', drafts: [{ id: 'd', kind: 'add', name: 'Receipts', materialisedAt: '2026-11-13T00:00:00Z', addFields: [], changeFields: [], removeFields: [] }], view: saved.data.view, canEdit: false, landed: true, bare: true } as never }).body;
  expect(html).toContain('Written into the Data model when the change went live.');
  expect(html).not.toContain('This evolution changes no data.');
 });

});
