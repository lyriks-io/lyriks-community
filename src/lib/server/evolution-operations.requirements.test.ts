import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { createEvolutionRequest, requirementCandidates, type EvolutionRequest, type Actor } from '$domain/evolution';
import { createEmptyFeaturesDraft } from '$domain/features';
const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('./evolution-view.server', async (original) => ({ ...await original<typeof import('./evolution-view.server')>(), loadEvolutionView: async () => scene.view }));
vi.mock('./sync-bus.server', async (original) => ({ ...await original<typeof import('./sync-bus.server')>(), publishSectionChange: vi.fn() }));
import { applyEvolutionOperations } from './evolution-operations.server';
const save = vi.fn(async (..._args: unknown[]) => ({ revision: 2, savedAt: '2026-11-13T03:00:00Z' }));
const services = {
 clock: { nowIso: () => '2026-11-13T03:00:00Z' }, draftLock: { current: async () => 0, commit: async () => 1, rollback: async () => {} },
 sectionDocuments: { currentRevision: async () => 1 }, saveEvolutionDraft: { execute: save }, implementationCoverage: { invalidate: () => {} }, scheduleBackSync: async () => {}
} as unknown as AppServices;
const person: Actor = { id: 'ana@example.test', kind: 'person', role: 'admin', channel: 'page' };
const client: Actor = { ...person, kind: 'ai_client', channel: 'ai_client' };
const path = 'step.functional_spec.refusals';
function view(request: EvolutionRequest) {
 scene.view = { projectId: 'p', draft: { projectId: 'p', requests: [request] }, features: createEmptyFeaturesDraft('p'), data: {}, leaves: [], sources: [], glossaryTerms: [], members: [], held: {}, coverage: {}, filled: {},  readings: {}, revision: 1, language: 'en' };
}
async function run(actor: Actor, operations: unknown[]) {
 return applyEvolutionOperations(services, { projectId: 'p', operations, actor, origin: null });
}
function saved(): EvolutionRequest {
 const draft = save.mock.calls.at(-1)!.flat().find((a) => Array.isArray((a as { requests?: unknown })?.requests)) as { requests: EvolutionRequest[] };
 return draft.requests[0];
}
const TWO_RULES = [{ fieldPath: path, value: 'Keep active tab.\nNo duplicate tabs.' }];
/** A request holding an earlier AI message that offered two rules, as stored before comments became text only. */
async function offered() {
 view(createEvolutionRequest({ id: 'r', title: 'Tabs' }));
 expect((await run(client, [{ op: 'post_on_field', requestId: 'r', fieldPath: path, body: 'Two rules' }])).ok).toBe(true);
 const posted = saved();
 const request = { ...posted, fieldThreads: posted.fieldThreads.map((t) => ({ ...t, messages: t.messages.map((m) => ({ ...m, suggests: TWO_RULES })) })) };
 save.mockClear(); view(request);
 return { request, messageId: request.fieldThreads[0].messages[0].id };
}
describe('the public Evolution operations preserve independent requirement decisions', () => {
 beforeEach(() => save.mockClear());
 it('a comment that offers texts is refused and nothing is saved [rule:5f9257fe]', async () => {
  view(createEvolutionRequest({ id: 'r', title: 'Tabs' }));
  const result = await run(client, [{ op: 'post_on_field', requestId: 'r', fieldPath: path, body: 'Two rules', writes: TWO_RULES }]);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).toContain('A comment is text only: write the text of a step at its place');
  expect(save).not.toHaveBeenCalled();
 });
 it('two individual accepts in a batch append both selected lines and create no approval', async () => {
  const { messageId } = await offered();
  expect((await run(person, ['Keep active tab.', 'No duplicate tabs.'].map((line) => ({ op: 'decide_thread_suggestion', requestId: 'r', messageId, fieldPath: path, line, decision: 'accept' })))).ok).toBe(true);
  expect(saved().stepAnswers.functional_spec.refusals).toBe('Keep active tab.\nNo duplicate tabs.');
  expect(saved().fieldValidations).toEqual([]);
 });
 it('reject then an AI retry offering the same texts is refused and keeps the rejection', async () => {
  const { messageId } = await offered();
  expect((await run(person, [{ op: 'decide_thread_suggestion', requestId: 'r', messageId, fieldPath: path, line: 'Keep active tab.', decision: 'refuse' }])).ok).toBe(true);
  const refused = saved(); view(refused); save.mockClear();
  expect((await run(client, [{ op: 'post_on_field', requestId: 'r', fieldPath: path, body: 'Repeated reply', replyTo: messageId, writes: TWO_RULES }])).ok).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(refused.fieldThreads[0].messages).toHaveLength(1);
  expect(requirementCandidates(refused.fieldThreads[0].messages)[0].state).toBe('refused');
 });
 it('a refused later line rolls the batch back without writing a preceding valid acceptance', async () => {
  const { messageId } = await offered();
  const result = await run(person, ['Keep active tab.', 'Not offered.'].map((line) => ({ op: 'decide_thread_suggestion', requestId: 'r', messageId, fieldPath: path, line, decision: 'accept' })));
  expect(result.ok).toBe(false);
  expect(save).not.toHaveBeenCalled();
 });
});
