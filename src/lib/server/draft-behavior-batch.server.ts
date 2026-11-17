import { error, json, type RequestEvent } from '@sveltejs/kit';
import {
	behaviorBatchErrors,
	behaviorBatchWarnings,
	canonicalBehaviorOperations,
	resolveWalkTarget
} from '$application/use-cases';
import { resolveEvolutionActor } from './evolution-actor.server';
import { applyEvolutionOperations } from './evolution-operations.server';
import { signalAiActivity } from './ai-activity.server';
import { requireProjectAccess } from './project-access.server';
import { guardSectionWrite } from './section-save.server';

export interface DraftBatchInput {
	readonly projectId: string;
	readonly draftId: string;
	readonly operations: readonly Record<string, unknown>[];
	readonly dryRun: boolean;
	readonly commit?: string;
}

/** A refused batch, in the shape every apply_behavior_batch answer has. */
const refused = (dryRun: boolean, errors: readonly string[]) =>
	json({
		available: true,
		batch: {
			ok: false,
			dryRun,
			appliedCount: 0,
			refs: {},
			errors,
			maturityPercentage: null,
			commitToken: null
		},
		warnings: []
	});

/**
 * apply_behavior_batch on a draft an Evolution request carries: the same
 * vocabulary and the same validation as on a feature, but nothing official is
 * written. The engine replays the draft's behaviour model, then these
 * operations, over what the draft stands for; when it validates them, the
 * operations are appended to the draft's model (set_draft_behaviour, under the
 * Evolution section's own guards and timeline). A dry run keeps nothing.
 *
 * The ids the answer announces are the ids the model keeps: the append sends
 * back the ids this validation minted.
 */
export async function applyBatchToDraft(event: RequestEvent, input: DraftBatchInput) {
	const { projectId, draftId, dryRun } = input;
	// The same batch, read and guarded exactly as on a feature.
	const operations = canonicalBehaviorOperations(input.operations);
	if (input.commit) {
		error(
			400,
			'A draft keeps no commit token: send the operations again with dryRun:false once the dry run reads right.'
		);
	}
	if (operations.length === 0) error(400, 'operations must be a non-empty array');
	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	const evolution = await services.loadEvolutionDraft.execute(projectId);
	const resolved = resolveWalkTarget(draftId, evolution, true);
	if (!resolved.ok) error(resolved.status, resolved.message);
	const target = resolved.target;
	if (target.kind !== 'draft') error(400, `${draftId} is not a draft`);
	// A dry run is the AI modelling the draft too: the page shows it at work either way.
	signalAiActivity(event, projectId, [target.requestId], 'write');
	if (target.frozen) {
		return refused(dryRun, [
			`The request carrying ${draftId} is frozen: what it proposes is what the code is written against. Rebrief the request before changing its behaviour.`
		]);
	}
	const guardErrors = behaviorBatchErrors(operations);
	if (guardErrors.length > 0) return refused(dryRun, guardErrors);

	const answer = await services.simulateBehavior.execute({ target, args: { operations } });
	if (!answer) {
		error(503, 'The behavior engine did not answer this batch; nothing was written on the draft.');
	}
	if (answer.kind === 'refused') return refused(dryRun, [answer.error]);
	const walk = answer.walk as {
		ok?: unknown;
		errors?: unknown;
		batch?: {
			appliedCount?: unknown;
			refs?: unknown;
			created?: unknown;
			scenarios?: unknown;
			mintedIds?: unknown;
		};
	};
	if (walk.ok !== true) {
		return refused(
			dryRun,
			Array.isArray(walk.errors) ? walk.errors.map(String) : ['Rejected by the engine.']
		);
	}
	const batch = walk.batch ?? {};
	const stored = target.model?.operations ?? [];

	if (!dryRun) {
		const actor = await resolveEvolutionActor(services, event);
		const outcome = await guardSectionWrite('evolution', () =>
			applyEvolutionOperations(services, {
				projectId,
				operations: [
					{
						op: 'set_draft_behaviour',
						requestId: target.requestId,
						draftId: target.draftId,
						operations: [...stored, ...operations],
						mintedIds: Array.isArray(batch.mintedIds) ? batch.mintedIds : [],
						expectedModelAt: target.model?.updatedAt ?? ''
					}
				],
				actor,
				origin: event.request.headers.get('x-lyriks-client'),
				activeWorkspaceId: event.cookies.get('lyriks_active_ws')
			})
		);
		if (!outcome.ok) {
			return refused(
				false,
				outcome.results
					.filter((r) => !r.ok)
					.map((r) => [r.summary, r.detail].filter(Boolean).join(' '))
			);
		}
	}

	return json({
		available: true,
		batch: {
			ok: true,
			dryRun,
			appliedCount: operations.length,
			refs: batch.refs ?? {},
			errors: [],
			maturityPercentage: null,
			commitToken: null,
			...(batch.created ? { created: batch.created } : {}),
			...(batch.scenarios ? { scenarios: batch.scenarios } : {})
		},
		warnings: behaviorBatchWarnings(operations),
		draft: {
			requestId: target.requestId,
			draftId: target.draftId,
			over: target.baseLeafId ?? 'an empty feature',
			operations: stored.length + (dryRun ? 0 : operations.length),
			written: dryRun ? 'nothing (dry run)' : 'the draft behaviour model; no feature and no section'
		}
	});
}
