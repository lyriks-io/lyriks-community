import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { text } from '$application/spec360/labels';
import { currentRun, promptOfRun, resumePromptOfRun, specEditLines } from '$domain/retrospec';
import type { ProjectClick } from '$domain/evolution';

/**
 * What the AI in session receives with a run handed from Mismatch (EVO-014,
 * action 077fe5e2 of feat-7): Run it with my AI hands it the prompt of the run
 * the person just launched, Resume it with my AI the prompt that resumes the
 * paused run where it stopped. The prompt is read from the run as it stands
 * when the AI takes the click, so what it follows is what the Source step of
 * Reverse would copy.
 *
 * The one place a run reaches an AI: today a person holds one session per
 * project, and the click goes to the AI in it (EVO-015 routes it later).
 */
export interface RunHandover {
	/** The prompt the AI follows, from its first line. */
	readonly prompt: string;
	/** How the AI answers the click once its reading ends. */
	readonly answerWith: string;
	/** What it reads first. */
	readonly read: string;
}

/** Nothing to follow: the run was cancelled, validated or replaced before the AI took the click. */
const NO_RUN = 'No Reverse-Specification waits for you on this project any more: answer the click saying so, and do nothing else.';

export async function runHandover(services: AppServices, projectId: string, click: Pick<ProjectClick, 'id' | 'kind'>): Promise<RunHandover> {
	const [{ doc }, identity] = await Promise.all([loadRetrospecDocument(services.sectionDocuments, projectId), services.loadFoundationDraft.loadIdentity(projectId)]);
	const productName = text(identity.productName) || 'the product';
	const run = currentRun(doc);
	const under = run && !run.publishedAt && !run.closedAt ? run : null;
	const prompt = !under ? NO_RUN : click.kind === 'resume' ? resumePromptOfRun(under, productName, projectId) : promptOfRun(under, specEditLines(doc.specEdits).length, productName, projectId);
	const answer = `apply_evolution_batch [{ op: "answer_click", clickId: "${click.id}", text }] (no requestId)`;
	return {
		prompt,
		read: `get_project({ project_id: "${projectId}" })`,
		answerWith: under
			? `The person ${click.kind === 'resume' ? 'asks you to resume the paused' : 'launched the'} Reverse-Specification of ${productName} from Mismatch and handed it to you: follow this prompt from its first line, as if they had pasted it. ${prompt} Once your reading ends, or the prompt tells you to stop, answer the click with ${answer}: one sentence saying what the run read.`
			: `${NO_RUN} Answer with ${answer}.`
	};
}
