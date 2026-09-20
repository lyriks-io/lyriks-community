import { invalidateAll } from '$app/navigation';
import { pushToast } from '$ui/design-system';

/**
 * The reading page drives a request through the same typed operations the
 * MCP uses (POST /api/evolution), as the person on the page: every guard is
 * applied by the server, a refusal comes back as the sentence the spec wrote,
 * and the page re-reads its data afterwards. Nothing is decided client-side.
 */
export type EvolutionOp = Record<string, unknown>;

interface OpResult {
	readonly ok: boolean;
	readonly op: string;
	readonly summary: string;
	readonly detail?: string;
}

export async function applyEvolution(projectId: string, operations: EvolutionOp[]): Promise<boolean> {
	let res: Response;
	try {
		res = await fetch('/api/evolution', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId, operations })
		});
	} catch (err) {
		pushToast({ level: 'error', message: err instanceof Error ? err.message : 'The change could not be sent.' });
		return false;
	}
	const body = (await res.json().catch(() => null)) as {
		ok?: boolean;
		results?: OpResult[];
		message?: string;
	} | null;
	if (!res.ok || !body?.ok) {
		const refused = body?.results?.find((r) => !r.ok);
		pushToast({
			level: 'error',
			message: refused
				? refused.detail
					? `${refused.summary} ${refused.detail}`
					: refused.summary
				: (body?.message ?? `The change failed (${res.status}).`)
		});
		return false;
	}
	await invalidateAll();
	return true;
}

/** Write one field into the section that owns it; the dossier keeps no copy. */
export async function saveFieldValue(
	projectId: string,
	fieldPath: string,
	leafId: string,
	value: string
): Promise<boolean> {
	const res = await fetch('/api/draft/evolution/field', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		// The sources the value rests on stay as the feature holds them.
		body: JSON.stringify({ projectId, fieldPath, leafId, value })
	}).catch(() => null);
	if (!res || !res.ok) {
		pushToast({
			level: 'error',
			message:
				res?.status === 403
					? 'You are not allowed to write in the section that owns this field.'
					: `The write failed (${res?.status ?? 'network'}).`
		});
		return false;
	}
	const body = (await res.json()) as { status: string; reason?: string };
	if (body.status === 'refused') {
		pushToast({ level: 'error', message: body.reason ?? 'The section refused the value.' });
		return false;
	}
	await invalidateAll();
	return true;
}
