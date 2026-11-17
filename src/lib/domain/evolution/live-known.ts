import { REQUEST_ORIGINS } from './enums';
import { STEP_QUESTIONS, type EvolutionRequest } from './draft';

/**
 * What the request page already holds, handed to the AI with every click so it
 * never asks the person what the page says (ac-evo-live-known): the title, the
 * origin, the requester, and each answer given with its value.
 */

/** Each answer handed as known is cut here: enough to know it is answered and what it says. */
export const KNOWN_CLIP = 400;

export interface KnownAnswer {
	readonly path: string;
	readonly label: string;
	readonly value: string;
}

export interface PageKnowledge {
	readonly title: string;
	readonly origin: string | null;
	readonly requester: string | null;
	readonly answers: readonly KnownAnswer[];
}

const clip = (value: string) => (value.length > KNOWN_CLIP ? `${value.slice(0, KNOWN_CLIP)}...` : value);

/**
 * The page's knowledge of a request. The answers of the Need come in already
 * labelled the way the page words them; the texts of the steps of prose are
 * read off the request.
 */
export function pageKnowledge(request: EvolutionRequest, needAnswers: readonly KnownAnswer[]): PageKnowledge {
	const stepTexts = Object.entries(request.stepDescriptions)
		.filter(([, text]) => text.trim() !== '')
		.map(([step, text]) => ({ path: `step.${step}.description`, label: `${step.replace('_', ' ')}: description`, value: clip(text) }));
	const stepAnswers = STEP_QUESTIONS.map((q) => ({ q, text: request.stepAnswers[q.step]?.[q.key] ?? '' }))
		.filter(({ text }) => text.trim() !== '')
		.map(({ q, text }) => ({ path: `step.${q.step}.${q.key}`, label: `${q.step.replace('_', ' ')}: ${q.label}`, value: clip(text) }));
	return {
		title: request.title,
		origin: REQUEST_ORIGINS.find((o) => o.code === request.origin)?.label ?? null,
		requester: request.requester?.trim() || null,
		answers: [...needAnswers.filter((a) => a.value.trim() !== '').map((a) => ({ ...a, value: clip(a.value) })), ...stepTexts, ...stepAnswers]
	};
}
