<script lang="ts">
	/**
	 * A core feature or a feature in a user's access columns (criterion
	 * 1ca9b3b4): its name and its count; one the user can enter opens the next
	 * level, one it cannot reads greyed.
	 */
	interface Props {
		name: string;
		/** "3 of 9 features", "7 actions". */
		meta: string;
		/** The next level; null in the No access column. */
		href: string | null;
	}
	let { name, meta, href }: Props = $props();
</script>

{#if href}
	<a {href} class="group/reach flex min-h-[52px] items-center gap-2.5 px-[18px] py-2.5 text-evo-ink no-underline transition-colors duration-150 hover:bg-evo-hover hover:text-evo-ink">
		<span class="min-w-0 flex-1">
			<span class="block font-semibold text-evo-ink">{name}</span>
			<span class="mt-0.5 block text-sm text-evo-ink-2">{meta}</span>
		</span>
		<svg class="flex-none text-evo-ink transition-transform duration-200 group-hover/reach:translate-x-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
	</a>
{:else}
	<div class="flex min-h-[52px] items-center px-[18px] py-2.5">
		<span class="min-w-0 flex-1">
			<span class="block font-medium text-evo-muted">{name}</span>
			<span class="mt-0.5 block text-sm text-evo-muted">{meta}</span>
		</span>
	</div>
{/if}
