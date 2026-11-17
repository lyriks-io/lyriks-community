import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { createEvolutionRequest, updateStepDescriptionAct, type Actor, type EvolutionRequest } from '$domain/evolution';

/**
 * POST /api/evolution/assistant: the person on the page has the built-in
 * assistant draw a diagram (ac-evo-diagram-assistant); nothing goes out for a
 * request that would refuse the drawing, and the audit trail names who asked,
 * the provider and the model, never the key nor the texts (ac-adm-ai-egress).
 */
const DESCRIPTION = 'The order service asks an SMS sender for a text.';
const person: Actor = { id: 'ana@x', kind: 'person', role: 'member', channel: 'page' };
const blank = () => createEvolutionRequest({ id: 'r1', title: 'Ready text', origin: 'customer_feedback', stage: 'specification' });
const described = (): EvolutionRequest => {
	const outcome = updateStepDescriptionAct({ actor: person, at: '2026-10-20T10:00:00.000Z', newId: () => 'v1' }, blank(), { step: 'technical_spec', description: DESCRIPTION });
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.request;
};

const state = { actor: person, request: described() };
const draw = vi.fn();
const apply = vi.fn();
const audit = vi.fn();

vi.mock('$composition/container.server', () => ({
	getServices: () => ({
		projectExists: async () => true,
		installEdition: () => undefined,
		resolveActiveProject: { execute: async () => null },
		clock: { nowIso: () => '2026-10-20T12:00:00.000Z' },
		drawDiagramWithAssistant: { execute: draw },
		audit: { record: audit }
	})
}));
import { getServices } from '$composition/container.server';
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: async () => {} }));
vi.mock('$lib/server/evolution-actor.server', () => ({ resolveEvolutionActor: async () => state.actor }));
vi.mock('$lib/server/evolution-view.server', () => ({
	loadEvolutionView: async () => ({ draft: { requests: [state.request] }, productName: 'La Fournée', language: 'en' })
}));
vi.mock('$lib/server/evolution-operations.server', () => ({ applyEvolutionOperations: apply }));
vi.mock('$lib/server/section-save.server', () => ({ guardSectionWrite: (_section: string, run: () => unknown) => run() }));

const { POST } = await import('./+server');
const event = (step = 'technical_spec') =>
	({
		locals: { services: getServices() },
		request: new Request('http://x/api/evolution/assistant', { method: 'POST', body: JSON.stringify({ projectId: 'p1', requestId: 'r1', step }) }),
		cookies: { get: () => undefined }
	}) as never;

beforeEach(() => {
	state.actor = person;
	state.request = described();
	draw.mockReset();
	apply.mockReset();
	audit.mockReset();
});

describe('POST /api/evolution/assistant [criterion:ac-leaf-ac-evo-diagram-assistant]', () => {
	it("writes the drawing through redraw_diagram, as the person's act by the built-in assistant", async () => {
		draw.mockResolvedValue({ ok: true, notation: 'component Order service', tries: 1, provider: 'anthropic', model: 'claude-opus-5-5' });
		apply.mockResolvedValue({ ok: true, results: [], revision: 7 });
		const response = await POST(event());
		expect(await response.json()).toMatchObject({ ok: true, tries: 1, revision: 7 });
		expect(draw).toHaveBeenCalledWith(expect.objectContaining({ step: 'technical_spec', texts: { description: DESCRIPTION }, productName: 'La Fournée' }));
		const [, applied] = apply.mock.calls[0];
		expect(applied.operations).toEqual([{ op: 'redraw_diagram', requestId: 'r1', step: 'technical_spec', diagram: 'component Order service' }]);
		expect(applied.actor).toMatchObject({ id: 'ana@x', kind: 'person', channel: 'assistant' });
	});

	it('sends nothing out for a diagram that already follows its texts', async () => {
		state.request = blank();
		const response = await POST(event());
		expect(response.status).toBe(422);
		expect(draw).not.toHaveBeenCalled();
	});

	it('is asked from the page only: an AI client redraws with its own model', async () => {
		state.actor = { ...person, kind: 'ai_client', channel: 'ai_client' };
		const answer = await Promise.resolve(POST(event())).catch((e: unknown) => e);
		expect(isHttpError(answer) && answer.status).toBe(403);
		expect(draw).not.toHaveBeenCalled();
	});

	it('writes nothing when the drawing fails, and says why', async () => {
		draw.mockResolvedValue({ ok: false, kind: 'unreadable', reason: "The assistant's drawing did not read, even after a second try, so nothing was written." });
		const response = await POST(event());
		expect(response.status).toBe(502);
		expect((await response.json()).reason).toContain('nothing was written');
		expect(apply).not.toHaveBeenCalled();
	});
});

describe('every generation is audited, never with the key or the texts [criterion:ac-leaf-ac-adm-ai-egress]', () => {
	it('records who asked, the project, the provider and the model', async () => {
		draw.mockResolvedValue({ ok: true, notation: 'component Order service', tries: 2, provider: 'anthropic', model: 'claude-opus-5-5' });
		apply.mockResolvedValue({ ok: true, results: [], revision: 7 });
		await POST(event());
		const [entry] = audit.mock.calls[0];
		expect(entry).toMatchObject({ action: 'evolution.assistant.draw', actor: 'ana@x', target: 'p1', outcome: 'success' });
		expect(entry.detail).toContain('provider=anthropic model=claude-opus-5-5 tries=2');
		expect(JSON.stringify(entry)).not.toContain(DESCRIPTION);
	});
});
