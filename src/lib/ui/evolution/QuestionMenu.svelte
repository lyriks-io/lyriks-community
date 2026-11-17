<script lang="ts">
	import { Icon, clickedWithin, floatInView, type IconName } from '$ui/design-system';

	/**
	 * The '⋯' menu of a question card (ac-evo-form-question-acts): commenting and
	 * skipping sit here, out of the title line, which keeps the buttons a person
	 * uses most: come back to it later, refuse, validate. A thread that holds
	 * messages is not here: its icon stands at the foot of the card.
	 */
	interface Item {
		readonly label: string;
		readonly icon: IconName;
		readonly onSelect: () => void;
	}
	interface Props {
		/** What the menu is about, for its accessible name. */
		label: string;
		items: readonly Item[];
		/** The button's icon: '⋯' on a question, the gear on a request's settings (ac-evo-req-settings). */
		icon?: IconName;
	}
	let { label, items, icon = 'ellipsis' }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let panel = $state<HTMLElement>();

	function choose(item: Item) {
		open = false;
		item.onSelect();
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

<div class="relative" bind:this={root}>
	<button
		type="button"
		class="relative grid size-9 place-items-center rounded-field border-[1.5px] border-line text-ink hover:border-ink"
		aria-label={label}
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<Icon name={icon} size={18} />
	</button>
	{#if open}
		<ul bind:this={panel} use:floatInView={{ anchor: root, align: 'right' }} class="min-w-56 rounded-field border-[1.5px] border-ink bg-paper py-1 shadow-pop" role="menu" aria-label={label}>
			{#each items as item (item.label)}
				<li role="none">
					<button
						type="button"
						role="menuitem"
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-toner-1"
						onclick={() => choose(item)}
					>
						<Icon name={item.icon} size={14} class="shrink-0 text-ink-3" />
						{item.label}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
