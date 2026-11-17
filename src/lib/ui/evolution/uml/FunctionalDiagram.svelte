<script lang="ts">
	import { untrack } from 'svelte';
	import { DiagramEnlarger, PanZoom, PanZoomCanvas } from '$ui/design-system';
	import { READABLE_ZOOM, READING_MAX_FIT, readingCanvasHeight } from './layout';
	import {
		addActor,
		addMachine,
		addState,
		addStep,
		addTransition,
		addUseCase,
		flowOf,
		functionalDiagramProblems,
		functionalLinks,
		goneLinkProblems,
		isEmptyDiagram,
		readFunctionalDiagram,
		sameName,
		writeFunctionalDiagram,
		type DiagramPlace,
		type DrawableStep
	} from '$domain/evolution';
	import UseCaseView from './UseCaseView.svelte';
	import FlowView from './FlowView.svelte';
	import DrawingList, { type DrawingEntry } from './DrawingList.svelte';
	import BesideDrawing from './BesideDrawing.svelte';
	import AddMenu, { type AddEntry } from './AddMenu.svelte';
	import EmptyDrawing from './EmptyDrawing.svelte';
	import StateView from './StateView.svelte';
	import DiagramInspector from './DiagramInspector.svelte';
	import DiagramFrame from './DiagramFrame.svelte';
	import { DiagramDraft } from './diagram-draft.svelte';
	import type { DiagramLinkStatus } from './link-status.svelte';
	import type { DiagramSelection, DiagramView } from './selection';
	import { alphabetical, diagramWords } from './words';
	import type { SpecLanguage } from '$domain/language';
	import type { PageDiagramDraft } from '../page-edit';

	/**
	 * The Functional spec's diagram, in UML (ac-evo-func-uml): use cases, one
	 * flow per use case in swimlanes, the states of each thing the change moves.
	 * Edited on the page and never drawn by hand (ac-evo-func-uml-edit): a click
	 * selects an element and opens its fields, the toolbar adds what each view
	 * holds, the layout is computed. Edits stay here until saved as one new
	 * version; the notation opens beside it as text (ac-evo-func-uml-text).
	 */
	interface Props {
		/** The saved notation. */
		value: string;
		editable: boolean;
		/** The frame of the use cases is named after the product. */
		productName: string;
		/** The spec's language: the diagram draws its words in it (ac-evo-form-spec-language). */
		lang?: SpecLanguage;
		/** Set while a text of the step says something the diagram was not drawn from (ac-evo-func-uml-sync). */
		behind?: { readonly prompt: string; readonly step?: DrawableStep } | null;
		/** The built-in assistant's offer to draw it from the texts, where it is on (ac-evo-diagram-assistant). */
		assist?: { readonly run: () => void; readonly drawing: boolean; readonly failure?: string | null } | null;
		/** An earlier version the reader looks at in place of this one: drawn read only, the view kept (ac-evo-hist-field-versions). */
		earlier?: string | null;
		save: (value: string) => Promise<boolean>;
		/** Saves a drawing made by hand while the diagram is behind its texts: it catches the diagram up, no text falling behind (ac-evo-func-uml-sync). */
		redraw?: (value: string) => Promise<boolean>;
		/** Where the links to the product open: offered on the fields, drawn, and pointed out once gone (ac-evo-func-uml-link). */
		links?: DiagramLinkStatus;
		/** The view it opens on: its use cases, or its flows where it is read as the user journey. */
		initialView?: DiagramView;
		pageEditing?: boolean;
		onDraft?: (draft: PageDiagramDraft | null) => void;
	}
	let { value, editable: editableProp, productName, lang = 'en', behind = null, assist = null, earlier = null, save, redraw, links, initialView = 'use_cases', pageEditing = false, onDraft }: Props = $props();
	// Nothing is edited on an earlier version: it is read, in the view the reader was in.
	const editable = $derived(editableProp && earlier === null);
	const words = $derived(diagramWords(lang));

	const draft = new DiagramDraft({ read: readFunctionalDiagram, write: writeFunctionalDiagram, check: functionalDiagramProblems }, () => value, () => earlier);
	const diagram = $derived(draft.diagram);
	/** What the diagram reads unclear, a link to what the product no longer has among it. */
	const problems = $derived([...draft.problems, ...(links ? goneLinkProblems(functionalLinks(diagram), (ref) => links.hrefOf(ref)) : [])]);
	let wasPageEditing = $state(false);
	$effect(() => {
		const active = pageEditing;
		const pending = active && editable && draft.dirty
			? { value: draft.notation.trim(), redraw: !!behind, invalid: problems.length > 0 }
			: null;
		untrack(() => {
			if (wasPageEditing && !active) draft.discard();
			if (active) onDraft?.(pending);
			wasPageEditing = active;
		});
	});
	$effect(() => {
		if (links) void links.load(functionalLinks(diagram).map((l) => l.link.ref));
	});

	let view = $state<DiagramView>(untrack(() => initialView));
	let selection = $state.raw<DiagramSelection | null>(null);
	// A selected element may not exist in the other version: moving between versions drops the selection, never the view.
	$effect(() => {
		void earlier;
		selection = null;
	});
	let chosenFlow = $state<string | null>(null);
	let chosenMachine = $state<string | null>(null);
	// Drawing by hand a diagram behind its texts, and how many elements were added (each opens its fields to be named).
	let byHand = $state(false);
	let added = $state(0);

	// Listed beside the drawing in alphabetical order, the first one drawn when the view opens (ac-evo-func-uml).
	const flowNames = $derived(
		alphabetical(
			[
				...diagram.useCases.map((u) => u.name),
				...diagram.flows.filter((f) => !diagram.useCases.some((u) => sameName(u.name, f.useCase))).map((f) => f.useCase)
			],
			lang
		)
	);
	const flowName = $derived(flowNames.find((n) => chosenFlow && sameName(n, chosenFlow)) ?? flowNames[0] ?? null);
	const flow = $derived(flowName ? (flowOf(diagram, flowName) ?? { useCase: flowName, steps: [] }) : null);
	const machineNames = $derived(alphabetical(diagram.machines.map((m) => m.object), lang));
	const machine = $derived(
		diagram.machines.find((m) => sameName(m.object, machineNames.find((n) => chosenMachine && sameName(n, chosenMachine)) ?? machineNames[0] ?? '')) ?? null
	);
	/** What the view shown draws, in plain words (ac-diag-title). */
	const title = $derived(view === 'use_cases' ? words.titles.useCases(productName) : view === 'flows' ? words.titles.flow(flowName) : words.titles.states(machine?.object ?? null));

	const edit = (change: Parameters<typeof draft.edit>[0]) => draft.edit(change);
	function pick(next: DiagramSelection) {
		// Read only, a use case still opens its flow.
		if (!editable) {
			if (next.kind === 'use_case') openFlow(next.name);
			return;
		}
		selection = next;
	}
	function pickFlow(useCase: string) {
		chosenFlow = useCase;
		selection = null;
		pan.refit();
	}
	function pickMachine(object: string) {
		chosenMachine = object;
		selection = null;
		pan.refit();
	}
	function openFlow(useCase: string) {
		chosenFlow = useCase;
		selection = null;
		switchView('flows');
	}
	function switchView(next: DiagramView) {
		view = next;
		if (selection && !(next === 'use_cases' ? ['actor', 'use_case'] : next === 'flows' ? ['step', 'actor'] : ['machine', 'state', 'transition']).includes(selection.kind))
			selection = null;
		pan.refit();
	}
	/** Every element a problem sits on: each view marks its own (ac-evo-func-uml-text). */
	const marks = $derived(problems.flatMap((p) => p.at ?? []));
	/** A problem's link: the view that holds its element, on its flow or its thing, the element selected. */
	function locate(place: DiagramPlace) {
		switch (place.kind) {
			case 'actor':
			case 'use_case':
				switchView('use_cases');
				selection = place;
				break;
			case 'flow':
			case 'step':
				chosenFlow = place.useCase;
				switchView('flows');
				selection = place.kind === 'step' ? place : null;
				break;
			case 'transition':
				chosenMachine = place.object;
				switchView('states');
				selection = place;
				break;
		}
	}
	/** A drawing made while the diagram is behind its texts catches it up; otherwise it is the source, and the texts it changes fall behind (ac-evo-func-uml-sync). */
	async function commit() {
		const write = behind && redraw ? redraw : save;
		const notation = draft.notation.trim();
		const drawn = byHand;
		// It reads as saved at once, the page reading the new drawing while it saves; a save that fails puts the edits back (ac-evo-form-edit-optimistic).
		const saving = write(notation);
		draft.discard();
		byHand = false;
		if (await saving) return;
		draft.editText(notation);
		byHand = drawn;
	}
	/** An element added on the page comes named in the spec's language and opens its fields, its first one selected (ac-evo-func-uml-edit). */
	function placed(next: DiagramSelection) {
		selection = next;
		added++;
	}

	function addPerson(kind: 'person' | 'system') {
		const made = addActor(diagram, kind, lang);
		edit(() => made.diagram);
		placed({ kind: 'actor', name: made.name });
	}
	function addCase() {
		const made = addUseCase(diagram, diagram.actors.filter((a) => a.kind === 'person').slice(0, 1).map((a) => a.name), lang);
		edit(() => made.diagram);
		placed({ kind: 'use_case', name: made.name });
	}
	function addFlowStep() {
		if (!flowName) return;
		addStepAfter(flowName, selection?.kind === 'step' && sameName(selection.useCase, flowName) ? selection.index : null);
	}
	/** A step under `after` (at the end when null), its text selected: Enter in a step's text lands here too. */
	function addStepAfter(useCase: string, after: number | null) {
		const made = addStep(diagram, useCase, after, undefined, lang);
		edit(() => made.diagram);
		placed({ kind: 'step', useCase, index: made.index });
	}
	function addThing() {
		const made = addMachine(diagram, lang);
		edit(() => made.diagram);
		chosenMachine = made.object;
		placed({ kind: 'machine', object: made.object });
	}
	function addMachineState() {
		if (!machine) return;
		const made = addState(diagram, machine.object, lang);
		edit(() => made.diagram);
		placed({ kind: 'state', object: machine.object, name: made.name });
	}
	function addMachineTransition() {
		if (!machine) return;
		const from = selection?.kind === 'state' ? selection.name : undefined;
		const made = addTransition(diagram, machine.object, from);
		edit(() => made.diagram);
		if (made.index >= 0) placed({ kind: 'transition', object: machine.object, index: made.index });
	}
	/** From the Flows view with no use case yet: the use case comes first, named where use cases are drawn. */
	function addCaseFromFlows() {
		addCase();
		view = 'use_cases';
		pan.refit();
	}

	/** What the view shown adds, from its Add menu (ac-evo-func-uml-edit). */
	const addEntries = $derived<AddEntry[]>(
		view === 'use_cases'
			? [
					{ label: 'Add a person', icon: 'user', onSelect: () => addPerson('person') },
					{ label: 'Add a system', icon: 'server', onSelect: () => addPerson('system') },
					{ label: 'Add a use case', icon: 'plus', onSelect: addCase }
				]
			: view === 'flows'
				? [{ label: 'Add a step', icon: 'plus', onSelect: addFlowStep, unavailable: flowName ? undefined : 'Add a use case first: a flow walks one through.' }]
				: [
						{ label: 'Add a thing', icon: 'plus', onSelect: addThing },
						{ label: 'Add a state', icon: 'plus', onSelect: addMachineState, unavailable: machine ? undefined : 'Add a thing first: its states are what it goes through.' },
						{
							label: 'Add a transition',
							icon: 'plus',
							onSelect: addMachineTransition,
							unavailable: !machine ? 'Add a thing first: its states are what it goes through.' : machine.states.length === 0 ? 'Add a state first: a transition leaves one.' : undefined
						}
					]
	);

	// It opens at a size that reads, fitted to its frame's width, the frame growing with it (ac-evo-uml-legible).
	const pan = new PanZoom({ maxFit: READING_MAX_FIT, readable: READABLE_ZOOM, fitEntire: true });
	const enlarger = new DiagramEnlarger();
	$effect(() => enlarger.attach());
	const onsize = (w: number, h: number) => pan.setNatural(w, h);

	const TABS = [
		{ id: 'use_cases', label: 'Use cases', desc: 'Who takes part, and what the product offers them' },
		{ id: 'flows', label: 'Flows', desc: 'How each use case goes, lane by lane, and where it may stop' },
		{ id: 'states', label: 'States', desc: 'What each thing the change moves goes through' }
	];
	const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	const flowEntries = $derived<DrawingEntry[]>(
		flowNames.map((name) => ({
			name,
			detail: count(flowOf(diagram, name)?.steps.length ?? 0, 'step', 'steps'),
			marked: marks.some((m) => (m.kind === 'flow' || m.kind === 'step') && sameName(m.useCase, name))
		}))
	);
	const machineEntries = $derived<DrawingEntry[]>(
		machineNames.map((name) => ({
			name,
			detail: count(diagram.machines.find((m) => sameName(m.object, name))?.states.length ?? 0, 'state', 'states'),
			marked: marks.some((m) => m.kind === 'transition' && sameName(m.object, name))
		}))
	);
	/** The drawings of the view open, listed beside it once there is more than one (ac-evo-func-uml). */
	const listed = $derived(
		view === 'flows' && flowEntries.length > 1
			? { entries: flowEntries, active: flowName, onpick: pickFlow, label: 'Flows', unclear: 'Something in this flow is unclear' }
			: view === 'states' && machineEntries.length > 1
				? { entries: machineEntries, active: machine?.object ?? null, onpick: pickMachine, label: 'Things whose states change', unclear: 'Something in these states is unclear' }
				: null
	);
	// The drawing's height in the card, grown to hold it at a size that reads; the list of flows beside it takes the same (ac-evo-func-uml).
	const CANVAS_HEIGHT = $derived(readingCanvasHeight(pan.readingHeight(pan.viewWidth)));
	const empty = $derived(isEmptyDiagram(diagram));
</script>

{#snippet drawing()}
	<!-- An empty view says what it waits for and, to whoever may edit, offers what it adds in its middle (ac-evo-func-uml-edit). -->
	{#if view === 'use_cases' && empty}
		<EmptyDrawing
			text={editable ? 'No diagram yet. Start with the people who take part and what they do with the product.' : 'No diagram.'}
			entries={editable ? addEntries : []}
		/>
	{:else if view === 'flows' && !flow}
		<EmptyDrawing
			text="No use case yet: a flow walks one use case through."
			entries={editable ? [{ label: 'Add a use case', icon: 'plus', onSelect: addCaseFromFlows }] : []}
		/>
	{:else if view === 'flows' && flow && flow.steps.length === 0}
		<EmptyDrawing text={editable ? `"${flow.useCase}" has no step yet.` : `"${flow.useCase}" has no step.`} entries={editable ? addEntries : []} />
	{:else if view === 'states' && !machine}
		<EmptyDrawing
			text={editable ? 'Nothing whose states change yet: add the thing the change moves (an order, a booking, a bag).' : 'No states drawn.'}
			entries={editable ? addEntries.slice(0, 1) : []}
		/>
	{:else}
		<PanZoomCanvas view={pan} {enlarger} height={CANVAS_HEIGHT} label={title} dotted>
			{#if view === 'use_cases'}
				<UseCaseView {diagram} {productName} {words} {selection} {marks} onpick={pick} {onsize} />
			{:else if view === 'flows' && flow}
				<FlowView {diagram} {flow} {productName} {words} {selection} {marks} onpick={pick} {onsize} />
			{:else if view === 'states' && machine}
				<StateView {machine} {selection} {marks} onpick={pick} {onsize} />
			{/if}
		</PanZoomCanvas>
	{/if}
{/snippet}

<DiagramFrame
	label={title}
	{enlarger}
	{pan}
	{editable}
	savedEmpty={value.trim() === ''}
	pairedWith="texts"
	{behind}
	{assist}
	bind:byHand
	{added}
	tabs={TABS}
	{view}
	onview={(id) => switchView(id as DiagramView)}
	{problems}
	onlocate={locate}
	dropsUnread={draft.dropsUnread}
	dirty={!pageEditing && draft.dirty}
	oncommit={commit}
	ondiscard={() => (draft.discard(), (selection = null))}
	inspecting={editable && selection !== null}
	onclose={() => (selection = null)}
>
	{#snippet toolbar()}
		{#if editable}<AddMenu entries={addEntries} />{/if}
	{/snippet}
	{#snippet canvas()}
		{#if listed}
			<BesideDrawing enlarged={enlarger.enlarged} height={CANVAS_HEIGHT}>
				{#snippet list()}<DrawingList {...listed} />{/snippet}
				{@render drawing()}
			</BesideDrawing>
		{:else}
			{@render drawing()}
		{/if}
	{/snippet}
	{#snippet inspector()}
		{#if selection}<DiagramInspector {diagram} {selection} {words} onedit={edit} onselect={(s) => (selection = s)} onopenflow={openFlow} onaddstep={addStepAfter} {links} />{/if}
	{/snippet}
	{#snippet hint()}
		{#if view === 'flows' && flow && flow.steps.length > 0 && editable && !selection}
			<p class="text-[0.6875rem] text-ink-500">Click a step to change who does it, what happens, and where it may stop.</p>
		{/if}
	{/snippet}
</DiagramFrame>
