import {
	PRODUCT_LANE,
	sameName,
	type DiagramActorKind,
	type DiagramBranch,
	type DiagramBranchKind,
	type DiagramFlow,
	type DiagramMachine,
	type DiagramStep,
	type DiagramTransition,
	type FunctionalDiagram
} from './functional-diagram';
import type { SpecLanguage } from '$domain/language';
import { withLink, type DiagramLink } from './diagram-links';

/**
 * The edits the page makes on the diagram (ac-evo-func-uml-edit), each a pure
 * function from one diagram to the next. A rename reaches everywhere the name
 * is drawn and a use case leaves with its flow, so the drawing never holds a
 * name nobody declared because of an edit. A rename onto a name already taken,
 * or onto nothing, changes nothing: the page says why beside the field.
 */

/**
 * What an element is called until a person names it, in the spec's language
 * (ac-evo-func-uml-edit, ac-evo-form-spec-language); the first state of a new
 * thing is where it starts.
 */
export interface NewNames {
	readonly person: string;
	readonly system: string;
	readonly useCase: string;
	readonly step: string;
	readonly thing: string;
	readonly firstState: string;
	readonly state: string;
	readonly component: string;
	readonly store: string;
	readonly sequence: string;
	readonly message: string;
}
const NEW_NAMES: Readonly<Record<SpecLanguage, NewNames>> = {
	en: {
		person: 'New person',
		system: 'New system',
		useCase: 'New use case',
		step: 'New step',
		thing: 'New thing',
		firstState: 'created',
		state: 'New state',
		component: 'New component',
		store: 'New store',
		sequence: 'New sequence',
		message: 'New message'
	},
	fr: {
		person: 'Nouvelle personne',
		system: 'Nouveau système',
		useCase: "Nouveau cas d'utilisation",
		step: 'Nouvelle étape',
		thing: 'Nouvel objet',
		firstState: 'créé',
		state: 'Nouvel état',
		component: 'Nouveau composant',
		store: 'Nouveau stockage',
		sequence: 'Nouvelle séquence',
		message: 'Nouveau message'
	}
};
export const newNames = (lang: SpecLanguage = 'en'): NewNames => NEW_NAMES[lang] ?? NEW_NAMES.en;

/** A name not yet taken among `taken`: the base, then the base numbered. */
export function freshName(base: string, taken: readonly string[]): string {
	if (!taken.some((t) => sameName(t, base))) return base;
	for (let n = 2; ; n++) if (!taken.some((t) => sameName(t, `${base} ${n}`))) return `${base} ${n}`;
}

/** Why a rename onto `to` cannot be made, or null when it can. */
export function renameRefusal(to: string, from: string, taken: readonly string[]): string | null {
	const name = to.trim();
	if (name === '') return 'A name cannot be empty.';
	if (name.includes(':') || name.includes(',') || name.includes('->')) return 'A name holds no ":", "," or "->".';
	if (!sameName(name, from) && taken.some((t) => sameName(t, name))) return `"${name}" is already taken.`;
	return null;
}

const renamed = (name: string, from: string, to: string) => (sameName(name, from) ? to : name);
const actorNames = (d: FunctionalDiagram) => [...d.actors.map((a) => a.name), PRODUCT_LANE];

export function addActor(d: FunctionalDiagram, kind: DiagramActorKind, lang: SpecLanguage = 'en'): { diagram: FunctionalDiagram; name: string } {
	const name = freshName(kind === 'person' ? newNames(lang).person : newNames(lang).system, actorNames(d));
	return { diagram: { ...d, actors: [...d.actors, { name, kind }] }, name };
}

export function renameActor(d: FunctionalDiagram, from: string, to: string): FunctionalDiagram {
	if (renameRefusal(to, from, actorNames(d))) return d;
	const name = to.trim();
	return {
		...d,
		actors: d.actors.map((a) => (sameName(a.name, from) ? { ...a, name } : a)),
		useCases: d.useCases.map((u) => ({ ...u, actors: u.actors.map((a) => renamed(a, from, name)) })),
		flows: d.flows.map((f) => ({ ...f, steps: f.steps.map((s) => ({ ...s, lane: renamed(s.lane, from, name) })) }))
	};
}

export const setActorKind = (d: FunctionalDiagram, name: string, kind: DiagramActorKind): FunctionalDiagram => ({
	...d,
	actors: d.actors.map((a) => (sameName(a.name, name) ? { ...a, kind } : a))
});

/** Gone from the use cases; the steps it did stay, pointed out as done by nobody declared. */
export const removeActor = (d: FunctionalDiagram, name: string): FunctionalDiagram => ({
	...d,
	actors: d.actors.filter((a) => !sameName(a.name, name)),
	useCases: d.useCases.map((u) => ({ ...u, actors: u.actors.filter((a) => !sameName(a, name)) }))
});

export function setTakesPart(d: FunctionalDiagram, actor: string, useCase: string, takesPart: boolean): FunctionalDiagram {
	return {
		...d,
		useCases: d.useCases.map((u) => {
			if (!sameName(u.name, useCase)) return u;
			const has = u.actors.some((a) => sameName(a, actor));
			if (takesPart === has) return u;
			return { ...u, actors: takesPart ? [...u.actors, actor] : u.actors.filter((a) => !sameName(a, actor)) };
		})
	};
}

export function addUseCase(d: FunctionalDiagram, actors: readonly string[] = [], lang: SpecLanguage = 'en'): { diagram: FunctionalDiagram; name: string } {
	const name = freshName(newNames(lang).useCase, d.useCases.map((u) => u.name));
	return { diagram: { ...d, useCases: [...d.useCases, { name, actors: [...actors] }] }, name };
}

export function renameUseCase(d: FunctionalDiagram, from: string, to: string): FunctionalDiagram {
	if (renameRefusal(to, from, d.useCases.map((u) => u.name))) return d;
	const name = to.trim();
	return {
		...d,
		useCases: d.useCases.map((u) => (sameName(u.name, from) ? { ...u, name } : u)),
		flows: d.flows.map((f) => (sameName(f.useCase, from) ? { ...f, useCase: name } : f))
	};
}

/** A use case linked to a feature the product already has, or unlinked with null (ac-evo-func-uml-link). */
export const linkUseCase = (d: FunctionalDiagram, name: string, link: DiagramLink | null): FunctionalDiagram => ({
	...d,
	useCases: d.useCases.map((u) => (sameName(u.name, name) ? withLink(u, link) : u))
});

/** A use case leaves with its flow. */
export const removeUseCase = (d: FunctionalDiagram, name: string): FunctionalDiagram => ({
	...d,
	useCases: d.useCases.filter((u) => !sameName(u.name, name)),
	flows: d.flows.filter((f) => !sameName(f.useCase, name))
});

export const flowOf = (d: FunctionalDiagram, useCase: string): DiagramFlow | null => d.flows.find((f) => sameName(f.useCase, useCase)) ?? null;

/** The flow of a use case, its steps rewritten by `change`; a use case without a flow gets one. */
function withSteps(d: FunctionalDiagram, useCase: string, change: (steps: readonly DiagramStep[]) => readonly DiagramStep[]): FunctionalDiagram {
	const flow = flowOf(d, useCase);
	if (!flow) return { ...d, flows: [...d.flows, { useCase, steps: change([]) }] };
	const steps = change(flow.steps);
	return { ...d, flows: d.flows.map((f) => (f === flow ? { ...f, steps } : f)) };
}

/** Whoever does a step takes part in its use case: choosing a lane links it (ac-evo-func-uml-edit). */
const joining = (d: FunctionalDiagram, useCase: string, lane: string): FunctionalDiagram =>
	sameName(lane, PRODUCT_LANE) || !d.actors.some((a) => sameName(a.name, lane)) ? d : setTakesPart(d, lane, useCase, true);

/**
 * A new step after `after` (or at the end). Unless a lane is given, it takes
 * the turn a flow usually takes: after someone acts the product answers, after
 * the product (or at the start) the first who takes part in the use case acts.
 */
export function addStep(d: FunctionalDiagram, useCase: string, after: number | null, lane?: string, lang: SpecLanguage = 'en'): { diagram: FunctionalDiagram; index: number } {
	const steps = flowOf(d, useCase)?.steps ?? [];
	const index = after === null ? steps.length : Math.min(after + 1, steps.length);
	const before = steps[index - 1];
	const firstTakingPart = d.useCases.find((u) => sameName(u.name, useCase))?.actors[0] ?? PRODUCT_LANE;
	const who = lane ?? (before && !sameName(before.lane, PRODUCT_LANE) ? PRODUCT_LANE : firstTakingPart);
	const step: DiagramStep = { lane: who, text: newNames(lang).step, branches: [] };
	const diagram = withSteps(joining(d, useCase, who), useCase, (s) => [...s.slice(0, index), step, ...s.slice(index)]);
	return { diagram, index };
}

export function updateStep(d: FunctionalDiagram, useCase: string, index: number, patch: { lane?: string; text?: string }): FunctionalDiagram {
	const next = patch.lane ? joining(d, useCase, patch.lane) : d;
	return withSteps(next, useCase, (steps) =>
		steps.map((s, i) => (i === index ? { ...s, ...(patch.lane ? { lane: patch.lane } : {}), ...(patch.text !== undefined ? { text: patch.text } : {}) } : s))
	);
}

/** A step linked to an action the product already has, the existing process it uses, or unlinked with null. */
export const linkStep = (d: FunctionalDiagram, useCase: string, index: number, link: DiagramLink | null): FunctionalDiagram =>
	withSteps(d, useCase, (steps) => steps.map((s, i) => (i === index ? withLink(s, link) : s)));

export function moveStep(d: FunctionalDiagram, useCase: string, index: number, by: -1 | 1): FunctionalDiagram {
	return withSteps(d, useCase, (steps) => {
		const to = index + by;
		if (to < 0 || to >= steps.length) return steps;
		const out = [...steps];
		[out[index], out[to]] = [out[to], out[index]];
		return out;
	});
}

export const removeStep = (d: FunctionalDiagram, useCase: string, index: number): FunctionalDiagram =>
	withSteps(d, useCase, (steps) => steps.filter((_, i) => i !== index));

const withBranches = (d: FunctionalDiagram, useCase: string, index: number, change: (b: readonly DiagramBranch[]) => readonly DiagramBranch[]) =>
	withSteps(d, useCase, (steps) => steps.map((s, i) => (i === index ? { ...s, branches: change(s.branches) } : s)));

export const addBranch = (d: FunctionalDiagram, useCase: string, index: number, kind: DiagramBranchKind): FunctionalDiagram =>
	withBranches(d, useCase, index, (b) => [...b, { kind, when: '', then: '' }]);

export const updateBranch = (d: FunctionalDiagram, useCase: string, index: number, branch: number, patch: Partial<DiagramBranch>): FunctionalDiagram =>
	withBranches(d, useCase, index, (b) => b.map((x, i) => (i === branch ? { ...x, ...patch } : x)));

export const removeBranch = (d: FunctionalDiagram, useCase: string, index: number, branch: number): FunctionalDiagram =>
	withBranches(d, useCase, index, (b) => b.filter((_, i) => i !== branch));

export function addMachine(d: FunctionalDiagram, lang: SpecLanguage = 'en'): { diagram: FunctionalDiagram; object: string } {
	const object = freshName(newNames(lang).thing, d.machines.map((m) => m.object));
	return { diagram: { ...d, machines: [...d.machines, { object, states: [newNames(lang).firstState], transitions: [] }] }, object };
}

export const machineOf = (d: FunctionalDiagram, object: string): DiagramMachine | null => d.machines.find((m) => sameName(m.object, object)) ?? null;

function withMachine(d: FunctionalDiagram, object: string, change: (m: DiagramMachine) => DiagramMachine): FunctionalDiagram {
	return { ...d, machines: d.machines.map((m) => (sameName(m.object, object) ? change(m) : m)) };
}

export function renameMachine(d: FunctionalDiagram, from: string, to: string): FunctionalDiagram {
	if (renameRefusal(to, from, d.machines.map((m) => m.object))) return d;
	return withMachine(d, from, (m) => ({ ...m, object: to.trim() }));
}

export const removeMachine = (d: FunctionalDiagram, object: string): FunctionalDiagram => ({
	...d,
	machines: d.machines.filter((m) => !sameName(m.object, object))
});

export function addState(d: FunctionalDiagram, object: string, lang: SpecLanguage = 'en'): { diagram: FunctionalDiagram; name: string } {
	const machine = machineOf(d, object);
	const name = freshName(newNames(lang).state, machine?.states ?? []);
	return { diagram: withMachine(d, object, (m) => ({ ...m, states: [...m.states, name] })), name };
}

export function renameState(d: FunctionalDiagram, object: string, from: string, to: string): FunctionalDiagram {
	const machine = machineOf(d, object);
	if (!machine || renameRefusal(to, from, machine.states)) return d;
	const name = to.trim();
	return withMachine(d, object, (m) => ({
		...m,
		states: m.states.map((s) => renamed(s, from, name)),
		transitions: m.transitions.map((t) => ({ ...t, from: renamed(t.from, from, name), to: renamed(t.to, from, name) }))
	}));
}

/** A state leaves with the transitions that join it. */
export const removeState = (d: FunctionalDiagram, object: string, name: string): FunctionalDiagram =>
	withMachine(d, object, (m) => ({
		...m,
		states: m.states.filter((s) => !sameName(s, name)),
		transitions: m.transitions.filter((t) => !sameName(t.from, name) && !sameName(t.to, name))
	}));

/** Where the thing starts: that state moves first. */
export const setInitialState = (d: FunctionalDiagram, object: string, name: string): FunctionalDiagram =>
	withMachine(d, object, (m) => ({ ...m, states: [...m.states.filter((s) => sameName(s, name)), ...m.states.filter((s) => !sameName(s, name))] }));

/** A transition from `from`, to the next state it does not reach yet (or itself when it reaches them all). */
/**
 * A new transition, read the way states are made one after another
 * (ac-evo-func-uml-edit): it leads to the state selected from the one created
 * before it; when that one already leads there, or the first state is
 * selected, it leaves the state selected (the first one when none is) for a
 * state it does not reach yet.
 */
export function addTransition(d: FunctionalDiagram, object: string, selected?: string): { diagram: FunctionalDiagram; index: number } {
	const machine = machineOf(d, object);
	if (!machine || machine.states.length === 0) return { diagram: d, index: -1 };
	const at = selected ? machine.states.findIndex((s) => sameName(s, selected)) : -1;
	const before = at > 0 ? machine.states[at - 1] : null;
	if (before && !machine.transitions.some((t) => sameName(t.from, before) && sameName(t.to, machine.states[at]))) {
		const transition: DiagramTransition = { from: before, to: machine.states[at], trigger: '' };
		return { diagram: withMachine(d, object, (m) => ({ ...m, transitions: [...m.transitions, transition] })), index: machine.transitions.length };
	}
	const source = at >= 0 ? machine.states[at] : machine.states[0];
	const reached = machine.transitions.filter((t) => sameName(t.from, source)).map((t) => t.to);
	const target = machine.states.find((s) => !sameName(s, source) && !reached.some((r) => sameName(r, s))) ?? source;
	const transition: DiagramTransition = { from: source, to: target, trigger: '' };
	return { diagram: withMachine(d, object, (m) => ({ ...m, transitions: [...m.transitions, transition] })), index: machine.transitions.length };
}

export const updateTransition = (d: FunctionalDiagram, object: string, index: number, patch: Partial<DiagramTransition>): FunctionalDiagram =>
	withMachine(d, object, (m) => ({ ...m, transitions: m.transitions.map((t, i) => (i === index ? { ...t, ...patch } : t)) }));

export const removeTransition = (d: FunctionalDiagram, object: string, index: number): FunctionalDiagram =>
	withMachine(d, object, (m) => ({ ...m, transitions: m.transitions.filter((_, i) => i !== index) }));
