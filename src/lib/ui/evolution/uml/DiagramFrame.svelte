<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import { tick, type Snippet } from 'svelte';
	import { Button, EnlargedBackdrop, DiagramHeader, Icon, PillTabs, frameClass, portalWhile, type DiagramEnlarger, type PanZoom, type PillTab } from '$ui/design-system';
	import type { DiagramPlace, DiagramProblem, DrawableStep } from '$domain/evolution';
	import { TONE } from '../verdict-tones';
	import CatchUpOffer from '../CatchUpOffer.svelte';

	/**
	 * What every diagram of a request shows around its drawing (ac-evo-func-uml-edit,
	 * -text, -sync, ac-evo-tech-uml): in its place while it is behind its texts, the
	 * two ways to update it; otherwise its views and what each lets one add, the drawing and the fields of what is
	 * selected, what it leaves unclear, and the unsaved edits. The notation it is kept
	 * as is never shown: a person reads and edits the drawing (ac-evo-func-uml-text).
	 */
	interface Props {
		label: string;
		enlarger: DiagramEnlarger;
		/** The drawing's zoom and position: a problem's link brings its element to the middle. */
		pan: PanZoom;
		editable: boolean;
		/** The saved diagram holds nothing yet: it is drawn rather than updated. */
		savedEmpty: boolean;
		/** What the diagram is paired with, for the offer to update it and the save bar. */
		pairedWith: 'texts' | 'description';
		/** Set while a text says something the diagram was not drawn from: the prompt that has the person's AI redraw it. */
		behind: { readonly prompt: string; readonly step?: DrawableStep } | null;
		/**
		 * Where an administrator switched the built-in assistant on, it is offered
		 * to draw the diagram from the texts (ac-evo-diagram-assistant).
		 */
		assist?: { readonly run: () => void; readonly drawing: boolean; readonly failure?: string | null } | null;
		tabs: readonly PillTab[];
		view: string;
		onview: (view: string) => void;
		problems: readonly DiagramProblem[];
		/** Opens the view that holds a problem's element and selects it (ac-evo-func-uml-text). */
		onlocate: (at: DiagramPlace) => void;
		dropsUnread: boolean;
		dirty: boolean;
		oncommit: () => void;
		ondiscard: () => void;
		/** Whether the fields of a selected element show. */
		inspecting: boolean;
		onclose: () => void;
		toolbar: Snippet;
		canvas: Snippet;
		inspector: Snippet;
		hint?: Snippet;
		/** Set while the person draws by hand a diagram behind its texts: saving catches it up (ac-evo-func-uml-sync). */
		byHand?: boolean;
		/** Counts the elements added on the page: each opens its fields with the first one selected, to be named at once (ac-evo-func-uml-edit). */
		added?: number;
	}
	let {
		label,
		enlarger,
		pan,
		editable,
		savedEmpty,
		pairedWith,
		behind,
		assist = null,
		tabs,
		view,
		onview,
		problems,
		onlocate,
		dropsUnread,
		dirty,
		oncommit,
		ondiscard,
		inspecting,
		onclose,
		toolbar,
		canvas,
		inspector,
		hint,
		byHand = $bindable(false),
		added = 0
	}: Props = $props();

	/**
	 * An element just added opens its fields with the first one focused and its
	 * text selected, so typing names it. Each add is handled once: opening the
	 * fields again by a click on an element selects nothing.
	 */
	let handled = 0;
	function selectFirstField(node: HTMLElement, count: number) {
		const select = (n: number) => {
			if (n === 0 || n === handled) return;
			handled = n;
			requestAnimationFrame(() => {
				const field = node.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:not([type=checkbox]):not([type=radio]), textarea');
				field?.focus();
				field?.select();
			});
		};
		select(count);
		return { update: select };
	}

	const named = $derived(problems.filter((p) => p.line === null));
	const unread = $derived(problems.filter((p) => p.line !== null).length);

	let drawing = $state<HTMLDivElement | null>(null);
	const painted = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
	/**
	 * A problem's link brings its element into sight (ac-evo-func-uml-text): the view
	 * that holds it with the element selected, then, once that view is drawn and
	 * fitted, the element in the middle at a size that reads, and the drawing on screen.
	 */
	async function locate(at: DiagramPlace) {
		onlocate(at);
		await tick();
		await painted();
		const picked = drawing?.querySelector<SVGGraphicsElement>('[aria-pressed="true"]');
		if (picked) {
			const box = picked.getBBox();
			pan.focus(box.x + box.width / 2, box.y + box.height / 2);
		}
		drawing?.scrollIntoView({ block: 'nearest', behavior: scrollMotion() });
	}
</script>

<EnlargedBackdrop {enlarger} />
<div
	use:portalWhile={enlarger.enlarged}
	class="space-y-2 {frameClass(enlarger.display)}"
	role={enlarger.enlarged ? 'dialog' : undefined}
	aria-modal={enlarger.enlarged ? 'true' : undefined}
	aria-label={enlarger.enlarged ? `${label}, enlarged` : undefined}
>
	<DiagramHeader {enlarger} title={label} />
	{#if behind && !dirty && !byHand}
		<!--
			Once a text it is drawn from changes, the diagram is no longer shown: the card offers
			the ways to update it from the texts, by hand included, and says nothing more
			(ac-evo-func-uml-sync, ac-evo-tech-uml-sync, ac-evo-diagram-assistant). Unsaved edits
			keep the drawing on screen.
		-->
		<CatchUpOffer
			title="{savedEmpty ? 'Draw' : 'Update'} the diagram from the {pairedWith}"
			{editable}
			{assist}
			prompt={behind.prompt}
			step={behind.step ?? null}
			byHand={{ label: 'Draw it myself', run: () => (byHand = true) }}
		/>
	{:else}
		<!-- Only the views and what the one shown lets one add stand above the drawing (ac-evo-func-uml-edit). -->
		<div class="flex flex-wrap items-center gap-2">
			<PillTabs {tabs} active={view} onSelect={onview} label="Views of the diagram" />
			{@render toolbar()}
		</div>

		<!-- In the card the fields open under the drawing, so it keeps its width; enlarged, beside it (ac-evo-func-uml). -->
		<div class="flex flex-col gap-3 {enlarger.enlarged ? 'min-h-0 flex-1 lg:flex-row' : ''}">
			<div bind:this={drawing} class="min-w-0 flex-1 overflow-hidden rounded-field border border-line bg-toner-1 {enlarger.enlarged ? 'flex min-h-0 flex-col' : ''}">
				{@render canvas()}
			</div>
			{#if inspecting}
				<aside use:selectFirstField={added} class="shrink-0 rounded-field border-[1.5px] border-ink bg-paper p-3 {enlarger.enlarged ? 'overflow-y-auto lg:w-80' : ''}" aria-label="Fields of the selected element">
					<div class="mb-2 flex justify-end">
						<button type="button" class="text-ink-500 hover:text-ink" aria-label="Close the fields" onclick={onclose}><Icon name="x" size={14} /></button>
					</div>
					{@render inspector()}
				</aside>
			{/if}
		</div>

		{@render hint?.()}

		<!-- Pointed out, never refused: by its name, or as a line not read, since the notation is never shown.
		     A problem on an element links to it, under the same sign the drawing marks it with (ac-evo-func-uml-text). -->
		{#if problems.length > 0}
			<ul class="space-y-0.5 text-xs {TONE.decide.text}" aria-label="What the diagram leaves unclear">
				{#each named as problem, i (i)}
					{@const at = problem.at?.[0]}
					<li class="flex items-start gap-1">
						<Icon name={TONE.decide.icon} size={12} class="mt-0.5 shrink-0" />
						{#if at}
							<button
								type="button"
								class="text-left underline decoration-dotted underline-offset-2 hover:decoration-solid"
								title="Show it in the diagram"
								onclick={() => locate(at)}>{problem.message}</button
							>
						{:else}
							<span>{problem.message}</span>
						{/if}
					</li>
				{/each}
				{#if unread > 0}
					<li class="flex items-start gap-1">
						<Icon name={TONE.decide.icon} size={12} class="mt-0.5 shrink-0" />
						<span>{unread === 1 ? 'One line written for this diagram could not be read: it is left out of the drawing' : `${unread} lines written for this diagram could not be read: they are left out of the drawing`}{dropsUnread && editable ? ', and editing the drawing drops them.' : '.'}</span>
					</li>
				{/if}
			</ul>
		{/if}

		{#if dirty}
			<!-- Edits stay on the page until saved as one new version (ac-evo-func-uml-edit). -->
			<div class="flex flex-wrap items-center gap-2 rounded-field border border-transparent bg-blue-tint px-3 py-2 text-xs shadow-[inset_6px_0_0_var(--color-blue)]">
				<Icon name="pencil" size={13} class="text-blue-ink" />
				<span class="min-w-0 flex-1 text-ink-700">
					{#if behind}
						Unsaved drawing. Saving makes a new version drawn from the {pairedWith}, to validate like any answer: the {pairedWith} stay as they are.
					{:else}
						Unsaved changes to the diagram. Saving makes a new version, to validate like any answer, and the {pairedWith} it changes will have to be updated from it.
					{/if}
				</span>
				<Button size="sm" variant="ghost" onclick={() => ((byHand = false), ondiscard())}>Discard</Button>
				<Button size="sm" onclick={oncommit}>Save the diagram</Button>
			</div>
		{/if}
	{/if}
</div>
