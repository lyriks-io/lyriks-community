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

/**
 * What a refused or failed save says: what was not saved, then why, in the
 * server's words when it gives them. A long reason folds behind the colon in
 * the toast, so what was not saved always reads.
 */
export function failureMessage(what: string | undefined, reason: string): string {
	return what ? `${what.charAt(0).toUpperCase()}${what.slice(1)} was not saved: ${reason}` : reason;
}

/**
 * Sends the operations; true once they are saved and the page read the
 * request again. A refusal or a failure says what was not saved and why in an
 * error toast and answers false, for the page to put back what it showed
 * ahead (ac-evo-form-edit-optimistic); a conflict also reads the request again,
 * so the newer version someone else saved shows.
 */
export async function applyEvolution(projectId: string, operations: EvolutionOp[], opts: { readonly what?: string } = {}): Promise<boolean> {
	if (!(await postEvolution(projectId, operations, opts))) return false;
	await invalidateAll();
	return true;
}

/**
 * Sends the operations and answers with the server: true once they are saved,
 * before the page reads the request again (the caller does, criterion 27bbfacd).
 * A refusal or a failure is said as applyEvolution says it.
 */
export async function postEvolution(projectId: string, operations: EvolutionOp[], opts: { readonly what?: string } = {}): Promise<boolean> {
	let res: Response;
	try {
		res = await fetch('/api/evolution', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId, operations })
		});
	} catch (err) {
		pushToast({ level: 'error', message: failureMessage(opts.what, err instanceof Error ? `The change could not be sent (${err.message}).` : 'The change could not be sent.') });
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
			message: failureMessage(
				opts.what,
				refused ? (refused.detail ? `${refused.summary} ${refused.detail}` : refused.summary) : (body?.message ?? `The change failed (${res.status}).`)
			)
		});
		if (res.status === 409) void invalidateAll();
		return false;
	}
	return true;
}

/**
 * Have the installation's built-in assistant draw a step's diagram from its
 * texts, or with `text` rewrite that text from the diagram that moved past it
 * (ac-evo-diagram-assistant). The server checks the request, asks the
 * provider, checks the answer and writes it as the person's act. Answers null
 * once it is written, or the sentence that says why it was not, which the card
 * shows where the button is.
 */
export async function drawWithAssistant(projectId: string, requestId: string, step: 'functional_spec' | 'technical_spec', text?: string): Promise<string | null> {
	let res: Response;
	try {
		res = await fetch('/api/evolution/assistant', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ projectId, requestId, step, ...(text ? { text } : {}) })
		});
	} catch (err) {
		return err instanceof Error ? err.message : 'The request could not be sent.';
	}
	const body = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string; message?: string } | null;
	if (!res.ok || !body?.ok) return body?.reason ?? body?.message ?? (text ? `The text was not updated (${res.status}).` : `The diagram was not drawn (${res.status}).`);
	await invalidateAll();
	pushToast({
		level: 'info',
		message: text
			? 'Rewritten from the diagram by the built-in assistant: read it, then validate it.'
			: 'Drawn by the built-in assistant: read it, correct it if needed, then validate it.'
	});
	return null;
}
