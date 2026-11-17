<script lang="ts">
	import { BACK } from './look';

	/** "← All features": the page one level up, above the title (the design's .ly-back). */
	let { href, label }: { href: string; label: string } = $props();
</script>

<a {href} class="mb-2 inline-flex min-h-10 items-center gap-1.5 self-start {BACK} no-underline hover:underline">
	<span aria-hidden="true">←</span>{label}
</a>
