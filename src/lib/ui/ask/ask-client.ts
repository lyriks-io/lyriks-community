import { pushToast } from '$ui/design-system';
import type { AiChatContext } from '$domain/ai-conversations';

/**
 * The Ask my AI page's calls (surface cf20b92c): the box at the foot of the
 * navigation and the page itself both go through here. A refusal of the
 * server is said in an error toast.
 */

/** The Ask my AI page, on one conversation when named. */
export function askHref(projectId: string, conversationId?: string): string {
	const base = `/projects/${encodeURIComponent(projectId)}/ask`;
	return conversationId ? `${base}?c=${encodeURIComponent(conversationId)}` : base;
}

/** What a page is called, from its window title ("<product> · Evolution · Lyriks" reads Evolution). */
export function pageTitle(windowTitle: string): string {
	const parts = windowTitle
		.split(' · ')
		.map((p) => p.trim())
		.filter(Boolean);
	if (parts.at(-1) === 'Lyriks') parts.pop();
	if (parts.length > 1) parts.shift();
	return parts.join(' · ') || 'this page';
}

/** One act on the person's conversations; the answer, or null once the refusal is said. */
export async function askAct(projectId: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
	const res = await fetch(askHref(projectId), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	}).catch(() => null);
	const answer = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
	if (!res?.ok || answer?.ok === false) {
		pushToast({ level: 'error', message: String(answer?.reason ?? answer?.message ?? 'Lyriks could not reach the server: try again.') });
		return null;
	}
	return answer ?? {};
}

/** A new conversation on the question, carrying the page it was asked from (action 336e9466); its id, or null. */
export async function startChat(projectId: string, text: string, context: AiChatContext | null): Promise<string | null> {
	const answer = await askAct(projectId, { act: 'start', text, context });
	return answer && typeof answer.conversationId === 'string' ? answer.conversationId : null;
}
