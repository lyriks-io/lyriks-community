<script lang="ts" module>
	import type { IconName } from '$ui/design-system';

	/** One kind of element a view of a diagram adds, named for what it adds. */
	export interface AddEntry {
		readonly label: string;
		readonly icon: IconName;
		readonly onSelect: () => void;
		/** Why it cannot be used yet; set, the entry is greyed and says it on hover. */
		readonly unavailable?: string;
	}
</script>

<script lang="ts">
	import { Button, Icon, clickedWithin, floatInView } from '$ui/design-system';

	/**
	 * What a view of a diagram adds, from one Add menu above the drawing
	 * (ac-evo-func-uml-edit): each entry named for what it adds, one that cannot be
	 * used yet greyed with its reason; a view that adds one kind only shows it as a
	 * single button. The request page adds its subjects from the same menu
	 * (ac-evo-draft-subject-1), under its own words.
	 */
	interface Props {
		entries: readonly AddEntry[];
		/** What the menu button says. */
		label?: string;
		/** What the open menu is named for a screen reader. */
		menuLabel?: string;
	}
	let { entries, label = 'Add', menuLabel = 'Add to the diagram' }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let panel = $state<HTMLElement>();
	// The design's small secondary button (.ly-btn--s): a 1.5px ink border, a bold uppercase label, the press shadow.
	const BUTTON = 'pressable inline-flex h-8 items-center justify-center gap-2 rounded-pill border-[1.5px] border-ink bg-transparent px-3 text-xs font-bold tracking-[0.07em] text-ink uppercase select-none';

	function choose(entry: AddEntry) {
		if (entry.unavailable) return;
		open = false;
		entry.onSelect();
	}
</script>

<svelte:window
	onclick={(e) => {
		if (open && !clickedWithin(e.target, root, panel)) open = false;
	}}
	onkeydown={(e) => {
		if (open && e.key === 'Escape') open = false;
	}}
/>

{#if entries.length === 1}
	{@const only = entries[0]}
	<Button size="sm" variant="outline" disabled={!!only.unavailable} title={only.unavailable} onclick={() => choose(only)}>
		<Icon name="plus" size={12} />{only.label}
	</Button>
{:else if entries.length > 1}
	<div class="relative" bind:this={root}>
		<button type="button" class={BUTTON} aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}>
			<Icon name="plus" size={12} />{label}<Icon name="chevron-down" size={12} class="-ml-1 text-ink" />
		</button>
		<!-- Opens whole, inside the window, even inside an enlarged diagram (criterion 5651ca29). -->
		{#if open}
			<ul bind:this={panel} use:floatInView={{ anchor: root }} class="min-w-48 rounded-field border-[1.5px] border-ink bg-paper py-1 shadow-pop" role="menu" aria-label={menuLabel}>
				{#each entries as entry (entry.label)}
					<li role="none">
						<button
							type="button"
							role="menuitem"
							class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium {entry.unavailable ? 'cursor-not-allowed text-ink-400' : 'text-ink hover:bg-toner-1'}"
							aria-disabled={entry.unavailable ? 'true' : undefined}
							title={entry.unavailable}
							onclick={() => choose(entry)}
						>
							<Icon name={entry.icon} size={12} class="shrink-0 {entry.unavailable ? 'text-ink-300' : 'text-ink-500'}" />{entry.label}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
