import { pushToast } from '$ui/design-system';
import { copyPrompt } from '$ui/evolution/copy-prompt';
import type { ProjectAiSession } from '$ui/ai-session/project-ai-session.svelte';

/**
 * Where Run it with my AI and Resume it with my AI hand a run on Mismatch
 * (EVO-014, actions d437c7e3 of feat-146, e0c218de of feat-119, 077fe5e2 of
 * feat-7): to the AI in session when Ask my AI reads Listening, as a click of
 * kind run or resume carrying the prompt to follow; otherwise the prompt is
 * copied on the spot. The person stays on Mismatch either way.
 *
 * The one place a page hands a run to an AI. Today a person holds one session
 * per project, so the click goes to the AI in it; EVO-015 routes it later.
 */

export type RunClick = 'run' | 'resume';

/** The AI in session listens: the run goes to it rather than to the clipboard (rules aa8e1403, 46a98afc). */
export const handsInSession = (ai: Pick<ProjectAiSession, 'listening'> | null): boolean => !!ai?.listening;

const COPIED: Readonly<Record<RunClick, string>> = {
	run: 'Prompt copied: paste it in your AI, the run shows here as it reads.',
	resume: 'Prompt copied: paste it in your LLM session to reconnect it and resume the analysis'
};
const HANDED: Readonly<Record<RunClick, string>> = {
	run: 'Run handed to your AI: it starts reading.',
	resume: 'Run handed back to your AI: it resumes where it stopped.'
};
/** The click did not reach the AI: the run still waits, its prompt is on Reverse (feat-119, effect 004863c1). */
export const NOT_HANDED = 'Your AI did not get the run: open the run to copy its prompt.';

/**
 * Copies the prompt when no AI listens; called at the press itself, before any
 * request, while the browser still lets the page write to the clipboard
 * (rules 85f4a78d, d5a5ad98).
 */
export async function copyRunPrompt(kind: RunClick, prompt: string): Promise<void> {
	await copyPrompt(prompt, COPIED[kind]);
}

/** Hands the run to the AI in session, once it is started or while it is paused; says whether the click was saved. */
export async function handRunToMyAi(ai: Pick<ProjectAiSession, 'send'>, kind: RunClick, productName: string): Promise<boolean> {
	const sent = await ai.send({ kind, page: 'drift', anchor: 'retrospec', title: `Reverse-Specification of ${productName}` });
	pushToast(sent ? { level: 'success', message: HANDED[kind] } : { level: 'error', message: NOT_HANDED });
	return sent;
}
