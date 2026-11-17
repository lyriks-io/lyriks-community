<script lang="ts">
	import { untrack } from 'svelte';
	import { DiagramEnlarger, PanZoom, PanZoomCanvas } from '$ui/design-system';
	import { READABLE_ZOOM, READING_MAX_FIT, readingCanvasHeight } from './layout';
	import {
		addMessage,
		addSequence,
		addTechElement,
		addTechLink,
		isEmptyTechnicalDiagram,
		readTechnicalDiagram,
		sameName,
		technicalDiagramProblems,
		technicalLinks,
		goneLinkProblems,
		writeTechnicalDiagram,
		type DiagramPlace,
		type DrawableStep,
		type TechElementKind
	} from '$domain/evolution';
	import ComponentView from './ComponentView.svelte';
	import SequenceView from './SequenceView.svelte';
	import TechInspector from './TechInspector.svelte';
	import DiagramFrame from './DiagramFrame.svelte';
	import AddMenu, { type AddEntry } from './AddMenu.svelte';
	import EmptyDrawing from './EmptyDrawing.svelte';
	import { DiagramDraft } from './diagram-draft.svelte';
	import type { PageDiagramDraft } from '../page-edit';
	import type { DiagramLinkStatus } from './link-status.svelte';
	import type { TechSelection, TechView } from './selection';
	import { alphabetical, diagramWords } from './words';
	import DrawingList, { type DrawingEntry } from './DrawingList.svelte';
	import BesideDrawing from './BesideDrawing.svelte';
	import type { SpecLanguage } from '$domain/language';

	/**
	 * The Technical spec's diagram, in UML (ac-evo-tech-uml): the components the
	 * change involves and adds, with the constraints and risks as notes, and the
	 * sequences that say who calls whom and what happens when a call goes wrong.
	 * Edited like the Functional spec's (ac-evo-func-uml-edit), paired with the
	 * step's description (ac-evo-tech-uml-sync).
	 */
	interface Props {
		value: string;
		editable: boolean;
		productName: string;
		lang?: SpecLanguage;
		behind?: { readonly prompt: string; readonly step?: DrawableStep } | null;
		/** The built-in assistant's offer to draw it from the texts, where it is on (ac-evo-diagram-assistant). */
		assist?: { readonly run: () => void; readonly drawing: boolean; readonly failure?: string | null } | null;
		/** An earlier version the reader looks at in place of this one: drawn read only, the view kept (ac-evo-hist-field-versions). */
		earlier?: string | null;
		save: (value: string) => Promise<boolean>;
		pageEditing?: boolean;
		onDraft?: (draft: PageDiagramDraft | null) => void;
		/** Saves a drawing made by hand while the diagram is behind its description: it catches the diagram up (ac-evo-tech-uml-sync). */
		redraw?: (value: string) => Promise<boolean>;
		/** Where the links to the product open: offered on the fields, drawn, and pointed out once gone (ac-evo-func-uml-link). */
		links?: DiagramLinkStatus;
	}
	let { value, editable: editableProp, productName, lang = 'en', behind = null, assist = null, earlier = null, save, redraw, links, pageEditing = false, onDraft }: Props = $props();
	// Nothing is edited on an earlier version: it is read, in the view the reader was in.
	const editable = $derived(editableProp && earlier === null);
	const words = $derived(diagramWords(lang));

	const draft = new DiagramDraft({ read: readTechnicalDiagram, write: writeTechnicalDiagram, check: technicalDiagramProblems }, () => value, () => earlier);
	const diagram = $derived(draft.diagram);
	/** What the diagram reads unclear, a link to what the product no longer has among it. */
	const problems = $derived([...draft.problems, ...(links ? goneLinkProblems(technicalLinks(diagram), (ref) => links.hrefOf(ref)) : [])]);
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
		if (links) void links.load(technicalLinks(diagram).map((l) => l.link.ref));
	});

	let view = $state<TechView>('components');
	let selection = $state.raw<TechSelection | null>(null);
	// A selected element may not exist in the other version: moving between versions drops the selection, never the view.
	$effect(() => {
		void earlier;
		selection = null;
	});
	let chosen = $state<string | null>(null);
	// Listed beside the drawing in alphabetical order, the first one drawn when the view opens (ac-evo-tech-uml).
	const sequenceNames = $derived(alphabetical(diagram.sequences.map((s) => s.name), lang));
	const sequence = $derived(
		diagram.sequences.find((s) => sameName(s.name, sequenceNames.find((n) => chosen && sameName(n, chosen)) ?? sequenceNames[0] ?? '')) ?? null
	);
	/** What the view shown draws, in plain words (ac-diag-title). */
	const title = $derived(view === 'components' ? words.titles.components : words.titles.sequence(sequence?.name ?? null));
	function pickSequence(name: string) {
		chosen = name;
		selection = null;
		pan.refit();
	}

	const edit = (change: Parameters<typeof draft.edit>[0]) => draft.edit(change);
	function pick(next: TechSelection) {
		if (editable) selection = next;
	}
	function switchView(next: TechView) {
		view = next;
		if (selection && !(next === 'components' ? ['element', 'link', 'note'] : ['element', 'sequence', 'message']).includes(selection.kind)) selection = null;
		pan.refit();
	}
	/** Every element a problem sits on: each view marks its own (ac-evo-tech-uml). */
	const marks = $derived(problems.flatMap((p) => p.at ?? []));
	/** A problem's link: the view that holds its element, on its sequence, the element selected. */
	function locate(place: DiagramPlace) {
		if (place.kind === 'link' || place.kind === 'note' || place.kind === 'element') {
			switchView('components');
			selection = place;
		} else if (place.kind === 'message') {
			chosen = place.sequence;
			switchView('sequences');
			selection = place;
		}
	}
	// Drawing by hand a diagram behind its description, and how many elements were added (each opens its fields to be named).
	let byHand = $state(false);
	let added = $state(0);
	/** A drawing made while the diagram is behind its description catches it up; otherwise the description it changes falls behind (ac-evo-tech-uml-sync). */
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
	function placed(next: TechSelection) {
		selection = next;
		added++;
	}
	function addPart(kind: TechElementKind) {
		const made = addTechElement(diagram, kind, lang);
		edit(() => made.diagram);
		placed({ kind: 'element', name: made.name });
	}
	function addLink() {
		const from = selection?.kind === 'element' ? selection.name : undefined;
		const made = addTechLink(diagram, from);
		edit(() => made.diagram);
		if (made.index >= 0) placed({ kind: 'link', index: made.index });
	}
	function newSequence() {
		const made = addSequence(diagram, lang);
		edit(() => made.diagram);
		chosen = made.name;
		placed({ kind: 'sequence', name: made.name });
	}
	function newMessage() {
		if (!sequence) return;
		const after = selection?.kind === 'message' && sameName(selection.sequence, sequence.name) ? selection.index : null;
		const made = addMessage(diagram, sequence.name, after, lang);
		edit(() => made.diagram);
		placed({ kind: 'message', sequence: sequence.name, index: made.index });
	}

	/** What the view shown adds, from its Add menu (ac-evo-func-uml-edit, ac-evo-tech-uml). */
	const addEntries = $derived<AddEntry[]>(
		view === 'components'
			? [
					{ label: 'Add a component', icon: 'layers', onSelect: () => addPart('component') },
					{ label: 'Add a store', icon: 'database', onSelect: () => addPart('store') },
					{ label: 'Add a system', icon: 'server', onSelect: () => addPart('system') },
					{ label: 'Add a person', icon: 'user', onSelect: () => addPart('actor') },
					{ label: 'Add a link', icon: 'arrow-right', onSelect: addLink, unavailable: diagram.elements.length < 2 ? 'Add two parts first: a link joins them.' : undefined }
				]
			: [
					{ label: 'Add a sequence', icon: 'plus', onSelect: newSequence },
					{
						label: 'Add a message',
						icon: 'plus',
						onSelect: newMessage,
						unavailable: !sequence ? 'Add a sequence first: a message belongs to one.' : diagram.elements.length === 0 ? 'Add a part first: a message goes from one to another.' : undefined
					}
				]
	);

	// It opens at a size that reads, fitted to its frame's width, the frame growing with it (ac-evo-uml-legible).
	const pan = new PanZoom({ maxFit: READING_MAX_FIT, readable: READABLE_ZOOM, fitEntire: true });
	const canvasHeight = $derived(readingCanvasHeight(pan.readingHeight(pan.viewWidth)));
	const enlarger = new DiagramEnlarger();
	$effect(() => enlarger.attach());
	const onsize = (w: number, h: number) => pan.setNatural(w, h);

	const TABS = [
		{ id: 'components', label: 'Components', desc: 'What the change involves and adds to the architecture, and its constraints and risks' },
		{ id: 'sequences', label: 'Sequences', desc: 'Who calls whom, in what order, and what happens when a call goes wrong' }
	];
	const sequenceEntries = $derived<DrawingEntry[]>(
		sequenceNames.map((name) => {
			const messages = diagram.sequences.find((s) => sameName(s.name, name))?.messages.length ?? 0;
			return { name, detail: `${messages} ${messages === 1 ? 'message' : 'messages'}`, marked: marks.some((m) => m.kind === 'message' && sameName(m.sequence, name)) };
		})
	);
	const empty = $derived(isEmptyTechnicalDiagram(diagram));
</script>

{#snippet drawing()}
	<!-- An empty view says what it waits for and, to whoever may edit, offers what it adds in its middle (ac-evo-func-uml-edit). -->
	{#if view === 'components' && empty}
		<EmptyDrawing
			text={editable ? 'No diagram yet. Start with the parts the change involves, the stores where its data lives and the other systems it calls.' : 'No diagram.'}
			entries={editable ? addEntries.filter((e) => !e.unavailable) : []}
		/>
	{:else if view === 'sequences' && !sequence}
		<EmptyDrawing text={editable ? 'No sequence yet: add the exchange that matters.' : 'No sequence drawn.'} entries={editable ? addEntries.slice(0, 1) : []} />
	{:else if view === 'sequences' && sequence && sequence.messages.length === 0}
		<EmptyDrawing text={editable ? `"${sequence.name}" has no message yet.` : `"${sequence.name}" has no message.`} entries={editable ? addEntries.slice(1) : []} />
	{:else}
		<PanZoomCanvas view={pan} {enlarger} height={canvasHeight} label={title} dotted>
			{#if view === 'components'}
				<ComponentView {diagram} {productName} {words} {selection} {marks} onpick={pick} {onsize} />
			{:else if sequence}
				<SequenceView {diagram} {sequence} {words} {selection} {marks} onpick={pick} {onsize} />
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
	pairedWith="description"
	{behind}
	{assist}
	bind:byHand
	{added}
	tabs={TABS}
	{view}
	onview={(id) => switchView(id as TechView)}
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
		{#if view === 'sequences' && sequenceEntries.length > 1}
			<BesideDrawing enlarged={enlarger.enlarged} height={canvasHeight}>
				{#snippet list()}<DrawingList entries={sequenceEntries} active={sequence?.name ?? null} onpick={pickSequence} label="Sequences" unclear="Something in this sequence is unclear" />{/snippet}
				{@render drawing()}
			</BesideDrawing>
		{:else}
			{@render drawing()}
		{/if}
	{/snippet}
	{#snippet inspector()}
		{#if selection}<TechInspector {diagram} {selection} {words} onedit={edit} onselect={(s) => (selection = s)} {links} />{/if}
	{/snippet}
</DiagramFrame>
