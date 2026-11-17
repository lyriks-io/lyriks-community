/**
 * When each person's AI last acted on a project, as this node heard it
 * (criterion 122ab5c8 of feat-ai-session): any call of the AI on the project
 * but a wait for the next click. An AI that writes, reads or says what it does
 * keeps its session, however long it works; a wait alone never keeps the
 * session of a person who left. In memory: a restarted server counts from its
 * own start, as the rest of the session's clocks do.
 */

const worked = new Map<string, string>();

const keyOf = (projectId: string, personId: string) => `${projectId}\u0000${personId.trim().toLowerCase()}`;

export function noteAiWork(projectId: string, personId: string, at: string = new Date().toISOString()): void {
	const key = keyOf(projectId, personId);
	const before = worked.get(key);
	if (!before || at > before) worked.set(key, at);
}

/** The moment the person's AI last acted on the project; null when this node never heard it. */
export function aiWorkedAt(projectId: string, personId: string): string | null {
	return worked.get(keyOf(projectId, personId)) ?? null;
}

/** The person's acts elsewhere as the idle check reads them: the AI's last act, when there is one. */
export const aiActsOf = (projectId: string, personId: string): string[] => {
	const at = aiWorkedAt(projectId, personId);
	return at ? [at] : [];
};
