<script lang="ts">
	import type { SpecNews } from '$application/spec360/spec-news';
	import { relativeWhen } from '$ui/evolution/relative-when';

	/**
	 * What entered or changed in the specification lately (criteria 2a6bff42,
	 * b0950115): New or Changed, the request that brought it and when on hover.
	 */
	let { news }: { news: SpecNews } = $props();
	const tip = $derived(
		news.by
			? `${news.kind === 'new' ? 'Added' : 'Changed'} by ${news.by}, live ${relativeWhen(news.at)}; opening it takes the badge off`
			: `New in the specification: appeared ${relativeWhen(news.at)}`
	);
</script>

<span
	class="inline-flex flex-none items-center border-[1.5px] border-blue px-1.5 py-px font-evo-mono text-[0.625rem] font-bold tracking-[0.06em] text-blue-ink uppercase"
	title={tip}>{news.kind === 'new' ? 'New' : 'Changed'}</span
>
