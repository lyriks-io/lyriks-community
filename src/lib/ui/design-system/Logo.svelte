<script lang="ts">
	// The Lyriks logomark: three flat bars, blue (Product), violet (Coherence)
	// and orange (Business), each with a hard offset outline in the current text
	// colour, so it reads ink on paper and paper on ink. Drawn square on a 128
	// grid; static/favicon.svg draws the same geometry, change both together.
	let { size = 28, class: klass = '' }: { size?: number; class?: string } = $props();
	const BARS = [
		{ y: 0, width: 72, fill: 'var(--color-blue)' },
		{ y: 35, width: 72, fill: 'var(--color-violet)' },
		{ y: 70, width: 120, fill: 'var(--color-orange)' }
	];
</script>

<svg
	class={klass}
	width={size}
	height={size}
	viewBox="0 -10 128 128"
	xmlns="http://www.w3.org/2000/svg"
	role="img"
	aria-label="Lyriks"
>
	{#each BARS as bar (bar.y)}
		<rect x="6" y={bar.y + 8} width={bar.width} height="28" fill="none" stroke="currentColor" stroke-width="2.5" />
		<rect x="0" y={bar.y} width={bar.width} height="28" style:fill={bar.fill} />
	{/each}
</svg>
