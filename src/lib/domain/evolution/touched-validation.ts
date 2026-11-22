import type { Actor, EvolutionRequest } from './draft';
import type { RequestStage } from './enums';
import { firstRefusal, guard, type Guarded, type Refused } from './guard';
import { record } from './history';
import { diagramLinks } from './used-features';
import { linkKindOf } from './diagram-links';

/**
 * What a change touches that Knowledge has not validated, and the choice the
 * request records for each (EVO-003). The Simulation lists every existing
 * element the change amends or builds on that is not validated in Knowledge;
 * for each one a person validates it now (their own validation, given on the
 * Specification 360°) or sets it to be validated when the change lands. The
 * choice is asked, never imposed: the freeze sets what is left to the landing
 * and says so. Pure: Knowledge arrives read.
 *
 * Elements of Knowledge are named by their anchor: `feature:<featureId>`,
 * `action:<featureId>:<actionId>`, `rule:<featureId>:<ruleId>`.
 */

/** A choice to validate an element when the change lands, as the request keeps it. */
export interface LandingChoice {
	/** Who chose it: a person, or the freeze in the name of whoever froze. */
	readonly by: string;
	readonly at: string;
	/** Set by the freeze for an element nobody chose for. */
	readonly atFreeze?: boolean;
}

/** The choice a line of the Simulation reads. */
export type TouchedChoice = 'none' | 'at_landing' | 'validated_now';

/** How the change touches the element: its drafts amend it, or it builds on it as it stands. */
export type TouchedRelation = 'amended' | 'used';

/** A person an element waits on, by the name the team reads. */
export interface WaitedPerson {
	readonly id: string;
	readonly name: string;
}

/** One element of Knowledge, as the Simulation reads where it stands. */
export interface KnowledgeStanding {
	readonly id: string;
	readonly title: string;
	/** Where it sits: its core feature and its feature. */
	readonly place?: string;
	/** The anchor of the action a rule belongs to. */
	readonly under?: string;
	/** Every validation it waits on was given, or a landed request validated it. */
	readonly validated: boolean;
	/** The people whose validation it still waits on. */
	readonly waitsOn: readonly WaitedPerson[];
	/** It waits on the reader, who has not validated it yet. */
	readonly waitsOnMe: boolean;
}

/** Knowledge as the Simulation reads it; unreadable when the project team could not be read. */
export interface KnowledgeRead {
	readonly readable: boolean;
	/** The specification is validated definitively: its elements are no longer validated one by one. */
	readonly specValidated: boolean;
	readonly elements: readonly KnowledgeStanding[];
}

/** One line of the block Not validated in Knowledge. */
export interface TouchedLine {
	readonly id: string;
	readonly title: string;
	readonly place: string;
	readonly relation: TouchedRelation;
	readonly waitsOn: readonly WaitedPerson[];
	readonly waitsOnMe: boolean;
	readonly choice: TouchedChoice;
	/** Who set it to the landing, and when; the freeze says it was the freeze. */
	readonly chosen?: LandingChoice;
}

/** What the Simulation reads of Knowledge for one request. */
export interface TouchedReading {
	/** Knowledge could be read: when it could not, the block says so and lists nothing. */
	readonly readable: boolean;
	/** The specification is validated definitively: everything the change touches is validated. */
	readonly specValidated: boolean;
	readonly lines: readonly TouchedLine[];
	/** The lines still waiting for a choice. */
	readonly awaitingChoice: number;
	/** The elements the change touches that Knowledge reads validated: nothing is asked of them. */
	readonly validated: readonly string[];
}

/** The elements of Knowledge a change touches, and those it takes out of the specification. */
export interface TouchedElements {
	readonly touched: ReadonlyMap<string, TouchedRelation>;
	/** Elements a draft removes: they leave the specification, so nothing is asked of them. */
	readonly removed: ReadonlySet<string>;
	/** Features a draft removes whole: every element of theirs leaves with them. */
	readonly removedFeatures: ReadonlySet<string>;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The feature an element of Knowledge belongs to: what follows its kind, up to its own id for an action or a rule. */
function featureOfElement(id: string): string {
	const [kind, ...rest] = id.split(':');
	return kind === 'action' || kind === 'rule' ? rest.slice(0, -1).join(':') : rest.join(':');
}

/**
 * What a request's drafts amend or remove, and what its diagrams build on, as
 * elements of Knowledge. A draft amending a feature amends the feature and each
 * existing action or rule its behaviour model changes; an operation adding
 * something under an existing action amends that action. A draft removing a
 * feature removes it whole.
 */
export function touchedElementsOf(request: Pick<EvolutionRequest, 'drafts' | 'stepAnswers' | 'skippedSteps'>): TouchedElements {
	const touched = new Map<string, TouchedRelation>();
	const removed = new Set<string>();
	const removedFeatures = new Set<string>();
	const amend = (id: string) => touched.set(id, 'amended');
	for (const draft of request.drafts) {
		const featureId = draft.baseLeafId;
		if (!featureId || draft.kind === 'add') continue;
		if (draft.kind === 'remove') {
			removedFeatures.add(featureId);
			continue;
		}
		amend(`feature:${featureId}`);
		const operations = [...(draft.behaviourModel?.landed?.operations ?? []), ...(draft.behaviourModel?.operations ?? [])];
		for (const op of operations) {
			const verb = /^(add|update|remove)_(.+)$/.exec(text(op.kind) || text(op.op));
			if (!verb) continue;
			const [, how, what] = verb;
			const actionId = text(op.actionId);
			const ruleId = text(op.ruleId);
			if (what === 'action') {
				if (!actionId) continue;
				if (how === 'remove') removed.add(`action:${featureId}:${actionId}`);
				else if (how === 'update') amend(`action:${featureId}:${actionId}`);
				continue;
			}
			if ((what === 'rule' || what === 'action_rule') && ruleId && how !== 'add') {
				if (how === 'remove') removed.add(`rule:${featureId}:${ruleId}`);
				else amend(`rule:${featureId}:${ruleId}`);
			}
			// Whatever an operation writes under an existing action changes what that action does.
			if (actionId) amend(`action:${featureId}:${actionId}`);
		}
	}
	// What the diagrams link to is what the change builds on as it stands (ac-evo-imp-used).
	for (const placed of diagramLinks(request)) {
		const kind = linkKindOf(placed.link.ref);
		const id = placed.link.ref.slice(placed.link.ref.indexOf(':') + 1);
		const element = kind === 'feature' ? `feature:${id}` : kind === 'action' && id.includes('/') ? `action:${id.replace('/', ':')}` : null;
		if (element && !touched.has(element)) touched.set(element, 'used');
	}
	return { touched, removed, removedFeatures };
}

/** Whether a draft takes the element out of the specification: its feature, its action, or itself. */
function leavesTheSpec(elements: TouchedElements, standing: Pick<KnowledgeStanding, 'id' | 'under'>): boolean {
	if (elements.removed.has(standing.id) || elements.removedFeatures.has(featureOfElement(standing.id))) return true;
	return !!standing.under && elements.removed.has(standing.under);
}

/**
 * The block Not validated in Knowledge of a request's Simulation: every
 * existing element the change touches that is not validated, in the order
 * Knowledge shows them, with the choice the request holds for it. An element a
 * draft removes is not listed, nor one already validated, and nothing is on a
 * specification validated definitively. Knowledge that cannot be read lists
 * nothing and says so.
 */
export function touchedReading(request: Pick<EvolutionRequest, 'drafts' | 'stepAnswers' | 'skippedSteps' | 'landingChoices'>, knowledge: KnowledgeRead): TouchedReading {
	if (!knowledge.readable) return { readable: false, specValidated: false, lines: [], awaitingChoice: 0, validated: [] };
	if (knowledge.specValidated) return { readable: true, specValidated: true, lines: [], awaitingChoice: 0, validated: [] };
	const elements = touchedElementsOf(request);
	const choices = request.landingChoices ?? {};
	const lines: TouchedLine[] = [];
	const validated: string[] = [];
	for (const standing of knowledge.elements) {
		const relation = elements.touched.get(standing.id);
		if (!relation || leavesTheSpec(elements, standing)) continue;
		if (standing.validated) {
			validated.push(standing.id);
			continue;
		}
		const chosen = choices[standing.id];
		lines.push({
			id: standing.id,
			title: standing.title,
			place: standing.place ?? '',
			relation,
			waitsOn: standing.waitsOn,
			waitsOnMe: standing.waitsOnMe,
			choice: chosen ? 'at_landing' : 'none',
			...(chosen ? { chosen } : {})
		});
	}
	return { readable: true, specValidated: false, lines, awaitingChoice: lines.filter((l) => l.choice === 'none').length, validated };
}

/* ───────────────────────── The choices, asked until the freeze ───────────────────────── */

/** The stages of a frozen version: its choices read only until a rebrief reopens it. */
const FROZEN_STAGES: ReadonlySet<RequestStage> = new Set(['implementation', 'acceptance', 'delivered']);

export const CHOICE_REFUSALS = {
	frozen: 'The version is frozen: its choices read only.',
	validated: 'This element is validated already.',
	notListed: 'This element is not one this change touches that waits for a validation.',
	nothingToTakeBack: 'No choice at the landing to take back.',
	nothingOpen: 'Every listed element has a choice.',
	unreadable: 'The project team is unavailable. Try again when it is available.'
} as const;

/** A frozen version keeps the choices it was frozen with; a rebrief reopens them (rules d1cd168e, 837f0cb8, 6ab01cf6, a28c3c00). */
export function choicesOpen(request: Pick<EvolutionRequest, 'stage'>): Guarded {
	return guard(FROZEN_STAGES.has(request.stage), CHOICE_REFUSALS.frozen, 'A frozen version keeps the choices it was frozen with; a rebrief reopens them.');
}

/** Every write on a request refuses a finished one, and a viewer, who chooses nothing (rules abea55c9, efea9db4, 5e332b2b). */
function maySetChoices(actor: Actor, request: Pick<EvolutionRequest, 'status' | 'stage'>): Guarded {
	return firstRefusal(
		guard(actor.role === 'viewer', 'forbidden', 'Choosing for a request is writing it.'),
		guard(request.status === 'deleted', 'This request is deleted.', 'A deleted dossier is out of the run; nothing moves it.'),
		guard(request.status === 'closed', 'This request is closed.', 'A closed request has finished its run.'),
		guard(request.status === 'cancelled', 'This request is cancelled: reopen it first.', 'A cancelled request is read, not written.'),
		choicesOpen(request)
	);
}

export interface ChoiceContext {
	readonly actor: Actor;
	readonly at: string;
	readonly newId: () => string;
}

export type ChoiceOutcome = { readonly ok: true; readonly request: EvolutionRequest; readonly summary: string } | Refused;

const plural = (n: number) => `${n} element${n === 1 ? '' : 's'}`;
const named = (lines: readonly Pick<TouchedLine, 'title'>[]) => lines.map((l) => l.title).join(', ');

function withChoices(ctx: ChoiceContext, request: EvolutionRequest, ids: readonly string[], extra: Partial<LandingChoice> = {}): EvolutionRequest {
	const choices: Record<string, LandingChoice> = { ...(request.landingChoices ?? {}) };
	for (const id of ids) choices[id] = { by: ctx.actor.id, at: ctx.at, ...extra };
	return { ...request, landingChoices: choices };
}

/**
 * Validate at the landing (action 30fa09a3): the element is validated in
 * Knowledge when the change lands, the code proving it when the change writes
 * it. An element validated now has nothing left to wait for (rule 09cce71f).
 */
export function chooseAtLandingAct(ctx: ChoiceContext, request: EvolutionRequest, elementId: string, reading: TouchedReading): ChoiceOutcome {
	const line = reading.lines.find((l) => l.id === elementId);
	const allowed = firstRefusal(
		maySetChoices(ctx.actor, request),
		guard(!reading.readable, CHOICE_REFUSALS.unreadable, 'Knowledge could not be read: the Simulation lists nothing to choose for.'),
		guard(reading.specValidated || reading.validated.includes(elementId), CHOICE_REFUSALS.validated, 'An element validated now has nothing left to wait for.'),
		guard(!line, CHOICE_REFUSALS.notListed, 'The Simulation lists what the change touches that Knowledge has not validated: only those take a choice.')
	);
	if (!allowed.ok || !line) return allowed as Refused;
	if (line.choice === 'at_landing') return { ok: true, request, summary: `${line.title} is already set to Validate at the landing` };
	return { ok: true, request: withChoices(ctx, request, [line.id]), summary: `${line.title} set to Validate at the landing` };
}

/** Take back the choice at the landing before the freeze (action 17cf85a6): the line offers its two choices again. */
export function takeBackLandingChoiceAct(ctx: ChoiceContext, request: EvolutionRequest, elementId: string, title = elementId): ChoiceOutcome {
	const allowed = firstRefusal(
		maySetChoices(ctx.actor, request),
		// Only a choice at the landing is taken back; a validation given now is withdrawn in Knowledge (rule 191ad6a7).
		guard(!request.landingChoices?.[elementId], CHOICE_REFUSALS.nothingToTakeBack, 'Only a choice at the landing is taken back; a validation given now is withdrawn in Knowledge.')
	);
	if (!allowed.ok) return allowed as Refused;
	const choices = { ...(request.landingChoices ?? {}) };
	delete choices[elementId];
	return { ok: true, request: { ...request, landingChoices: choices }, summary: `Validate at the landing taken back for ${title}` };
}

/** Choose for all: every listed element still without a choice is set to Validate at the landing (action 21bdc620). */
export function chooseAllAtLandingAct(ctx: ChoiceContext, request: EvolutionRequest, reading: TouchedReading): ChoiceOutcome {
	const open = reading.lines.filter((l) => l.choice === 'none');
	const allowed = firstRefusal(
		maySetChoices(ctx.actor, request),
		guard(!reading.readable, CHOICE_REFUSALS.unreadable, 'Knowledge could not be read: the Simulation lists nothing to choose for.'),
		// With every line chosen, there is nothing left to choose for (rule d57f165c).
		guard(open.length === 0, CHOICE_REFUSALS.nothingOpen, 'With every line chosen, there is nothing left to choose for.')
	);
	if (!allowed.ok) return allowed as Refused;
	return { ok: true, request: withChoices(ctx, request, open.map((l) => l.id)), summary: `${plural(open.length)} set to Validate at the landing: ${named(open)}` };
}

/**
 * The freeze sets what is left to the landing and says so (rule bd0263a6):
 * every listed element still without a choice is set to Validate at the
 * landing, in the name of whoever froze, and the history of the request
 * records it. Nothing waiting, nothing recorded.
 */
export function leftToLandingAtFreeze(ctx: ChoiceContext, request: EvolutionRequest, open: readonly Pick<TouchedLine, 'id' | 'title'>[]): EvolutionRequest {
	if (open.length === 0) return request;
	const chosen = withChoices(ctx, request, open.map((l) => l.id), { atFreeze: true });
	return record(chosen, {
		id: ctx.newId(),
		type: 'knowledge_validation',
		summary: `The freeze set ${plural(open.length)} this change touches, still without a choice, to Validate at the landing: ${named(open)}.`,
		actor: ctx.actor,
		at: ctx.at
	});
}

/** What the way into the build says of the choices still to make; null when none waits (criterion 63051f74). */
export function awaitingChoiceNote(awaiting: number): string | null {
	if (awaiting <= 0) return null;
	return `${plural(awaiting)} this change touches ${awaiting === 1 ? 'still waits' : 'still wait'} for a validation choice: the freeze sets ${awaiting === 1 ? 'it' : 'them'} to Validate at the landing.`;
}

/** The elements set to Validate at the landing that the request amends: those the code proves before they are validated. */
export function amendedByRequest(request: Pick<EvolutionRequest, 'drafts' | 'stepAnswers' | 'skippedSteps'>, elementId: string): boolean {
	return touchedElementsOf(request).touched.get(elementId) === 'amended';
}
