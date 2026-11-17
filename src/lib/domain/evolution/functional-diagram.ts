import { linkSuffix, trailingLink, type DiagramLink } from './diagram-links';

/**
 * The diagram of the Functional spec, in UML (ac-evo-func-uml): three views of
 * one drawing. Use cases say who takes part and what the product offers them;
 * flows walk each use case through, in swimlanes, with the ways out where the
 * product refuses or something goes wrong; states say what each thing the
 * change moves goes through.
 *
 * The diagram is words arranged, never an image (ac-evo-func-uml-text): it is
 * kept as a short notation, one line per element, which is the value of an
 * answer of the step. The page edits it through the drawing or as text, an AI
 * client writes it with answer_step, and the answer keeps its versions,
 * validations and thread like any other.
 *
 *   actor Baker
 *   system SMS provider
 *
 *   use case Mark a bag ready: Baker, SMS provider
 *
 *   flow Mark a bag ready
 *     Baker: marks the bag ready
 *     Product: sends one text with the pickup slot
 *       refused when the order has no phone number: the baker sees "no number on file"
 *       goes wrong when the SMS provider is down: the text is retried for an hour
 *
 *   states Order
 *     placed -> ready: Mark a bag ready
 *     ready -> collected: the customer picks it up
 *
 * Reading never refuses: a line the notation does not read, or a name drawn
 * without being declared, is a problem pointed out, and the rest is drawn.
 */

/** The answer of the Functional spec that holds the diagram. */
export const FUNCTIONAL_DIAGRAM_KEY = 'diagram';
/** The lane of what the product does itself, in every flow. */
export const PRODUCT_LANE = 'Product';

export type DiagramActorKind = 'person' | 'system';
export interface DiagramActor {
	readonly name: string;
	readonly kind: DiagramActorKind;
}
export interface DiagramUseCase {
	readonly name: string;
	/** Who takes part, by name. */
	readonly actors: readonly string[];
	/** The feature the product already has that it is (ac-evo-func-uml-link). */
	readonly link?: DiagramLink;
}
export type DiagramBranchKind = 'refused' | 'goes_wrong';
/** A way out of a step: when it happens, and what then happens, which ends there. */
export interface DiagramBranch {
	readonly kind: DiagramBranchKind;
	readonly when: string;
	readonly then: string;
}
export interface DiagramStep {
	/** Who does it: a person or a system by name, or the product. */
	readonly lane: string;
	readonly text: string;
	readonly branches: readonly DiagramBranch[];
	/** The action the product already has that this step is: the existing process it uses (ac-evo-func-uml-link). */
	readonly link?: DiagramLink;
}
export interface DiagramFlow {
	/** The use case it walks through. */
	readonly useCase: string;
	readonly steps: readonly DiagramStep[];
}
export interface DiagramTransition {
	readonly from: string;
	readonly to: string;
	/** What causes it, in words; may be empty. */
	readonly trigger: string;
}
/** The states of one thing the change moves; the first one is where it starts. */
export interface DiagramMachine {
	readonly object: string;
	readonly states: readonly string[];
	readonly transitions: readonly DiagramTransition[];
}
export interface FunctionalDiagram {
	readonly actors: readonly DiagramActor[];
	readonly useCases: readonly DiagramUseCase[];
	readonly flows: readonly DiagramFlow[];
	readonly machines: readonly DiagramMachine[];
}
/**
 * An element of a drawing a problem sits on (ac-evo-func-uml-text): the page
 * links to it and marks it. The functional diagram's elements first, then the
 * technical diagram's (ac-evo-tech-uml).
 */
export type DiagramPlace =
	| { readonly kind: 'actor'; readonly name: string }
	| { readonly kind: 'use_case'; readonly name: string }
	| { readonly kind: 'flow'; readonly useCase: string }
	| { readonly kind: 'step'; readonly useCase: string; readonly index: number }
	| { readonly kind: 'transition'; readonly object: string; readonly index: number }
	| { readonly kind: 'element'; readonly name: string }
	| { readonly kind: 'link'; readonly index: number }
	| { readonly kind: 'note'; readonly index: number }
	| { readonly kind: 'message'; readonly sequence: string; readonly index: number };

/** Something pointed out, never a refusal: its line when it comes from the text. */
export interface DiagramProblem {
	readonly line: number | null;
	readonly message: string;
	/** What it sits on in the drawing: its link leads to the first, the drawing marks them all. */
	readonly at?: readonly DiagramPlace[];
}

export const EMPTY_FUNCTIONAL_DIAGRAM: FunctionalDiagram = { actors: [], useCases: [], flows: [], machines: [] };

/** Two names are the same whatever their case and spacing. */
export const sameName = (a: string, b: string): boolean => normalName(a).toLowerCase() === normalName(b).toLowerCase();
const normalName = (name: string): string => name.replace(/\s+/g, ' ').trim();
/** The text before the first colon, and the rest after it. */
function splitAtColon(text: string): [string, string | null] {
	const at = text.indexOf(':');
	return at < 0 ? [text.trim(), null] : [text.slice(0, at).trim(), text.slice(at + 1).trim()];
}

export const isEmptyDiagram = (diagram: FunctionalDiagram): boolean =>
	diagram.actors.length === 0 && diagram.useCases.length === 0 && diagram.flows.length === 0 && diagram.machines.length === 0;

const TOP = [
	{ word: 'actor', re: /^actor\s+(.+)$/i },
	{ word: 'system', re: /^system\s+(.+)$/i },
	{ word: 'use case', re: /^use\s+case\s+(.+)$/i },
	{ word: 'flow', re: /^flow\s+(.+)$/i },
	{ word: 'states', re: /^states\s+(.+)$/i }
] as const;
const BRANCH = [
	{ kind: 'refused' as const, re: /^refused\s+when\s+(.+)$/i },
	{ kind: 'goes_wrong' as const, re: /^goes\s+wrong\s+when\s+(.+)$/i }
];

interface Building {
	actors: DiagramActor[];
	useCases: { name: string; actors: string[]; link?: DiagramLink }[];
	flows: { useCase: string; steps: { lane: string; text: string; branches: DiagramBranch[]; link?: DiagramLink }[] }[];
	machines: { object: string; states: string[]; transitions: DiagramTransition[] }[];
}

/**
 * Read the notation into the diagram it draws, with every line it could not
 * read. A block (a flow, a thing's states) runs until the next top-level line,
 * so indentation helps the eye and never changes the meaning.
 */
export function readFunctionalDiagram(text: string): { diagram: FunctionalDiagram; problems: DiagramProblem[] } {
	const out: Building = { actors: [], useCases: [], flows: [], machines: [] };
	const problems: DiagramProblem[] = [];
	let block: { kind: 'top' } | { kind: 'flow'; index: number } | { kind: 'states'; index: number } = { kind: 'top' };
	const lines = text.split('\n');
	lines.forEach((raw, i) => {
		const line = i + 1;
		const trimmed = raw.trim();
		if (trimmed === '') return;
		const top = TOP.map((t) => ({ word: t.word, match: trimmed.match(t.re) })).find((t) => t.match);
		if (top?.match) {
			const rest = top.match[1].trim();
			if (top.word === 'actor' || top.word === 'system') {
				const name = normalName(rest);
				if (sameName(name, PRODUCT_LANE)) problems.push({ line, message: `"${PRODUCT_LANE}" is the product's own lane: name the person or the system otherwise.` });
				else if (out.actors.some((a) => sameName(a.name, name))) problems.push({ line, message: `"${name}" is declared twice: the first one is kept.` });
				else out.actors.push({ name, kind: top.word === 'actor' ? 'person' : 'system' });
				block = { kind: 'top' };
			} else if (top.word === 'use case') {
				const { rest: declared, link } = trailingLink(rest);
				const [name, who] = splitAtColon(declared);
				const actors = (who ?? '').split(',').map(normalName).filter((n) => n !== '');
				const existing = out.useCases.find((u) => sameName(u.name, name));
				if (existing) {
					problems.push({ line, message: `The use case "${normalName(name)}" is declared twice: who takes part in both is kept.` });
					for (const a of actors) if (!existing.actors.some((x) => sameName(x, a))) existing.actors.push(a);
					existing.link ??= link ?? undefined;
				} else out.useCases.push({ name: normalName(name), actors, ...(link ? { link } : {}) });
				block = { kind: 'top' };
			} else if (top.word === 'flow') {
				const useCase = normalName(rest.replace(/:$/, ''));
				let index = out.flows.findIndex((f) => sameName(f.useCase, useCase));
				if (index < 0) index = out.flows.push({ useCase, steps: [] }) - 1;
				else problems.push({ line, message: `The flow of "${useCase}" is written twice: its steps are read one after the other.` });
				block = { kind: 'flow', index };
			} else {
				const object = normalName(rest.replace(/:$/, ''));
				let index = out.machines.findIndex((m) => sameName(m.object, object));
				if (index < 0) index = out.machines.push({ object, states: [], transitions: [] }) - 1;
				else problems.push({ line, message: `The states of "${object}" are written twice: they are read one after the other.` });
				block = { kind: 'states', index };
			}
			return;
		}
		if (block.kind === 'flow') {
			const flow = out.flows[block.index];
			const branch = BRANCH.map((b) => ({ kind: b.kind, match: trimmed.match(b.re) })).find((b) => b.match);
			if (branch?.match) {
				const step = flow.steps.at(-1);
				if (!step) {
					problems.push({ line, message: 'A way out belongs to the step above it: write the step first.' });
					return;
				}
				const [when, then] = splitAtColon(branch.match[1]);
				step.branches.push({ kind: branch.kind, when, then: then ?? '' });
				return;
			}
			const { rest: said, link } = trailingLink(trimmed);
			const [lane, what] = splitAtColon(said);
			if (what === null || lane === '') {
				problems.push({ line, message: `Say who does this step, then what they do: "Baker: marks the bag ready".` });
				return;
			}
			flow.steps.push({ lane: normalName(lane), text: what, branches: [], ...(link ? { link } : {}) });
			return;
		}
		if (block.kind === 'states') {
			const machine = out.machines[block.index];
			const arrow = trimmed.indexOf('->');
			const meet = (state: string) => {
				if (!machine.states.some((s) => sameName(s, state))) machine.states.push(state);
			};
			if (arrow >= 0) {
				const from = normalName(trimmed.slice(0, arrow));
				const [to, trigger] = splitAtColon(trimmed.slice(arrow + 2));
				if (from === '' || to === '') {
					problems.push({ line, message: 'A transition joins two states: "placed -> ready: what causes it".' });
					return;
				}
				meet(from);
				meet(normalName(to));
				machine.transitions.push({ from, to: normalName(to), trigger: trigger ?? '' });
				return;
			}
			if (trimmed.includes(':')) {
				problems.push({ line, message: 'A state is a name alone, a transition is "from -> to: what causes it".' });
				return;
			}
			meet(normalName(trimmed));
			return;
		}
		problems.push({ line, message: `Not read: start the line with ${TOP.map((t) => t.word).join(', ')}.` });
	});
	return { diagram: settleNames(out), problems };
}

/**
 * A name written in another case than where it is declared reads as the
 * declared one, so "baker" in a lane is the Baker of the use cases.
 */
function settleNames(built: Building): FunctionalDiagram {
	const actorName = (name: string) => (sameName(name, PRODUCT_LANE) ? PRODUCT_LANE : (built.actors.find((a) => sameName(a.name, name))?.name ?? name));
	const useCaseName = (name: string) => built.useCases.find((u) => sameName(u.name, name))?.name ?? name;
	return {
		actors: built.actors,
		useCases: built.useCases.map((u) => ({ ...u, actors: u.actors.map(actorName) })),
		flows: built.flows.map((f) => ({ useCase: useCaseName(f.useCase), steps: f.steps.map((s) => ({ ...s, lane: actorName(s.lane) })) })),
		machines: built.machines.map((m) => {
			const stateName = (name: string) => m.states.find((s) => sameName(s, name)) ?? name;
			return { object: m.object, states: m.states, transitions: m.transitions.map((t) => ({ ...t, from: stateName(t.from), to: stateName(t.to) })) };
		})
	};
}

/**
 * The notation of a diagram, in one canonical layout: who first, then the use
 * cases, then each flow and each thing's states. The first state is written
 * first, so it stays where the thing starts.
 */
export function writeFunctionalDiagram(diagram: FunctionalDiagram): string {
	const blocks: string[][] = [];
	if (diagram.actors.length > 0) blocks.push(diagram.actors.map((a) => `${a.kind === 'person' ? 'actor' : 'system'} ${a.name}`));
	if (diagram.useCases.length > 0) blocks.push(diagram.useCases.map((u) => `use case ${u.name}${u.actors.length > 0 ? `: ${u.actors.join(', ')}` : ''}${linkSuffix(u.link)}`));
	for (const flow of diagram.flows) {
		const lines = [`flow ${flow.useCase}`];
		for (const step of flow.steps) {
			lines.push(`  ${step.lane}: ${step.text}${linkSuffix(step.link)}`);
			for (const b of step.branches) lines.push(`    ${b.kind === 'refused' ? 'refused when' : 'goes wrong when'} ${b.when}${b.then !== '' ? `: ${b.then}` : ''}`);
		}
		blocks.push(lines);
	}
	for (const machine of diagram.machines) {
		const lines = [`states ${machine.object}`];
		const first = machine.states[0];
		if (first && !sameName(machine.transitions[0]?.from ?? '', first)) lines.push(`  ${first}`);
		for (const t of machine.transitions) lines.push(`  ${t.from} -> ${t.to}${t.trigger !== '' ? `: ${t.trigger}` : ''}`);
		const joined = new Set(machine.transitions.flatMap((t) => [t.from.toLowerCase(), t.to.toLowerCase()]));
		for (const state of machine.states.slice(1)) if (!joined.has(state.toLowerCase())) lines.push(`  ${state}`);
		blocks.push(lines);
	}
	return blocks.map((b) => b.join('\n')).join('\n\n');
}

/**
 * What the drawing names without declaring, or leaves without a way to read
 * it: pointed out by name, never refused (ac-evo-func-uml-text).
 */
export function functionalDiagramProblems(diagram: FunctionalDiagram): DiagramProblem[] {
	const out: DiagramProblem[] = [];
	const say = (message: string, at: readonly DiagramPlace[]) => out.push({ line: null, message, at });
	const declared = (name: string) => diagram.actors.some((a) => sameName(a.name, name));
	for (const u of diagram.useCases) {
		const useCase = { kind: 'use_case', name: u.name } as const;
		if (u.actors.length === 0) say(`Nobody takes part in "${u.name}".`, [useCase]);
		for (const a of u.actors)
			if (!declared(a)) say(`"${a}" takes part in "${u.name}" without being declared: add it as a person or a system.`, [{ kind: 'actor', name: a }, useCase]);
	}
	for (const flow of diagram.flows) {
		const useCase = diagram.useCases.find((u) => sameName(u.name, flow.useCase));
		if (!useCase) say(`The flow "${flow.useCase}" is the flow of no use case: add the use case "${flow.useCase}".`, [{ kind: 'flow', useCase: flow.useCase }]);
		const stepAt = (index: number) => ({ kind: 'step', useCase: flow.useCase, index }) as const;
		// A lane is said once, on every step it does.
		const lanes = new Map<string, number[]>();
		flow.steps.forEach((step, index) => {
			if (sameName(step.lane, PRODUCT_LANE)) return;
			const key = step.lane.toLowerCase();
			lanes.set(key, [...(lanes.get(key) ?? []), index]);
		});
		for (const indexes of lanes.values()) {
			const lane = flow.steps[indexes[0]].lane;
			const at = indexes.map(stepAt);
			if (!declared(lane)) say(`"${lane}" does a step of "${flow.useCase}" without being declared.`, at);
			else if (useCase && !useCase.actors.some((a) => sameName(a, lane))) say(`"${lane}" acts in the flow of "${flow.useCase}" but does not take part in it.`, at);
		}
		flow.steps.forEach((step, index) => {
			for (const b of step.branches)
				if (b.when === '' || b.then === '')
					say(`A way out of "${step.text}" does not say ${b.when === '' ? 'when it happens' : 'what then happens'}.`, [stepAt(index)]);
		});
	}
	// Two arrows between the same two states read as one thing said twice: both are marked, the later one first.
	for (const machine of diagram.machines) {
		const first = new Map<string, number>();
		machine.transitions.forEach((t, index) => {
			const pair = `${t.from.toLowerCase()}\u0000${t.to.toLowerCase()}`;
			const earlier = first.get(pair);
			if (earlier === undefined) return void first.set(pair, index);
			say(`Two arrows go from "${t.from}" to "${t.to}" in the states of "${machine.object}": keep one and give it both causes.`, [
				{ kind: 'transition', object: machine.object, index },
				{ kind: 'transition', object: machine.object, index: earlier }
			]);
		});
	}
	return out;
}

/** The words the diagram says, without its keywords: what the glossary reads (ac-evo-func-uml-text). */
export function functionalDiagramWords(text: string): string {
	const { diagram } = readFunctionalDiagram(text);
	return [
		...diagram.actors.map((a) => a.name),
		...diagram.useCases.map((u) => u.name),
		...diagram.flows.flatMap((f) => f.steps.flatMap((s) => [s.text, ...s.branches.flatMap((b) => [b.when, b.then])])),
		...diagram.machines.flatMap((m) => [m.object, ...m.states, ...m.transitions.map((t) => t.trigger)])
	]
		.filter((w) => w !== '')
		.join('\n');
}

/** What a diagram holds, counted, for one line that sums it up. */
export function functionalDiagramCounts(diagram: FunctionalDiagram) {
	const steps = diagram.flows.flatMap((f) => f.steps);
	const branches = steps.flatMap((s) => s.branches);
	return {
		people: diagram.actors.filter((a) => a.kind === 'person').length,
		systems: diagram.actors.filter((a) => a.kind === 'system').length,
		useCases: diagram.useCases.length,
		flows: diagram.flows.length,
		steps: steps.length,
		refusals: branches.filter((b) => b.kind === 'refused').length,
		failures: branches.filter((b) => b.kind === 'goes_wrong').length,
		things: diagram.machines.length,
		states: diagram.machines.reduce((n, m) => n + m.states.length, 0),
		transitions: diagram.machines.reduce((n, m) => n + m.transitions.length, 0)
	};
}

/**
 * The lanes of a flow, left to right: the people who act in it, the product,
 * then the other systems, each once, in the order they first act.
 */
export function flowLanes(diagram: FunctionalDiagram, flow: DiagramFlow): { name: string; kind: DiagramActorKind | 'product' }[] {
	const kindOf = (name: string): DiagramActorKind => diagram.actors.find((a) => sameName(a.name, name))?.kind ?? 'person';
	const names: string[] = [];
	for (const step of flow.steps) if (!names.some((n) => sameName(n, step.lane))) names.push(step.lane);
	const others = names.filter((n) => !sameName(n, PRODUCT_LANE));
	return [
		...others.filter((n) => kindOf(n) === 'person').map((name) => ({ name, kind: 'person' as const })),
		{ name: PRODUCT_LANE, kind: 'product' as const },
		...others.filter((n) => kindOf(n) === 'system').map((name) => ({ name, kind: 'system' as const }))
	];
}

/**
 * Who starts a use case (ac-evo-func-uml): whoever does the first step of its
 * flow, unless the product does it; otherwise the first one named on it.
 */
export function startedBy(diagram: FunctionalDiagram, useCase: string): string | null {
	const named = diagram.useCases.find((u) => sameName(u.name, useCase))?.actors ?? [];
	const first = diagram.flows.find((f) => sameName(f.useCase, useCase))?.steps[0]?.lane;
	if (first && !sameName(first, PRODUCT_LANE)) return named.find((a) => sameName(a, first)) ?? first;
	return named[0] ?? null;
}
