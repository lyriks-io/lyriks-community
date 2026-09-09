import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import {
	featureIdCollisionMessage,
	featureIdCollisions,
	requireBehaviorFeatureAccess
} from '$lib/server/behavior-feature-access.server';
import type { RequestHandler } from './$types';

/**
 * Author behavior depth into one feature through the platform's own engine — the
 * write path that lets the authenticated Lyriks MCP fold in the full Unspaghettit
 * vocabulary (Fix #1) instead of sending users to the standalone, unauthenticated
 * engine. Body: `{ projectId, featureId, operations[], dryRun?, commit?, verbose? }`.
 *
 * `verbose` asks the engine for the full per-issue verification report (under
 * `batch.raw.maturity`) instead of aggregate counts only, so a dry run can name
 * the exact issues to fix.
 *
 * `commit` is a `commitToken` from a prior `dryRun` (Fix #8): it saves that exact
 * validated batch without resending the ops, so `operations` may be omitted on the
 * commit path (the engine replays the cached ops against the current feature).
 *
 * Authorization mirrors the read endpoint: the engine resolves a feature by id
 * across the whole workspace, so we gate on WRITE access to `projectId` AND require
 * `featureId` to belong to that project — either one of its Step-04 leaves or its
 * own aux feature (`<projectId>__experience` / `__data_model`). Exact-id match, not
 * the `__experience` suffix, so a caller can't author into another project's feature.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		featureId?: unknown;
		operations?: unknown;
		dryRun?: unknown;
		commit?: unknown;
		verbose?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const featureId = typeof body?.featureId === 'string' ? body.featureId : '';
	const dryRun = body?.dryRun === true;
	const commit =
		typeof body?.commit === 'string' && body.commit.length > 0 ? body.commit : undefined;
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');
	// The commit path replays the token's cached ops, so operations are optional there;
	// otherwise a batch must carry them.
	if (!commit && !Array.isArray(body?.operations)) error(400, 'operations must be an array');
	const operations = Array.isArray(body?.operations)
		? (body.operations as Record<string, unknown>[])
		: [];

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'write');

	// This id addresses a record another project also claims, so the engine would
	// write into whichever copy it indexed. Refused in the shape a rejected batch
	// already has: the leaf drawer reads `batch.errors[0]` and shows it verbatim,
	// where an HTTP error would reach the same drawer as "The change was rejected."
	const clashes = await featureIdCollisions(projectId, featureId);
	if (clashes.length > 0) {
		const message = featureIdCollisionMessage(projectId, featureId, clashes);
		return json({
			available: true,
			batch: {
				ok: false,
				dryRun,
				appliedCount: 0,
				refs: {},
				errors: [message],
				maturityPercentage: null,
				commitToken: null,
				raw: { rejectedBy: 'behavior-feature-access', errors: [message] }
			},
			warnings: []
		});
	}

	const services = getServices();
	const { available, batch, warnings } = await services.authorBehavior.execute({
		projectId,
		featureId,
		operations,
		dryRun,
		commit,
		verbose: body?.verbose === true
	});
	// The engine returns nothing for two different reasons: it was never reachable,
	// or the call died mid-flight and took the subprocess with it. The old wording
	// asserted the first, which sent people looking at a daemon that was running
	// fine, and said nothing about the part that actually matters on a write path:
	// after a call dies there is no way to know from here whether the ops landed.
	if (!available) {
		error(
			503,
			'The behavior engine did not answer this batch. It is either unreachable or the call ' +
				'exceeded its budget and dropped the subprocess. On a write that is undecided: the ops ' +
				'may or may not have applied, so re-read the feature before retrying, and send the batch ' +
				'in smaller parts (or dry-run it and commit the token) rather than replaying it whole.'
		);
	}

	// A rejected batch is a real, expected outcome (validation) — return it 200 with
	// ok:false so the caller reads the errors, rather than an opaque HTTP error.
	// Surfaces, actions and scenarios are what the formal graph is made of, and
	// this is the only path that authors them. Mirror to the back like a section
	// save does (durable outbox, fire-and-forget), or the engine never sees depth.
	if (!dryRun && batch?.ok) void services.scheduleBackSync(projectId).catch(() => {});

	return json({
		available,
		batch,
		// Shapes that applied and will bite later. Not errors: the batch is saved,
		// and an author who meant it can read the warning and move on.
		warnings,
		maturitySemantics: {
			maturityPercentage: 'Structural completeness only.',
			overall: 'When present under batch.raw.maturity.confidence, this is the weakest confidence dimension.'
		}
	});
};
