<script lang="ts">
	import { HelpTip, type HelpEntry } from '$ui/design-system';

	/**
	 * The heading every capability page opens with: eyebrow, title, one paragraph
	 * of intent — and, in its top-right corner, the "?" that explains the page.
	 *
	 * The help used to be rendered by the top bar and positioned over whatever page
	 * was beneath it, so no page owned that corner and the portfolio had to reserve
	 * an empty lane to keep the button off its own actions. Here it is part of the
	 * heading's flow: it belongs to the page, moves with it, and scrolls with it.
	 *
	 * Nine pages repeated this markup verbatim; they now share it, which is what
	 * keeps the eyebrow/title/description rhythm identical across the wizard.
	 */
	interface Props {
		/** Small brand-tinted kicker above the title — the capability's name. */
		eyebrow: string;
		/** The page's promise, in one sentence. */
		title: string;
		/** Optional paragraph: what this page is for, in plain English. */
		description?: string;
		/** Optional didactic help; renders the "?" in the corner when present. */
		help?: HelpEntry;
		/** Extra classes for the header element (spacing tweaks per page). */
		class?: string;
	}
	let { eyebrow, title, description, help, class: klass = 'mb-6' }: Props = $props();
</script>

<header class="flex items-start gap-4 {klass}">
	<div class="min-w-0 flex-1">
		<p class="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">{eyebrow}</p>
		<h1 class="mt-1 text-3xl font-bold tracking-tight text-ink-900">{title}</h1>
		{#if description}
			<p class="mt-2 max-w-2xl text-sm text-ink-500">{description}</p>
		{/if}
	</div>
	{#if help}
		<HelpTip variant="page" {...help} />
	{/if}
</header>
