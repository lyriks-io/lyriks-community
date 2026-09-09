<script lang="ts">
	interface Props {
		kicker: string;
		title: string;
		help?: string;
	}
	let { kicker, title, help }: Props = $props();
</script>

<div>
	<div class="text-[10px] font-bold uppercase tracking-widest text-brand-500">{kicker}</div>
	<div class="mt-1 text-base font-semibold text-ink-900">{title}</div>
	{#if help}
		<p class="mt-1 text-xs text-ink-500">{help}</p>
	{/if}
</div>
