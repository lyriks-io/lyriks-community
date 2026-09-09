<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		padding?: boolean;
		children: Snippet;
	}
	let { class: klass = '', padding = true, children }: Props = $props();
</script>

<section
	class="rounded-card border border-line bg-surface shadow-card {padding ? 'p-6 sm:p-7' : ''} {klass}"
>
	{@render children()}
</section>
