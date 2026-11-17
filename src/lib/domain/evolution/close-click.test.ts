import { describe, expect, it } from 'vitest';
import type { ActContext, ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { sendCloseClickAct, startSessionAct } from './live-session-acts';
import { closeField, pendingClicksOf, takeNextClick } from './live-session';

/** Each step of the close that git or the index carries out is handed to the person's AI [criterion:ac-leaf-ac-evo-verd-steps-to-ai]. */

const person: Actor = { id: 'ana@team.test', kind: 'person', role: 'member', channel: 'page' };
const viewer: Actor = { ...person, role: 'viewer' };
const ai: Actor = { id: 'ana@team.test', kind: 'ai_client', role: 'member', channel: 'ai_client' };
let counter = 0;
const ctxFor = (actor: Actor): ActContext => ({ actor, at: '2026-10-29T15:00:00.000Z', newId: () => `id-${++counter}`, soloWorkspace: true, validators: null });
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const code = { validated: { commit: '6767ffac7ded' } } as unknown as EvolutionRequest['code'];
const approved = ok(startSessionAct(ctxFor(ai), createEvolutionRequest({ stage: 'delivered', status: 'open', code })));
const live = { ...approved, status: 'closed' as const };
const brief = 'git switch main\ngit merge --no-ff evo/EVO-001-fix';

describe('the close handed to the AI [criterion:ac-leaf-ac-evo-verd-steps-to-ai]', () => {
	it('sends the merge with its brief once the change is approved, kept on its own place', () => {
		const sent = ok(sendCloseClickAct(ctxFor(person), approved, 'merge', brief));
		const [click] = pendingClicksOf(sent, person.id);
		expect(click).toMatchObject({ kind: 'close', fieldPath: closeField('merge'), close: { step: 'merge', brief }, state: 'waiting' });
		expect(takeNextClick(sent, ai.id, '2026-10-29T15:01:00.000Z')?.click.close?.brief).toBe(brief);
	});

	it('refuses the merge before the approval or without a validated commit, and once live', () => {
		expect(sendCloseClickAct(ctxFor(person), { ...approved, stage: 'acceptance' }, 'merge', brief).ok).toBe(false);
		expect(sendCloseClickAct(ctxFor(person), { ...approved, code: undefined }, 'merge', brief).ok).toBe(false);
		expect(sendCloseClickAct(ctxFor(person), live, 'merge', brief).ok).toBe(false);
	});

	it('sends syncing the index and deleting the branch only once the change is live', () => {
		expect(sendCloseClickAct(ctxFor(person), approved, 'sync', 'node .lyriks/tools/sync-index.mjs').ok).toBe(false);
		const synced = ok(sendCloseClickAct(ctxFor(person), live, 'sync', 'node .lyriks/tools/sync-index.mjs'));
		const both = ok(sendCloseClickAct(ctxFor(person), synced, 'branch', 'git branch -d evo/EVO-001-fix'));
		expect(pendingClicksOf(both, person.id).map((c) => c.fieldPath)).toEqual([closeField('sync'), closeField('branch')]);
	});

	it('only a person who may edit hands it over, never an AI, and never without a brief', () => {
		expect(sendCloseClickAct(ctxFor(ai), approved, 'merge', brief).ok).toBe(false);
		expect(sendCloseClickAct(ctxFor(viewer), approved, 'merge', brief).ok).toBe(false);
		expect(sendCloseClickAct(ctxFor(person), approved, 'merge', '  ').ok).toBe(false);
	});
});
