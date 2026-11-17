/**
 * What Lyriks tells the person about the approvals their AI client asks for
 * (ac-ai-session-approvals). The client asks to allow each Lyriks tool before
 * using it, and Lyriks never sees that question: it only says it where the
 * person looks, once the prompt is copied and whenever the LLM goes quiet.
 */

/** Under a copied retrospecification prompt: the approvals that come next, and how to answer them once. */
export const APPROVALS_AHEAD =
	'Your AI will ask you to allow each Lyriks tool it uses, dozens of times in a row on a first Reverse-Specification. Allow them for the whole task (or always) and it stops asking.';

/** Why a quiet LLM may be waiting for the person, and how to spare the next questions. */
export const QUIET_WHY = 'Its window may be asking you to allow a Lyriks tool: allow it for the whole task (or always) and it stops asking. It may also still be reading.';
