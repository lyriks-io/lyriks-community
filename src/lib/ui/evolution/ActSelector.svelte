<script lang="ts" module>
	import type { IconName } from '$ui/design-system';

	/** One act a card offers on its answer, with its word, its icon and its colour. */
	export interface CardAct {
		readonly label: string;
		readonly icon: IconName;
		/** The colour of its word and icon, and of its hover. */
		readonly look: string;
		readonly pressed?: boolean;
		readonly onSelect: () => void;
	}
</script>

<script lang="ts">
	import { Icon, clickedWithin, floatInView } from '$ui/design-system';

	/**
	 * The acts of a question card as one selector (ac-evo-form-question-acts): the
	 * first written in full and done in one click, a small arrow beside it that
	 * unfolds the others, each with its word, its colour and its icon. One act
	 * only shows alone, without the arrow.
	 */
	interface Props {
		acts: readonly CardAct[];
		/** What the acts are about, for the accessible name of the arrow and its menu. */
		label: string;
		disabled?: boolean;
	}
	let { acts, label, disabled = false }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();
	let panel = $state<HTMLElement>();
	const first = $derived(acts[0]);
	const others = $derived(acts.slice(1));
	const menuLabel = $derived(`${label}: the other answers`);

	function choose(act: CardAct) {
		open = false;
		act.onSelect();
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

{#if first}
	<div class="relative" bind:this={root}>
		<span class="inline-flex items-stretch rounded-field border-[1.5px] border-ink bg-paper">
			<button
				type="button"
				class="flex items-center gap-1 px-1.5 py-0.5 font-bold tracking-[0.04em] {others.length > 0 ? 'rounded-l-field' : 'rounded-field'} {first.look}"
				aria-pressed={first.pressed}
				{disabled}
				onclick={() => first.onSelect()}
			>
				<Icon name={first.icon} size={11} />{first.label}
			</button>
			{#if others.length > 0}
				<button
					type="button"
					class="grid place-items-center rounded-r-field border-l-[1.5px] border-ink px-1 text-ink hover:bg-toner-1"
					aria-label={menuLabel}
					aria-haspopup="menu"
					aria-expanded={open}
					{disabled}
					onclick={() => (open = !open)}
				>
					<Icon name="chevron-down" size={11} />
				</button>
			{/if}
		</span>
		{#if open}
			<ul bind:this={panel} use:floatInView={{ anchor: root, align: 'left' }} class="min-w-48 rounded-field border-[1.5px] border-ink bg-paper py-1 shadow-pop" role="menu" aria-label={menuLabel}>
				{#each others as act (act.label)}
					<li role="none">
						<button type="button" role="menuitem" class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium {act.look}" onclick={() => choose(act)}>
							<Icon name={act.icon} size={12} class="shrink-0" />{act.label}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
