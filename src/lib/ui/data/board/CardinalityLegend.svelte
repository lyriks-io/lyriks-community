<script lang="ts">
	import { RING_R, endMarks, type RelationEnd } from './crows-foot';

	/**
	 * What the crow's foot marks at the ends of a relation line say (criterion
	 * 584cb5f6), each drawn as the map draws it: a short line meeting a table
	 * edge on its right.
	 */
	const W = 30;
	const H = 14;
	const ENDS: { end: RelationEnd; label: string }[] = [
		{ end: { min: 1, many: false }, label: 'one' },
		{ end: { min: 0, many: false }, label: 'zero or one' },
		{ end: { min: 0, many: true }, label: 'zero or many' },
		{ end: { min: 1, many: true }, label: 'one or many' }
	];
	const glyphs = ENDS.map(({ end, label }) => ({ label, ...endMarks({ x: W - 2, y: H / 2, out: -1 }, end) }));
</script>

{#each glyphs as g (g.label)}
	<span class="flex items-center gap-1">
		<svg width={W} height={H} viewBox="0 0 {W} {H}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" class="text-ink-500">
			<path d="M 0 {H / 2} L {W - 2} {H / 2} M {W - 1.5} 1 L {W - 1.5} {H - 1}" />
			<path d={g.d} />
			{#if g.ring}<circle cx={g.ring.x} cy={g.ring.y} r={RING_R} fill="var(--color-surface)" />{/if}
		</svg>
		{g.label}
	</span>
{/each}
