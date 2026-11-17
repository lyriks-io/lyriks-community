import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import { guardSectionWrite } from '$lib/server/section-save.server';
import { resolveEvolutionActor } from '$lib/server/evolution-actor.server';
import { loadEvolutionView } from '$lib/server/evolution-view.server';
import { applyEvolutionOperations } from '$lib/server/evolution-operations.server';
import {
	FUNCTIONAL_DIAGRAM_KEY,
	findRequestByRef,
	isPairedStep,
	pairedTextField,
	pairedTexts,
	redrawDiagramAct,
	unresolvedRequestReason,
	writeTextFromDiagramAct,
	type EvolutionRequest,
	type PairedStep
} from '$domain/evolution';
import type { RequestHandler } from './$types';

/**
 * POST /api/evolution/assistant { projectId, requestId, step, text? }
 *
 * The built-in assistant draws a step's diagram from its texts, or with `text`
 * (description, refusals or failures) rewrites that text from the diagram that
 * moved past it, at the request of the person on the page
 * (ac-evo-diagram-assistant). The request is checked against the act's own
 * guards before anything is sent out, so no call is spent on a request that
 * would refuse it; the answer then lands through the same operation an AI
 * client uses (`redraw_diagram`, `write_text_from_diagram`), as the person's
 * act through the built-in assistant. An AI client has its own model and uses
 * those operations directly.
 */
export const POST: RequestHandler = async (event) => {
	requireEvolutionAccess(event.locals.services);
	const body = (await event.request.json().catch(() => null)) as { projectId?: unknown; requestId?: unknown; step?: unknown; text?: unknown } | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
	const step = typeof body?.step === 'string' ? body.step : '';
	const textKey = typeof body?.text === 'string' ? body.text : '';
	if (!projectId || !requestId) error(400, 'projectId and requestId are required');
	if (!isPairedStep(step)) error(400, 'step must be functional_spec or technical_spec');
	if (textKey !== '' && !pairedTextField(step, textKey)) error(400, `text must name a text the ${step} diagram is paired with`);
	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, `Project "${projectId}" does not exist.`);

	const person = await resolveEvolutionActor(services, event);
	if (person.kind !== 'person' || person.channel !== 'page')
		error(403, 'The built-in assistant is asked from the page. An AI client redraws the diagram itself, with redraw_diagram.');
	const actor = { ...person, channel: 'assistant' as const };
	const activeWorkspaceId = event.cookies.get('lyriks_active_ws');

	const view = await loadEvolutionView(services, projectId, { activeWorkspaceId });
	const request = requestOf(view.draft.requests, requestId);
	const apply = (operation: Record<string, unknown>) =>
		guardSectionWrite('evolution', () =>
			applyEvolutionOperations(services, {
				projectId,
				operations: [{ requestId: request.id, ...operation }],
				actor,
				origin: event.request.headers.get('x-lyriks-client'),
				activeWorkspaceId
			})
		);

	if (textKey !== '') {
		// The rewrite's guards, run on the request as it stands: nothing goes out for a refusal.
		const preflightText = writeTextFromDiagramAct({ actor, at: services.clock.nowIso(), newId: () => 'preflight', lang: view.language }, request, { step, question: textKey, answer: 'preflight' });
		if (!preflightText.ok) return json({ ok: false, reason: `${preflightText.reason} ${preflightText.detail}`.trim() }, { status: 422 });
		const field = pairedTextField(step, textKey) ?? '';
		const texts = pairedTexts(request, step);
		const diagram = request.stepAnswers[step][FUNCTIONAL_DIAGRAM_KEY] ?? '';
		const writing = await services.writeTextWithAssistant.execute({
			step,
			key: textKey,
			current: texts[textKey] ?? '',
			before: request.textAlignment?.[field]?.diagram ?? '',
			diagram,
			others: Object.fromEntries(Object.entries(texts).filter(([key]) => key !== textKey)),
			productName: view.productName,
			lang: view.language
		});
		// Who asked, where, with which provider and model; never the key, never the texts (ac-adm-ai-egress).
		services.audit.record({
			action: 'evolution.assistant.write',
			actor: actor.id,
			outcome: writing.ok ? 'success' : 'failure',
			target: projectId,
			detail: writing.ok
				? `request=${request.id} step=${step} text=${textKey} provider=${writing.provider} model=${writing.model} tries=${writing.tries}`
				: `request=${request.id} step=${step} text=${textKey} ${writing.kind}`
		});
		if (!writing.ok) return json({ ok: false, reason: writing.reason }, { status: writing.kind === 'unavailable' ? 409 : 502 });
		// The diagram may have moved while the assistant was writing: the text would then follow a diagram that is gone.
		const now = requestOf((await loadEvolutionView(services, projectId, { activeWorkspaceId })).draft.requests, requestId);
		if ((now.stepAnswers[step][FUNCTIONAL_DIAGRAM_KEY] ?? '') !== diagram)
			return json({ ok: false, reason: 'The diagram changed while the assistant was writing, so nothing was written: ask it again.' }, { status: 409 });
		const written = await apply({ op: 'write_text_from_diagram', step, question: textKey, answer: writing.text });
		if (!written.ok) {
			const refused = written.results.find((r) => !r.ok);
			return json({ ok: false, reason: refused ? `${refused.summary} ${refused.detail ?? ''}`.trim() : 'The text could not be written.' }, { status: written.status });
		}
		return json({ ok: true, step: step satisfies PairedStep, text: textKey, tries: writing.tries, revision: written.revision });
	}

	// The redraw's guards, run on the request as it stands: nothing goes out for a refusal.
	const preflight = redrawDiagramAct({ actor, at: services.clock.nowIso(), newId: () => 'preflight', lang: view.language }, request, { diagram: 'preflight', step });
	if (!preflight.ok) return json({ ok: false, reason: `${preflight.reason} ${preflight.detail}`.trim() }, { status: 422 });

	const texts = pairedTexts(request, step);
	const drawing = await services.drawDiagramWithAssistant.execute({
		step,
		texts,
		current: request.stepAnswers[step][FUNCTIONAL_DIAGRAM_KEY] ?? '',
		productName: view.productName,
		lang: view.language
	});
	// Who asked, where, with which provider and model; never the key, never the texts (ac-adm-ai-egress).
	services.audit.record({
		action: 'evolution.assistant.draw',
		actor: actor.id,
		outcome: drawing.ok ? 'success' : 'failure',
		target: projectId,
		detail: drawing.ok
			? `request=${request.id} step=${step} provider=${drawing.provider} model=${drawing.model} tries=${drawing.tries}`
			: `request=${request.id} step=${step} ${drawing.kind}`
	});
	if (!drawing.ok) return json({ ok: false, reason: drawing.reason }, { status: drawing.kind === 'unavailable' ? 409 : 502 });

	// The texts may have moved while the assistant was drawing: the drawing would then follow texts that are gone.
	const now = requestOf((await loadEvolutionView(services, projectId, { activeWorkspaceId })).draft.requests, requestId);
	if (JSON.stringify(pairedTexts(now, step)) !== JSON.stringify(texts))
		return json({ ok: false, reason: 'The texts changed while the assistant was drawing, so nothing was written: ask it again.' }, { status: 409 });

	const outcome = await apply({ op: 'redraw_diagram', step, diagram: drawing.notation });
	if (!outcome.ok) {
		const refused = outcome.results.find((r) => !r.ok);
		return json({ ok: false, reason: refused ? `${refused.summary} ${refused.detail ?? ''}`.trim() : 'The drawing could not be written.' }, { status: outcome.status });
	}
	return json({ ok: true, step: step satisfies PairedStep, tries: drawing.tries, revision: outcome.revision });
};

function requestOf(requests: readonly EvolutionRequest[], ref: string): EvolutionRequest {
	const lookup = findRequestByRef(
		requests.filter((r) => r.status !== 'deleted'),
		ref
	);
	if (lookup.kind !== 'found') error(lookup.kind === 'ambiguous' ? 400 : 404, unresolvedRequestReason(ref, lookup));
	return lookup.request;
}
