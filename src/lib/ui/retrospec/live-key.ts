/**
 * The key the Retrospecification page's load depends on for what the section
 * revisions cannot tell: the AI's calls themselves (the activity log, a
 * behaviour batch that saves no section). The page invalidates it when the AI
 * is seen at work on the project.
 */
export function retrospecLiveKey(projectId: string): string {
	return `lyriks:retrospec:${projectId}:live`;
}
