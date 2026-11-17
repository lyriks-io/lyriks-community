import { error, json } from '@sveltejs/kit';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import type { JourneyAct } from '$domain/features';
import type { RequestHandler } from './$types';

/**
 * The journeys a feature's actions are arranged in (actions f3bbf419, 2d9a8378).
 *
 *   GET  → { journeys }
 *   POST { act } → { journeys } | 404 | 422 refusal
 *
 * An act is one of: { kind: 'declare', id, name, nodes? } · { kind: 'rename', journeyId, name } ·
 * { kind: 'remove', journeyId } · { kind: 'keep', journeyId } ·
 * { kind: 'add' | 'take-out', journeyId, actionId } · { kind: 'link' | 'unlink', journeyId, from, to } ·
 * { kind: 'move', journeyId, actionId, x, y } · { kind: 'tidy', journeyId }.
 *
 * Arranging changes nothing an action does, but it changes how every reader
 * reads the feature, so it takes the right to write on the project (rules c5485069, f50ce960).
 */
export const GET: RequestHandler = async (event) => {
	const { projectId, featureId } = event.params;
	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	return json({ journeys: await event.locals.services.loadActionJourneys.execute(projectId, featureId) });
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function actOf(body: unknown): JourneyAct | null {
	const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).act : null;
	const a = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const journeyId = str(a.journeyId);
	const name = typeof a.name === 'string' ? a.name : '';
	const actionId = str(a.actionId);
	const from = str(a.from);
	const to = str(a.to);
	switch (a.kind) {
		case 'declare':
			return str(a.id) ? { kind: 'declare', id: a.id as string, name, ...(Array.isArray(a.nodes) ? { nodes: a.nodes.filter((n): n is string => typeof n === 'string') } : {}) } : null;
		case 'rename':
			return journeyId ? { kind: 'rename', journeyId, name } : null;
		case 'remove':
		case 'keep':
			return journeyId ? { kind: a.kind, journeyId } : null;
		case 'add':
		case 'take-out':
			return journeyId && actionId ? { kind: a.kind, journeyId, actionId } : null;
		case 'link':
		case 'unlink':
			return journeyId && from && to ? { kind: a.kind, journeyId, from, to } : null;
		case 'move':
			return journeyId && actionId && typeof a.x === 'number' && typeof a.y === 'number' ? { kind: 'move', journeyId, actionId, x: a.x, y: a.y } : null;
		case 'tidy':
			return journeyId ? { kind: 'tidy', journeyId } : null;
		default:
			return null;
	}
}

export const POST: RequestHandler = async (event) => {
	const { projectId, featureId } = event.params;
	await requireBehaviorFeatureAccess(event, projectId, featureId, 'write');
	const act = actOf(await event.request.json().catch(() => null));
	if (!act) error(400, 'Send { act } with a kind of declare, rename, remove, keep, add, take-out, link, unlink, move or tidy.');
	const result = await event.locals.services.arrangeActionJourneys.execute(projectId, featureId, act);
	if (!result.ok) return json({ refusal: result.refusal }, { status: result.missing ? 404 : 422 });
	return json({ journeys: result.journeys });
};
