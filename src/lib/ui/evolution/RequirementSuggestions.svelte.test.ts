import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { DossierFieldRow } from '$lib/server/evolution-view.server';
import RequirementSuggestions from './RequirementSuggestions.svelte';
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
const message = { id: 'm1', author: 'ana', authorKind: 'ai_client', body: 'Proposed change', postedAt: '2026-11-13T03:00:00Z', suggests: [
 { fieldPath: 'step.functional_spec.refusals', value: 'No duplicate tabs.\nKeep the active tab.' },
 { fieldPath: 'step.technical_spec.data', value: 'Store the open tab IDs.' }
] };
const field = (path: string, value = '') => ({ path, value, thread: { id: 't', state: 'open', messages: [message] } }) as unknown as DossierFieldRow;
const base = { projectId: 'p', requestId: 'r', fields: [field('step.functional_spec.refusals'), field('step.technical_spec.data')], paths: ['step.functional_spec.refusals'], canEdit: true, lang: 'en', mentionLinks: {} };
const html = (props = base) => render(RequirementSuggestions, { props }).body;
describe('requirements proposed where their category is read [criterion:1ae64117]', () => {
 it('renders one compact independent Accept/Reject pair per requirement in the selected category', () => {
  const body = html();
  expect(body).toContain('>Rule<');
  expect(body).toContain('Accept requirement: No duplicate tabs.');
  expect(body).toContain('Reject requirement: Keep the active tab.');
  expect(body).toContain('h-7 min-h-7');
  expect(body).not.toContain('Store the open tab IDs.');
 });
 it('does not show write controls to a reader', () => {
  const body = html({ ...base, canEdit: false });
  expect(body).toContain('Awaiting a reviewer');
  expect(body).not.toContain('aria-label="Accept requirement:');
  expect(body).not.toContain('aria-label="Reject requirement:');
 });
 it('accepted requirements already in the answer appear once in the canonical list', () => {
  const accepted = { ...message, requirementDecisions: [{ fieldPath: 'step.functional_spec.refusals', line: 'No duplicate tabs.', state: 'accepted', by: 'ana', at: 'now' }] };
  const fields = [{ ...field('step.functional_spec.refusals', 'No duplicate tabs.'), thread: { id: 't', state: 'open', messages: [accepted] } }] as unknown as DossierFieldRow[];
  const body = html({ ...base, fields });
  expect(body).not.toContain('No duplicate tabs.');
  expect(body).toContain('Keep the active tab.');
 });
 it('rejected candidates remain visible without decision buttons after a refresh', () => {
  const rejected = { ...message, requirementDecisions: [{ fieldPath: 'step.functional_spec.refusals', line: 'No duplicate tabs.', state: 'refused', by: 'ana', at: 'now' }] };
  const fields = [{ ...field('step.functional_spec.refusals'), thread: { id: 't', state: 'open', messages: [rejected, { ...message, id: 'retry' }] } }] as unknown as DossierFieldRow[];
  const body = html({ ...base, fields });
  expect(body).toContain('data-requirement-state="refused"');
  expect(body).toContain('Rejected');
  expect(body).not.toContain('Accept requirement: No duplicate tabs.');
  expect(body).toContain('Accept requirement: Keep the active tab.');
 });
});
