<script lang="ts">
	import { SIDE_ICONS, type IconShape, type SideIconName } from './side-icons';

	/** One pictogram of the navigation (see side-icons.ts), in the colour of its text. */
	let { name, size = 16, strokeWidth = 1.75, class: klass = '' }: { name: SideIconName; size?: number; strokeWidth?: number; class?: string } = $props();
	const shapes = $derived<readonly IconShape[]>(SIDE_ICONS[name]);
</script>

<svg class="inline-block flex-none {klass}" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="square" aria-hidden="true">
	{#each shapes as s, i (i)}
		{#if 'd' in s}<path d={s.d}></path>
		{:else if 'circle' in s}<circle cx={s.circle[0]} cy={s.circle[1]} r={s.circle[2]}></circle>
		{:else if 'ellipse' in s}<ellipse cx={s.ellipse[0]} cy={s.ellipse[1]} rx={s.ellipse[2]} ry={s.ellipse[3]}></ellipse>
		{:else}<rect x={s.rect[0]} y={s.rect[1]} width={s.rect[2]} height={s.rect[3]}></rect>{/if}
	{/each}
</svg>
