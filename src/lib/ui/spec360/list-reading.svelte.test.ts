import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { SpecDiscussions } from './discussions.svelte';
import { SpecValidation } from './validation.svelte';
import { emptyRetrospecDocument } from '$domain/retrospec';
import OpenRow from './page/OpenRow.svelte';
import CiteLinks from './CiteLinks.svelte';
import JourneyList from './experience/JourneyList.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/projects/p/spec/experience') } }));
vi.mock('./discussions.svelte', async original => ({ ...await original<object>(), useDiscussions: () => discussions }));
vi.mock('./validation.svelte', async original => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('./edit-mode.svelte', () => ({ useEditMode: () => mode }));
vi.mock('./edits.svelte', () => ({ useEdits: () => edits }));
vi.mock('./sources.svelte', () => ({ useSources: () => sources }));
vi.mock('$ui/ai-session/project-ai-session.svelte', () => ({ useProjectAiSession: () => null }));
vi.mock('$ui/documents/registry.svelte', () => ({ getDocumentRegistry: () => ({ sources: [{ id: 'evidence', title: 'Product evidence', kind: 'document', note: 'A source the specification cites.' }], passagesOf: () => [] }) }));

const mode = { active: false };
const edits = { editing: null, shown: (_a: string, read: object) => read, current: (_a: string, read: object) => read, shape: () => null, changed: () => false };
const sources = {
 openAnchor: null as string | null, countOf: () => 1, of: () => ['evidence'], groupsOf: () => [], codeOf: () => [], codeCountOf: () => 0,
 toggle(anchor: string) { this.openAnchor = this.openAnchor === anchor ? null : anchor; }
};
let discussions: SpecDiscussions;
const validation = new SpecValidation(() => ({ projectId: 'p', me: { id: 'reader', name: 'Reader' }, canWrite: false, doc: emptyRetrospecDocument(), elements: [], team: [], baselines: [] }));
const description = `${'Invoice opening '.repeat(13)}. The final detail is shown only in full.`;
const journey = { id: 'pay', name: 'Pay an invoice', description, steps: ['Choose the invoice', 'Confirm payment'] };
const clean = (html: string) => html.replace(/<!--.*?-->/g, '');
const row = () => clean(render(OpenRow, { props: { anchor: 'feature:pay', name: 'Pay', description, href: '/projects/p/spec/features/pay', count: 2, unit: 'action' } }).body);
const journeys = () => clean(render(JourneyList, { props: { journeys: [journey] } }).body);
const occurrences = (html: string, text: string) => html.split(text).length - 1;

beforeEach(() => {
 discussions = new SpecDiscussions('p', { email: 'reader@example.test', name: 'Reader' }, [], { document: { version: 1, threads: [] }, revision: 0 });
 sources.openAnchor = null;
 mode.active = false;
});

describe('Knowledge lists keep their reading, navigation and local evidence separate', () => {
 it('shows the complete description under its title, with independent inline links [criterion:dfbc2f49] [criterion:81cd5cfd] [criterion:57ee9b9b] [criterion:89d4c960]', () => {
  const html = row();
  expect(html).toContain(description);
  expect(html).toContain('Open the comments');
  expect(html).toContain('Open the sources');
  expect(html).not.toContain('after:absolute');
  // The links close the description on its last line, inside the same text (owner review 2026-11-14).
  expect(html).toMatch(new RegExp(`${description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<span[^>]*class="cite-links`));
  for (const link of html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []) {
   expect(link).not.toContain('<button');
   expect(link).not.toContain('cite-links');
   expect(link).not.toContain(description);
  }
 });
 it('keeps citations inline in heads and lists alike', () => {
  const html = clean(render(CiteLinks, { props: { anchor: 'feature:pay' } }).body);
  expect(html).toContain('cite-links');
  expect(html).not.toMatch(/class="[^"]*stacked/);
 });
 it('renders one local discussion panel for a row when its canonical discussion is opened', () => {
  discussions.toggle('feature:pay');
  const html = row();
  expect(occurrences(html, 'data-comments')).toBe(1);
  expect(occurrences(html, '<textarea')).toBe(1);
  expect(html).toContain('Hide the comments');
 });
 it('renders one readable source panel for the selected row [criterion:dfbc2f49]', () => {
  sources.toggle('feature:pay');
  const html = row();
  expect(occurrences(html, 'Read the source Product evidence')).toBe(1);
  expect(html).toContain('Hide the sources');
  expect(html).not.toContain('data-comments');
 });
 it('keeps one collapsed journey preview with canonical inline links outside its toggle [criterion:3d3a5e99]', () => {
  const html = journeys();
  expect(html).toContain('Invoice opening');
  expect(html).not.toContain('The final detail is shown only in full.');
  expect(occurrences(html, 'Open the comments')).toBe(1);
  expect(occurrences(html, 'Open the sources')).toBe(1);
  expect(html).not.toContain('after:absolute');
  for (const button of html.match(/<button\b[^>]*data-row-target[^>]*>[\s\S]*?<\/button>/g) ?? []) expect(button).not.toContain('cite-links');
 });
 it('replaces the preview with the full description once when discussion reveals a journey [criterion:3d3a5e99]', () => {
  discussions.toggle('journey:pay');
  const html = journeys();
  expect(occurrences(html, 'The final detail is shown only in full.')).toBe(1);
  expect(occurrences(html, 'Invoice opening')).toBe(13);
  expect(occurrences(html, 'data-comments')).toBe(1);
  expect(occurrences(html, 'Hide the comments')).toBe(1);
  expect(html).toContain('Confirm payment');
  expect(html).toContain('Collapse Pay an invoice');
 });
});
