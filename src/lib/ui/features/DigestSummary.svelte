<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { renderMarkdown } from '$ui/design-system/markdown';

	/**
	 * The engine's plain-language account of a scope of the model (a feature or
	 * one of its actions): derived from the model, never written by anyone. One
	 * block for both panels, so a feature and an action read their summary the
	 * same way.
	 */
	interface Props {
		/** The digest to show, already trimmed of what the panel's header repeats. */
		markdown: string | null;
		loading: boolean;
		/** What to say when there is nothing to show; nothing is shown when absent. */
		emptyText?: string | null;
		/** Read by a screen reader while the engine answers. */
		loadingLabel: string;
	}
	let { markdown, loading, emptyText = null, loadingLabel }: Props = $props();
</script>

{#if markdown}
	<div class="rounded-field border border-line bg-surface-sunken/40 p-3">
		<p
			class="mb-1.5 flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400"
		>
			<Icon name="list" size={12} class="text-brand-500" /> Summary
			<span class="text-[0.5625rem] font-medium normal-case tracking-normal text-ink-300">
				· read from the model, not written by anyone
			</span>
		</p>
		<!-- eslint-disable-next-line svelte/no-at-html-tags (sanitized by renderMarkdown) -->
		<article class="md-digest text-[0.6875rem] leading-relaxed text-ink-700">
			{@html renderMarkdown(markdown)}
		</article>
	</div>
{:else if loading}
	<div class="rounded-field border border-line bg-surface-sunken/40 p-3" aria-busy="true">
		<p
			class="mb-2 flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400"
		>
			<Icon name="list" size={12} class="text-ink-300" /> Summary
		</p>
		<div class="animate-pulse space-y-1.5" aria-hidden="true">
			<div class="h-2 w-1/3 rounded bg-line"></div>
			<div class="h-2 w-11/12 rounded bg-line"></div>
			<div class="h-2 w-4/5 rounded bg-line"></div>
			<div class="h-2 w-10/12 rounded bg-line"></div>
			<div class="h-2 w-2/3 rounded bg-line"></div>
		</div>
		<p class="sr-only">{loadingLabel}</p>
	</div>
{:else if emptyText}
	<div class="rounded-field border border-line bg-surface-sunken/40 p-3">
		<p
			class="mb-1 flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-ink-400"
		>
			<Icon name="list" size={12} class="text-ink-300" /> Summary
		</p>
		<p class="text-[0.6875rem] text-ink-400">{emptyText}</p>
	</div>
{/if}

<style>
	/* Typography for the sanitized digest injected via {@html}, sized for the
	   drawer (the file viewer's own scale is a full page). */
	.md-digest :global(h2),
	.md-digest :global(h3) {
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-400);
		margin: 0.9em 0 0.4em;
	}
	.md-digest :global(h2:first-child),
	.md-digest :global(h3:first-child) {
		margin-top: 0;
	}
	.md-digest :global(p),
	.md-digest :global(ul),
	.md-digest :global(ol),
	.md-digest :global(blockquote) {
		margin: 0.45em 0;
	}
	.md-digest :global(ul),
	.md-digest :global(ol) {
		padding-left: 1.1em;
		list-style: disc;
	}
	.md-digest :global(li) {
		margin: 0.2em 0;
	}
	.md-digest :global(li)::marker {
		color: var(--color-ink-300);
	}
	.md-digest :global(strong) {
		font-weight: 600;
		color: var(--color-ink-900);
	}
	.md-digest :global(blockquote) {
		border-left: 2px solid var(--color-line);
		padding-left: 0.6em;
		color: var(--color-ink-500);
	}
	.md-digest :global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.92em;
	}
</style>
