import { NBSP, type SpecLanguage } from '$domain/language';
import { PRODUCT_LANE, isEmptyDiagram, readFunctionalDiagram, sameName, type FunctionalDiagram, FUNCTIONAL_DIAGRAM_KEY } from './functional-diagram';
import { skippedQuestionOf, type EvolutionRequest } from './draft';
import { latestVersion, stepAnswerKey, stepDescriptionKey } from './field-versions';
import { describeTechnicalDiagram, isEmptyTechnicalDiagram, readTechnicalDiagram } from './technical-diagram';

/**
 * The texts of the Functional spec and its diagram say the same thing, and
 * neither stays ahead of the other unless the act that catches it up is due
 * and shown (ac-evo-func-uml-sync).
 *
 * Either side catches the other up through an AI, the person's own client or
 * the installation's built-in assistant where it is on
 * (ac-evo-diagram-assistant), since one side is free prose: a text written
 * leaves the diagram behind the texts, to redraw from them; a diagram edited
 * writes no text and leaves behind it each text whose part of the drawing
 * changed, to rewrite from it. What each side follows is kept as values (the
 * texts the diagram was drawn from, the diagram a text was written against),
 * so "behind" is read by comparing them, never guessed from who wrote last.
 */

/** The texts of the step the diagram is paired with. */
export interface FunctionalTexts {
	readonly description: string;
	readonly refusals: string;
	readonly failures: string;
}
/** The texts the diagram follows, as they stood when it was drawn from them or wrote them. */
export interface DiagramAlignment extends FunctionalTexts {
	readonly at: string;
}
export const FUNCTIONAL_TEXT_KEYS = {
	description: stepDescriptionKey('functional_spec'),
	refusals: stepAnswerKey('functional_spec', 'refusals'),
	failures: stepAnswerKey('functional_spec', 'failures')
} as const;
export const FUNCTIONAL_DIAGRAM_FIELD = stepAnswerKey('functional_spec', FUNCTIONAL_DIAGRAM_KEY);

/**
 * The steps that hold a diagram paired with their texts: the Functional spec
 * with its three texts, the Technical spec with its description alone, since
 * the tables of the data it moves are drawn at the Impact analysis
 * (ac-evo-tech-uml-sync).
 */
export type PairedStep = 'functional_spec' | 'technical_spec';
export const PAIRED_STEPS: readonly PairedStep[] = ['functional_spec', 'technical_spec'];
export const isPairedStep = (step: string): step is PairedStep => (PAIRED_STEPS as readonly string[]).includes(step);
export const diagramFieldOf = (step: PairedStep): string => stepAnswerKey(step, FUNCTIONAL_DIAGRAM_KEY);
/** The description of the Technical spec its diagram follows, as it stood when drawn from it or written from it. */
export interface TechnicalAlignment {
	readonly description: string;
	readonly at: string;
}
const PAIRED_KEYS: Readonly<Record<PairedStep, Readonly<Record<string, string>>>> = {
	functional_spec: FUNCTIONAL_TEXT_KEYS,
	technical_spec: { description: stepDescriptionKey('technical_spec') }
};

/**
 * The diagram each text of a step follows, keyed by the text's field key, as it
 * stood when the text last said what it says (ac-evo-func-uml-sync,
 * ac-evo-tech-uml-sync). Only a text a diagram edit moved past is held: a text
 * in step with the diagram has no entry.
 */
export type TextAlignment = Readonly<Record<string, { readonly diagram: string; readonly at: string }>>;

type SyncedRequest = Pick<EvolutionRequest, 'stepDescriptions' | 'stepAnswers' | 'skippedSteps' | 'skippedQuestions' | 'fieldVersions'> & {
	readonly diagramAlignment?: DiagramAlignment | null;
	readonly technicalAlignment?: TechnicalAlignment | null;
	readonly textAlignment?: TextAlignment | null;
};

/** The texts a step's diagram is paired with, keyed like its alignment. */
export const pairedTexts = (request: Pick<EvolutionRequest, 'stepDescriptions' | 'stepAnswers'>, step: PairedStep): Record<string, string> =>
	step === 'functional_spec' ? { ...functionalTexts(request) } : { description: request.stepDescriptions.technical_spec ?? '' };
const alignmentOf = (request: SyncedRequest, step: PairedStep): Readonly<Record<string, string>> | null =>
	((step === 'functional_spec' ? request.diagramAlignment : request.technicalAlignment) ?? null) as Readonly<Record<string, string>> | null;

export const functionalTexts = (request: Pick<EvolutionRequest, 'stepDescriptions' | 'stepAnswers'>): FunctionalTexts => ({
	description: request.stepDescriptions.functional_spec ?? '',
	refusals: request.stepAnswers.functional_spec.refusals ?? '',
	failures: request.stepAnswers.functional_spec.failures ?? ''
});

/**
 * Whether the diagram is behind the texts: a text says something the diagram
 * was not drawn from. Nothing is behind while the texts are empty, nor when the
 * step is not applicable or the diagram is skipped on purpose.
 */
export function diagramBehindTexts(request: SyncedRequest, step: PairedStep = 'functional_spec'): boolean {
	const texts = pairedTexts(request, step);
	const keys = Object.keys(PAIRED_KEYS[step]);
	if (keys.every((k) => (texts[k] ?? '').trim() === '')) return false;
	if ((request.skippedSteps ?? []).some((s) => s.step === step)) return false;
	if (skippedQuestionOf(request, diagramFieldOf(step))) return false;
	const aligned = alignmentOf(request, step);
	if (!aligned) return true;
	return keys.some((k) => (aligned[k] ?? '').trim() !== (texts[k] ?? '').trim());
}

/**
 * Whether a diagram once drawn is behind its texts: what holds its step and
 * its validation (EVO-013). A diagram is offered, never owed: one never drawn
 * has nothing to keep in step, though it is still drawn from the texts on
 * demand, which `diagramBehindTexts` keeps offering.
 */
export function drawnDiagramBehind(request: SyncedRequest, step: PairedStep = 'functional_spec'): boolean {
	return (request.stepAnswers[step][FUNCTIONAL_DIAGRAM_KEY] ?? '').trim() !== '' && diagramBehindTexts(request, step);
}

/** Since when the diagram is behind: the latest version of a text it does not follow. */
export function behindSince(request: SyncedRequest, step: PairedStep = 'functional_spec'): string | null {
	if (!diagramBehindTexts(request, step)) return null;
	const aligned = alignmentOf(request, step);
	const texts = pairedTexts(request, step);
	const keys = PAIRED_KEYS[step];
	const moved = Object.keys(keys).filter((k) => !aligned || (aligned[k] ?? '').trim() !== (texts[k] ?? '').trim());
	const dates = moved.map((k) => latestVersion(request, keys[k])?.at ?? null).filter((at): at is string => at !== null);
	return dates.sort().at(-1) ?? null;
}

/** The field keys of the texts a step's diagram is paired with. */
export const pairedTextFields = (step: PairedStep): readonly string[] => Object.values(PAIRED_KEYS[step]);
/** The field key of a text a step's diagram is paired with, or null for a question that is not one. */
export const pairedTextField = (step: PairedStep, key: string): string | null => PAIRED_KEYS[step][key] ?? null;
/** The step and the key of the text a field holds, when a diagram is paired with it. */
export function pairedTextOf(field: string): { readonly step: PairedStep; readonly key: string } | null {
	for (const step of PAIRED_STEPS) for (const [key, f] of Object.entries(PAIRED_KEYS[step])) if (f === field) return { step, key };
	return null;
}

const diagramOf = (request: Pick<EvolutionRequest, 'stepAnswers'>, step: PairedStep): string => request.stepAnswers[step][FUNCTIONAL_DIAGRAM_KEY] ?? '';

/**
 * What a step's diagram says of each of its texts: the sentences it would
 * write, keyed like the step's texts. Two diagrams that say the same of a text
 * leave it in step, whatever else differs between them.
 */
export function diagramPartOfTexts(step: PairedStep, notation: string): Readonly<Record<string, string>> {
	if (step === 'technical_spec') {
		const { diagram } = readTechnicalDiagram(notation);
		return { description: isEmptyTechnicalDiagram(diagram) ? '' : describeTechnicalDiagram(diagram) };
	}
	const { diagram } = readFunctionalDiagram(notation);
	return isEmptyDiagram(diagram) ? { description: '', refusals: '', failures: '' } : { ...describeFunctionalDiagram(diagram) };
}

/**
 * The texts of a step its diagram moved past, by their key: an edit of the
 * diagram changed what it says of them, and nobody rewrote them from it since.
 * They are no longer shown, nor validated, until they are (ac-evo-func-uml-sync).
 */
export function textsBehindDiagram(request: SyncedRequest, step: PairedStep = 'functional_spec'): readonly string[] {
	const held = request.textAlignment ?? {};
	const keys = Object.entries(PAIRED_KEYS[step]).filter(([, field]) => held[field]);
	if (keys.length === 0 || (request.skippedSteps ?? []).some((s) => s.step === step)) return [];
	const now = diagramPartOfTexts(step, diagramOf(request, step));
	return keys.filter(([key, field]) => diagramPartOfTexts(step, held[field].diagram)[key] !== now[key]).map(([key]) => key);
}

/**
 * The texts a diagram edit leaves behind it (ac-evo-func-uml-sync): each text
 * whose part of the diagram changed follows, from then on, the diagram it was
 * written against; a text whose part says the same again is back in step.
 */
export function textAlignmentAfterEdit(request: SyncedRequest, step: PairedStep, next: string, at: string): TextAlignment | null {
	const held: Record<string, { readonly diagram: string; readonly at: string }> = { ...(request.textAlignment ?? {}) };
	const previous = diagramOf(request, step);
	const after = diagramPartOfTexts(step, next);
	for (const [key, field] of Object.entries(PAIRED_KEYS[step])) {
		const basis = held[field]?.diagram ?? previous;
		if (diagramPartOfTexts(step, basis)[key] === after[key]) delete held[field];
		else held[field] ??= { diagram: basis, at };
	}
	return Object.keys(held).length === 0 ? null : held;
}

/** The alignment once these texts are back in step with their diagram, rewritten from it or made its source again. */
export function textAlignmentWithout(request: SyncedRequest, fields: readonly string[]): TextAlignment | null {
	const held = Object.fromEntries(Object.entries(request.textAlignment ?? {}).filter(([field]) => !fields.includes(field)));
	return Object.keys(held).length === 0 ? null : held;
}

const WORDS = {
	en: {
		product: 'The product',
		who: 'Who takes part',
		systems: 'other systems',
		noFlow: 'no flow drawn yet',
		starts: 'starts',
		goes: (from: string, to: string, why: string) => `${from} to ${to}${why ? ` when ${why}` : ''}`,
		refused: 'refused when',
		wrong: 'goes wrong when',
		then: 'then',
		and: 'and'
	},
	fr: {
		product: 'Le produit',
		who: 'Qui participe',
		systems: 'autres systèmes',
		noFlow: 'déroulé pas encore dessiné',
		starts: 'commence à',
		goes: (from: string, to: string, why: string) => `de ${from} à ${to}${why ? ` quand ${why}` : ''}`,
		refused: 'refusé quand',
		wrong: 'ça se passe mal quand',
		then: 'alors',
		and: 'et'
	}
} as const;

const colon = (lang: SpecLanguage) => (lang === 'fr' ? `${NBSP}:` : ':');
const semi = (lang: SpecLanguage) => (lang === 'fr' ? `${NBSP};` : ';');
const quote = (lang: SpecLanguage, text: string) => (lang === 'fr' ? `«${NBSP}${text}${NBSP}»` : `"${text}"`);
const sentence = (text: string) => (/[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
const list = (lang: SpecLanguage, names: readonly string[]) =>
	names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} ${WORDS[lang].and} ${names.at(-1)}`;

/**
 * The texts a diagram writes (ac-evo-func-uml-sync): the description says who
 * takes part, walks each use case through its flow and says what each thing
 * goes through; what it refuses and what goes wrong list the ways out, one per
 * line, each naming the use case and the step it leaves.
 */
export function describeFunctionalDiagram(diagram: FunctionalDiagram, lang: SpecLanguage = 'en'): FunctionalTexts {
	const w = WORDS[lang];
	const paragraphs: string[] = [];
	const people = diagram.actors.filter((a) => a.kind === 'person').map((a) => a.name);
	const systems = diagram.actors.filter((a) => a.kind === 'system').map((a) => a.name);
	if (people.length + systems.length > 0) {
		const parts = [people.length > 0 ? list(lang, people) : null, systems.length > 0 ? `${w.systems}${colon(lang)} ${list(lang, systems)}` : null].filter(Boolean);
		paragraphs.push(sentence(`${w.who}${colon(lang)} ${parts.join(`${semi(lang)} `)}`));
	}
	const laneName = (lane: string) => (sameName(lane, PRODUCT_LANE) ? w.product : lane);
	const flowNames = [
		...diagram.useCases.map((u) => ({ name: u.name, actors: u.actors })),
		...diagram.flows.filter((f) => !diagram.useCases.some((u) => sameName(u.name, f.useCase))).map((f) => ({ name: f.useCase, actors: [] as readonly string[] }))
	];
	const refusals: string[] = [];
	const failures: string[] = [];
	for (const { name, actors } of flowNames) {
		const head = actors.length > 0 ? `${name} (${actors.join(', ')})` : name;
		const flow = diagram.flows.find((f) => sameName(f.useCase, name));
		if (!flow || flow.steps.length === 0) {
			paragraphs.push(sentence(`${head}${colon(lang)} ${w.noFlow}`));
			continue;
		}
		paragraphs.push(`${head}${colon(lang)} ${flow.steps.map((s) => sentence(`${laneName(s.lane)} ${s.text}`)).join(' ')}`);
		for (const step of flow.steps)
			for (const b of step.branches) {
				const line = sentence(`${name}, ${quote(lang, step.text)}${colon(lang)} ${b.kind === 'refused' ? w.refused : w.wrong} ${b.when}${semi(lang)} ${w.then} ${b.then}`);
				(b.kind === 'refused' ? refusals : failures).push(line);
			}
	}
	for (const machine of diagram.machines) {
		const first = machine.states[0];
		const moves = machine.transitions.map((t) => w.goes(t.from, t.to, t.trigger));
		const said = [first ? `${w.starts} ${first}` : null, ...moves].filter(Boolean).join(`${semi(lang)} `);
		paragraphs.push(sentence(`${machine.object}${colon(lang)} ${said}`));
	}
	return { description: paragraphs.join('\n\n'), refusals: refusals.join('\n'), failures: failures.join('\n') };
}

/** The texts a notation writes, or null for a notation that draws nothing, which leaves the texts as they are. */
export function textsFromNotation(notation: string, lang: SpecLanguage = 'en'): FunctionalTexts | null {
	const { diagram } = readFunctionalDiagram(notation);
	return isEmptyDiagram(diagram) ? null : describeFunctionalDiagram(diagram, lang);
}
