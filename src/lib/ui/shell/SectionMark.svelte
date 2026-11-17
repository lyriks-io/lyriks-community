<script lang="ts" module>
	/** The pixel mark of each section (design v4, criterion 65fdff0a of feat-feedback-docs), five cells by five. */
	const MARKS: Readonly<Record<string, readonly string[]>> = {
		'Reverse-Specification': ['01110', '10001', '10001', '01110', '00011'],
		Specification: ['11110', '10011', '10001', '10001', '11111'],
		Discussion: ['11111', '10001', '10001', '11111', '01000'],
		Evolution: ['10010', '10010', '10100', '11000', '10000'],
		Implementation: ['00000', '01010', '10001', '01010', '00000'],
		'Code watch': ['00000', '01110', '11011', '01110', '00000'],
		Team: ['01110', '01110', '00100', '11111', '11111']
	};
</script>

<script lang="ts">
	let { section, faded = false }: { section: string; faded?: boolean } = $props();
	const cells = $derived((MARKS[section] ?? MARKS.Specification).join('').split(''));
</script>

<span class="pix" class:faded aria-hidden="true">
	{#each cells as cell, i (i)}<i class:on={cell === '1'}></i>{/each}
</span>

<style>
	.pix {
		display: grid;
		flex: none;
		width: 24px;
		height: 24px;
		grid-template-columns: repeat(5, 3px);
		grid-auto-rows: 3px;
		gap: 1px;
		align-content: center;
		justify-content: center;
		background: var(--color-ink);
	}
	.pix.faded {
		background: var(--color-ink-4);
	}
	i {
		display: block;
	}
	i.on {
		background: var(--color-paper);
	}
</style>
