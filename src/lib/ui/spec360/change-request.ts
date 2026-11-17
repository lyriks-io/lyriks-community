import type { SpecDiscussions } from './discussions.svelte';
import type { SpecValidation } from './validation.svelte';

/**
 * Ask for a change on one element (criterion a4ef7658): it reads
 * rejected at once, nobody's validation standing until it is validated again,
 * and the request opens a discussion on it, so the team reads it where the
 * element is discussed. The element's box for a new topic may hold a message
 * being written: it gets it back once the request leaves. Answers whether the
 * rejection was saved.
 */
export function sendChangeRequest(validation: SpecValidation, discussions: SpecDiscussions, anchor: string, title: string, reason: string): Promise<boolean> {
	const saved = validation.reject(anchor);
	const typed = discussions.drafts[anchor] ?? '';
	discussions.drafts[anchor] = `Change requested: ${reason}`;
	void discussions.post(anchor, title, true);
	discussions.drafts[anchor] = typed;
	return saved;
}
