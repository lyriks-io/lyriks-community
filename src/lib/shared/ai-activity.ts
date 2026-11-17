/**
 * The person's AI at work on one Evolution request, as the live-sync stream
 * carries it: the MCP read the request or wrote into it. Nothing is saved; an
 * open dossier page only shows it, so the specification's progress follows
 * the AI while it works instead of waiting for what it writes.
 *
 * The same signal says the AI is at work on the project outside any request
 * (`requestId` is then `PROJECT_ACTIVITY_ID`), the way a retrospecification
 * follows the AI reading and writing the specification's sections.
 */
export interface AiActivity {
	readonly requestId: string;
	readonly act: 'read' | 'write';
	/** The section the call read or wrote, when it named one (a project-wide activity). */
	readonly section?: string;
}

/** The request id of an activity on the project itself, outside any Evolution request. */
export const PROJECT_ACTIVITY_ID = '';

/** The window event the live-sync client re-emits each activity under. */
export const AI_ACTIVITY_EVENT = 'lyriks:ai-activity';
