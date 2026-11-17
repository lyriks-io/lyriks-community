<script lang="ts">
	import { Button, Icon, IconButton, Select, TextInput, Textarea } from '$ui/design-system';
	import {
		addMessageFailure,
		addTechLink,
		addTechNote,
		moveMessage,
		removeMessage,
		removeMessageFailure,
		removeSequence,
		removeTechElement,
		removeTechLink,
		removeTechNote,
		renameRefusal,
		renameSequence,
		renameTechElement,
		sameName,
		sequenceOf,
		updateMessage,
		updateMessageFailure,
		updateTechElement,
		linkKindFor,
		linkTechElement,
		updateTechLink,
		updateTechNote,
		type TechElementKind,
		type TechnicalDiagram
	} from '$domain/evolution';
	import type { TechSelection } from './selection';
	import type { DiagramWords } from './words';
	import type { DiagramLinkStatus } from './link-status.svelte';
	import LinkPicker from './LinkPicker.svelte';

	/**
	 * The fields of what is selected on the Technical spec's diagram
	 * (ac-evo-tech-uml, ac-evo-func-uml-edit): a part's name, kind, whether the
	 * change adds it, and the notes on it; a link's ends and what goes through it;
	 * a message's ends, text, call or answer, and what happens when it goes wrong.
	 * Names are committed on leaving their field; every change stays on the page
	 * until the diagram is saved.
	 */
	interface Props {
		diagram: TechnicalDiagram;
		selection: TechSelection;
		onedit: (change: (d: TechnicalDiagram) => TechnicalDiagram) => void;
		onselect: (selection: TechSelection | null) => void;
		/** The diagram's words in the spec's language: each field's example reads in it (ac-evo-func-uml-edit). */
		words: DiagramWords;
		/** Where the links to the product open; without it, nothing is offered to link (ac-evo-tech-uml-link). */
		links?: DiagramLinkStatus;
	}
	let { diagram, selection, onedit, onselect, words, links }: Props = $props();

	const oneLine = (v: string) => v.replace(/\s*\n\s*/g, ' ');
	const noColon = (v: string) => oneLine(v).replaceAll(':', ',');
	let refusal = $state<string | null>(null);
	$effect(() => {
		void selection;
		refusal = null;
	});
	function rename(from: string, to: string, taken: readonly string[], apply: (d: TechnicalDiagram, to: string) => TechnicalDiagram, next: (to: string) => TechSelection) {
		if (to.trim() === from) return;
		refusal = renameRefusal(to, from, taken);
		if (refusal) return;
		onedit((d) => apply(d, to.trim()));
		onselect(next(to.trim()));
	}
	const blurOnEnter = (e: KeyboardEvent) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur();

	const element = $derived(selection.kind === 'element' ? (diagram.elements.find((e) => sameName(e.name, selection.name)) ?? null) : null);
	const link = $derived(selection.kind === 'link' ? (diagram.links[selection.index] ?? null) : null);
	const note = $derived(selection.kind === 'note' ? (diagram.notes[selection.index] ?? null) : null);
	const sequence = $derived(selection.kind === 'sequence' || selection.kind === 'message' ? sequenceOf(diagram, selection.kind === 'sequence' ? selection.name : selection.sequence) : null);
	const message = $derived(selection.kind === 'message' ? (sequence?.messages[selection.index] ?? null) : null);

	const partOptions = $derived(diagram.elements.map((e) => ({ code: e.name, label: e.name })));
	const KIND_OPTIONS = [
		{ code: 'component', label: 'A part of the product (component)' },
		{ code: 'store', label: 'Where data lives (store)' },
		{ code: 'system', label: 'Another system' },
		{ code: 'actor', label: 'A person' }
	];
	const LABEL = 'block font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-ink-500 uppercase';
	// The design's filter chip (.ly-chip): a 1.5px rule border on paper; pressed, an ink fill.
	const CHIP = 'rounded-pill border-[1.5px] px-2 py-0.5 text-xs font-medium transition';
	const notesOf = (name: string) => diagram.notes.map((n, index) => ({ n, index })).filter(({ n }) => sameName(n.on, name));
</script>

{#snippet chip(label: string, pressed: boolean, toggle: () => void)}
	<button
		type="button"
		class="{CHIP} {pressed ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink hover:border-ink'}"
		aria-pressed={pressed}
		onclick={toggle}
	>
		{#if pressed}<Icon name="check" size={11} class="-ml-0.5 mr-0.5 inline" />{/if}{label}
	</button>
{/snippet}

{#snippet nameField(label: string, value: string, commit: (to: string) => void)}
	<label class="block space-y-1">
		<span class={LABEL}>{label}</span>
		{#key value}
			<TextInput {value} invalid={!!refusal} onblur={commit} onkeydown={blurOnEnter} />
		{/key}
	</label>
	{#if refusal}<p class="text-xs text-red-ink">{refusal}</p>{/if}
{/snippet}

<div class="space-y-3 text-sm">
	{#if element}
		{@render nameField('Name', element.name, (to) =>
			rename(element.name, to, diagram.elements.map((e) => e.name), (d, n) => renameTechElement(d, element.name, n), (n) => ({ kind: 'element', name: n }))
		)}
		<label class="block space-y-1">
			<span class={LABEL}>Is</span>
			<Select value={element.kind} options={KIND_OPTIONS} onchange={(kind) => kind && onedit((d) => updateTechElement(d, element.name, { kind: kind as TechElementKind }))} />
		</label>
		{#if element.kind !== 'actor'}
			<div class="flex flex-wrap gap-1.5">
				{@render chip('Already there', !element.isNew, () => onedit((d) => updateTechElement(d, element.name, { isNew: false })))}
				{@render chip('Added by the change', element.isNew, () => onedit((d) => updateTechElement(d, element.name, { isNew: true })))}
			</div>
		{/if}
		{@const linkKind = linkKindFor(element.kind)}
		{#if links && linkKind}
			<LinkPicker kind={linkKind} link={element.link} {links} onchange={(link) => onedit((d) => linkTechElement(d, element.name, link))} />
		{/if}
		<div class="space-y-1.5">
			<span class={LABEL}>Constraints and risks on it</span>
			{#each notesOf(element.name) as { n, index } (index)}
				<div class="flex items-start gap-1.5">
					<Textarea value={n.text} rows={2} class="flex-1" oninput={(text) => onedit((d) => updateTechNote(d, index, { text: oneLine(text) }))} />
					<IconButton name="x" label="Remove this note" danger onclick={() => onedit((d) => removeTechNote(d, index))} />
				</div>
			{/each}
			<Button size="sm" variant="outline" onclick={() => onedit((d) => addTechNote(d, element.name).diagram)}><Icon name="plus" size={12} />Constraint or risk</Button>
		</div>
		<div class="flex flex-wrap gap-2 border-t border-line pt-2">
			{#if element.kind !== 'actor'}
				<Button
					size="sm"
					variant="outline"
					onclick={() => {
						const added = addTechLink(diagram, element.name);
						onedit(() => added.diagram);
						if (added.index >= 0) onselect({ kind: 'link', index: added.index });
					}}
				>
					<Icon name="arrow-right" size={12} />Link from here
				</Button>
			{/if}
			<Button size="sm" variant="ghost" class="text-danger-600" onclick={() => (onedit((d) => removeTechElement(d, element.name)), onselect(null))}>
				<Icon name="trash" size={12} />Remove
			</Button>
		</div>
	{:else if link && selection.kind === 'link'}
		{@const at = selection.index}
		<p class="font-bold text-ink-900">Link</p>
		<div class="grid grid-cols-2 gap-2">
			<label class="block space-y-1">
				<span class={LABEL}>From</span>
				<Select value={link.from} options={partOptions} onchange={(from) => from && onedit((d) => updateTechLink(d, at, { from }))} />
			</label>
			<label class="block space-y-1">
				<span class={LABEL}>To</span>
				<Select value={link.to} options={partOptions} onchange={(to) => to && onedit((d) => updateTechLink(d, at, { to }))} />
			</label>
		</div>
		<label class="block space-y-1">
			<span class={LABEL}>What goes through it</span>
			<TextInput value={link.label} placeholder={words.examples.linkLabel} oninput={(label) => onedit((d) => updateTechLink(d, at, { label: oneLine(label) }))} />
		</label>
		<Button size="sm" variant="ghost" class="text-danger-600" onclick={() => (onedit((d) => removeTechLink(d, at)), onselect(null))}><Icon name="trash" size={12} />Remove</Button>
	{:else if note && selection.kind === 'note'}
		{@const at = selection.index}
		<p class="font-bold text-ink-900">Constraint or risk {at + 1}</p>
		<label class="block space-y-1">
			<span class={LABEL}>On</span>
			<Select value={note.on} options={partOptions} onchange={(on) => on && onedit((d) => updateTechNote(d, at, { on }))} />
		</label>
		<label class="block space-y-1">
			<span class={LABEL}>What it says</span>
			<Textarea value={note.text} rows={3} oninput={(text) => onedit((d) => updateTechNote(d, at, { text: oneLine(text) }))} />
		</label>
		<Button size="sm" variant="ghost" class="text-danger-600" onclick={() => (onedit((d) => removeTechNote(d, at)), onselect(null))}><Icon name="trash" size={12} />Remove</Button>
	{:else if sequence && selection.kind === 'sequence'}
		{@render nameField('Sequence', sequence.name, (to) =>
			rename(sequence.name, to, diagram.sequences.map((s) => s.name), (d, n) => renameSequence(d, sequence.name, n), (n) => ({ kind: 'sequence', name: n }))
		)}
		<Button size="sm" variant="ghost" class="text-danger-600" onclick={() => (onedit((d) => removeSequence(d, sequence.name)), onselect(null))}><Icon name="trash" size={12} />Remove the sequence</Button>
	{:else if sequence && message && selection.kind === 'message'}
		{@const at = selection.index}
		{@const of = sequence.name}
		<p class="font-bold text-ink-900">Message {at + 1} of {sequence.messages.length}</p>
		<div class="grid grid-cols-2 gap-2">
			<label class="block space-y-1">
				<span class={LABEL}>From</span>
				<Select value={message.from} options={partOptions} onchange={(from) => from && onedit((d) => updateMessage(d, of, at, { from }))} />
			</label>
			<label class="block space-y-1">
				<span class={LABEL}>To</span>
				<Select value={message.to} options={partOptions} onchange={(to) => to && onedit((d) => updateMessage(d, of, at, { to }))} />
			</label>
		</div>
		<label class="block space-y-1">
			<span class={LABEL}>What it says</span>
			<TextInput value={message.text} placeholder={words.examples.messageText} oninput={(text) => onedit((d) => updateMessage(d, of, at, { text: oneLine(text) }))} />
		</label>
		<div class="flex flex-wrap gap-1.5">
			{@render chip('A call', !message.reply, () => onedit((d) => updateMessage(d, of, at, { reply: false })))}
			{@render chip('An answer', message.reply, () => onedit((d) => updateMessage(d, of, at, { reply: true })))}
		</div>
		<div class="space-y-2">
			<span class={LABEL}>When it goes wrong</span>
			{#each message.failures as failure, f (f)}
				<div class="space-y-1.5 rounded-field border border-line bg-toner-1 p-2">
					<div class="flex items-center gap-1.5">
						<TextInput value={failure.when} placeholder={words.examples.failureWhen} class="flex-1" oninput={(when) => onedit((d) => updateMessageFailure(d, of, at, f, { when: noColon(when) }))} />
						<IconButton name="x" label="Remove" danger onclick={() => onedit((d) => removeMessageFailure(d, of, at, f))} />
					</div>
					<TextInput value={failure.then} placeholder={words.examples.failureThen} oninput={(then) => onedit((d) => updateMessageFailure(d, of, at, f, { then: oneLine(then) }))} />
				</div>
			{/each}
			<Button size="sm" variant="outline" onclick={() => onedit((d) => addMessageFailure(d, of, at))}><Icon name="plus" size={12} />Goes wrong when…</Button>
		</div>
		<div class="flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
			<Button size="sm" variant="ghost" disabled={at === 0} onclick={() => (onedit((d) => moveMessage(d, of, at, -1)), onselect({ kind: 'message', sequence: of, index: at - 1 }))}>
				<Icon name="arrow-up" size={12} />Up
			</Button>
			<Button
				size="sm"
				variant="ghost"
				disabled={at >= sequence.messages.length - 1}
				onclick={() => (onedit((d) => moveMessage(d, of, at, 1)), onselect({ kind: 'message', sequence: of, index: at + 1 }))}
			>
				<Icon name="arrow-down" size={12} />Down
			</Button>
			<Button size="sm" variant="ghost" class="ml-auto text-danger-600" onclick={() => (onedit((d) => removeMessage(d, of, at)), onselect(null))}>
				<Icon name="trash" size={12} />Remove
			</Button>
		</div>
	{:else}
		<p class="text-xs text-ink-500">This element is no longer in the diagram.</p>
	{/if}
</div>
