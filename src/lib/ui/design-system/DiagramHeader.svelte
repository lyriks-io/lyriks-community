<script lang="ts">
	import Icon from './Icon.svelte';
	import type { DiagramEnlarger } from './enlarge.svelte';

	interface Props {
		enlarger: DiagramEnlarger;
		/** What the diagram shows, in plain words (ac-diag-title). */
		title: string;
		/** Spacing of the title in the card, for a diagram drawn edge to edge. */
		class?: string;
	}
	let { enlarger, title, class: klass = '' }: Props = $props();
</script>

<!-- The diagram's title, the same words in its card and heading its enlarged dialog (ac-diag-title).
     Enlarged, its close cross sits at the top right, clear of the zoom panel, no word beside it (ac-diag-fs-2). -->
{#if enlarger.enlarged}
	<div class="flex shrink-0 items-center gap-3">
		<h2 class="min-w-0 flex-1 truncate text-sm font-bold tracking-[-0.01em] text-ink">{title}</h2>
		<button
			type="button"
			aria-label="Close"
			title="Close (Esc)"
			class="grid size-9 shrink-0 place-items-center border-[1.5px] border-line bg-paper text-ink-3 transition-colors hover:border-ink hover:text-ink"
			onclick={() => enlarger.close()}
		>
			<Icon name="x" size={20} />
		</button>
	</div>
{:else}
	<h3 class="font-evo-mono text-xs font-semibold tracking-[0.06em] text-ink-2 uppercase {klass}">{title}</h3>
{/if}
