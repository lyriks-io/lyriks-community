/**
 * Hear the person's AI reach a project no page has open yet: the "Create your
 * project" dialog creates the project, shows the prompt naming it, and waits
 * for the AI's first call about it. The dialog's own stream re-emits nothing on
 * `window`, so the page under the dialog (another project's) never takes this
 * project's activity for its own. Returns a teardown.
 */
export function watchAiConnection(projectId: string, onCall: () => void): () => void {
	if (typeof window === 'undefined' || !projectId) return () => {};
	const source = new EventSource(`/api/sync/events?projectId=${encodeURIComponent(projectId)}`);
	// Any call of the AI about the project says it reached it, whatever it read or wrote.
	source.addEventListener('activity', () => onCall());
	return () => source.close();
}
