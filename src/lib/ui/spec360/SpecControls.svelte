<script lang="ts">
	import { Icon, clickedWithin, floatInView } from '$ui/design-system';
	import BlockControls, { type CommentControl, type EditControl } from '$ui/evolution/BlockControls.svelte';
	import { anchorDomId } from '$domain/discussions';
	import { useCardGrid } from './card-grid.svelte';
	import { revealWithBlock } from './reveal-with-block';
	import { useDiscussions } from './discussions.svelte';
	import { useEdits, type EditValues } from './edits.svelte';
	import { useValidation } from './validation.svelte';
	import { useSources } from './sources.svelte';
	import { POP } from './page/look';
	import HandEditMark from './HandEditMark.svelte';
	import RevalidationMark from './RevalidationMark.svelte';
	import RejectAct from './RejectAct.svelte';
	import ReviewerPicker from './ReviewerPicker.svelte';
	import { useEditMode } from './edit-mode.svelte';

	/**
	 * The controls of one block of the Specification 360°, the one component of
	 * the design: the pencil in the Edit mode, a delete where the design offers
	 * one, then the element's four acts while a draft (criterion a4ef7658): the
	 * cross that requests a change, the check that validates, its comments with
	 * their count (opened at the block's foot, under its content) and its sources
	 * (greyed at 0), then the people it waits on. While the element is edited they
	 * all give way to its editor. The cross and the check go once the
	 * specification is validated; editing stays, the change followed instead
	 * (criterion 611e98cb), and the comments and the sources stay.
	 */
	interface Props {
		anchor: string;
		/** What the element is called, for its discussion and its notifications. */
		title: string;
		/** The element's current fields: present when it is edited here. */
		values?: EditValues | null;
		/**
		 * Where its discussion opens: at the foot of the block, or inside a small
		 * card that then spans its grid's row; null when the block has none.
		 */
		discuss?: 'inline' | 'card' | null;
		/**
		 * A delete button, and why it is refused when it is. `uses` names where the
		 * element is used (its links): the button reads disabled and shows them.
		 */
		remove?: {
			readonly name: string;
			readonly refusal?: string | null;
			readonly uses?: readonly { readonly label: string; readonly href: string }[];
		} | null;
		/** False where the design only discusses the element (a list that links to its page). */
		validates?: boolean;
		/**
		 * False where the page sums up elements discussed on their own pages (At a glance): no discussion
		 * starts there, so one element is never discussed in two places.
		 */
		discussed?: boolean;
		/**
		 * The page renders this element's texts as fields of the Edit mode (StagedText, StagedTags): its pencil then
		 * stays only for what is chosen from a catalogue, the product's classification (criterion 41514698).
		 */
		inline?: boolean;
		/**
		 * The block's comments and sources are links closing its text (CiteLinks, About the product, criterion 416e4885):
		 * the controls leave them out, but in the Edit mode, where the text is a field and its links gone.
		 */
		cites?: boolean;
		/**
		 * The controls close the text of the element a page's head is about, right after its links: small, on the
		 * text's line, never pushed to the far side of the head (criteria 14a1164c, a4ef7658).
		 */
		trailing?: boolean;
	}
	let { anchor, title, values = null, discuss = 'inline', remove = null, validates = true, discussed = true, inline = false, cites = false, trailing = false }: Props = $props();

	const validation = useValidation();
	const discussions = useDiscussions();
	const edits = useEdits();
	const grid = useCardGrid();

	// Editing in place is a draft's while Code drift cannot follow a hand edit (criterion 9b3e04e1, 611e98cb on hold),
	// and its controls show only in the page's Edit mode: the page reads clean until then (edit-mode.svelte).
	const mode = useEditMode();
	const writable = $derived(validation.draft && validation.source.canWrite && mode.active);
	// In a grid of small cards, the card opens across its row to show its discussion or its editor, moving from the
	// button the reader pressed (card-grid); elsewhere it opens in place.
	const inGrid = $derived(discuss === 'card' && !!grid);
	const pressed = (event?: MouseEvent) => (event?.currentTarget instanceof Element ? event.currentTarget : null);
	// A page that renders the element's texts as fields keeps the pencil for its catalogue choices alone (criterion 41514698).
	const beyondText = $derived(!inline || !!values?.classification);
	const edit = $derived<EditControl | null>(
		validates && writable && values && edits.shape(anchor) && beyondText
			? {
					on: edits.editing === anchor,
					toggle: (event) => (inGrid ? void grid!.run(() => edits.open(anchor, values!), pressed(event)) : edits.open(anchor, values!)),
					blocked: null
				}
			: null
	);
	const tally = $derived(discussions.tally(anchor));
	const inText = $derived(cites && !mode.active);
	const comments = $derived<CommentControl | null>(
		discuss && discussed && !inText
			? {
					count: tally.open,
					resolvedOnly: tally.open === 0 && tally.total > 0,
					open: discussions.openAnchor === anchor,
					toggle: (event) => (inGrid ? grid!.run(() => discussions.toggle(anchor), pressed(event)) : discussions.toggle(anchor))
				}
			: null
	);
	const validate = $derived(validates ? validation.control(anchor) : null);
	// What the block rests on, opened at its foot (criterion b0ea9889); a block that cites nothing shows no icon.
	const sourcesView = useSources();
	const cited = $derived(sourcesView?.countOf(anchor) ?? 0);
	// An element keeps its four acts together: its book reads greyed at 0 rather than leave a gap (criterion a4ef7658).
	const sources = $derived(
		sourcesView && (cited > 0 || (validates && validation.draft && !!validation.standing(anchor))) && !inText ? { count: cited, open: sourcesView.openAnchor === anchor, toggle: () => sourcesView.toggle(anchor) } : null
	);
	let usesOpen = $state(false);
	let usesRoot = $state<HTMLSpanElement | null>(null);
	let usesPanel = $state<HTMLSpanElement | null>(null);
</script>

{#snippet reject()}
	{#if validates}<RejectAct {anchor} {title} small />{/if}
{/snippet}

{#snippet add()}
	<!-- The + after the people asks a colleague to validate the element (criterion 3b1c77a6). -->
	{#if validates}<ReviewerPicker {anchor} {title} small />{/if}
{/snippet}

{#snippet between()}
	<HandEditMark {anchor} />
	<!-- Changed since its people validated it: the validated version beside the proposed one (criterion e6029af6). -->
	<RevalidationMark {anchor} />
	{#if remove && writable}
		<!-- Shown while its own block is pointed at (reveal-with-block). -->
		<span class="inline-flex" {@attach revealWithBlock(anchorDomId(anchor))}>
			{#if remove.uses?.length}
				<!-- Used elsewhere: it reads disabled, and a click lists where it is used. -->
				<span class="relative" bind:this={usesRoot}>
					<button
						type="button"
						class="grid size-9 cursor-help place-items-center rounded-lg text-evo-red opacity-40"
						aria-label="Delete: {remove.refusal}"
						aria-disabled="true"
						aria-expanded={usesOpen}
						title={remove.refusal}
						onclick={() => (usesOpen = !usesOpen)}
					>
						<Icon name="trash" size={16} />
					</button>
					{#if usesOpen}
						<span bind:this={usesPanel} use:floatInView={{ anchor: usesRoot, align: 'left' }} class="animate-lk-in-fast flex max-h-72 w-64 max-w-[calc(100vw-48px)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-xl {POP} p-2.5 text-left">
							<span class="px-1 text-xs font-semibold text-evo-ink-3">{remove.refusal}</span>
							{#each remove.uses as use (use.href + use.label)}
								<a href={use.href} class="min-h-8 rounded-lg px-1.5 py-1 text-[0.8125rem] text-evo-violet-ink no-underline hover:bg-toner-1 hover:text-evo-violet-ink" onclick={() => (usesOpen = false)}>{use.label}</a>
							{/each}
						</span>
					{/if}
				</span>
			{:else}
				<button
					type="button"
					class="grid size-9 place-items-center rounded-lg text-evo-red disabled:cursor-not-allowed disabled:opacity-40"
					aria-label="Delete"
					title={remove.refusal ?? `Delete “${remove.name}”`}
					disabled={!!remove.refusal}
					onclick={() => void edits.remove(anchor, remove!.name)}
				>
					<Icon name="trash" size={16} />
				</button>
			{/if}
		</span>
	{/if}
{/snippet}

<svelte:window
	onkeydown={(e) => e.key === 'Escape' && (usesOpen = false)}
	onpointerdown={(e) => usesOpen && !clickedWithin(e.target, usesRoot, usesPanel) && (usesOpen = false)}
/>

{#if edits.editing === anchor}
	<!-- Being edited, the block shows only its editor until Cancel or Save (criterion 42cb9176). -->
{:else if inGrid}
	<!-- In a small card the controls wrap rather than run past its edge: Validate and who validated go under the pencil and the comments when the card is narrow. -->
	<span class="card-controls"><BlockControls icons {edit} {comments} {sources} {validate} {between} {reject} {add} end /></span>
{:else}
	<!-- At the end of its row, in the bottom right corner of its card (criterion aba60be7); closing a head's text, small (criterion a4ef7658). -->
	<BlockControls icons {edit} {comments} {sources} {validate} {between} {reject} {add} end={!trailing} small={trailing} />
{/if}

<style>
	/* In a small card the group sits in its bottom right corner and wraps from the right rather than run past its edge;
	   the pill keeps its words and its people on one line, three of them at most then +N (criterion aba60be7). */
	.card-controls {
		display: flex;
		min-width: 0;
		flex: 1 1 auto;
		justify-content: flex-end;
	}
	.card-controls > :global(span) {
		min-width: 0;
		flex: 0 1 auto;
		flex-wrap: wrap;
		justify-content: flex-end;
		row-gap: 4px;
	}
</style>
