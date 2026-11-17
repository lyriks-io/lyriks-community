<script lang="ts">
	import { markerStyleVars, themeStyleVars } from '$domain/experience';
	import type { ExperienceStore } from '$ui/experience/draft-store.svelte';
	import NodeRenderer from '$ui/experience/builder/NodeRenderer.svelte';

	/**
	 * A reusable component drawn the way it renders on a screen: its builder
	 * tree, with the project's theme and sample data, scaled down to the card
	 * and inert (nothing in it can be clicked or edited from here).
	 */
	interface Props {
		store: ExperienceStore;
		componentId: string;
	}
	let { store, componentId }: Props = $props();
	const rootId = $derived(store.draft.builder.screenRoots[componentId] ?? null);
	const look = $derived(`${themeStyleVars(store.draft.builder.theme)};${markerStyleVars(store.draft.brand.markers)};background:var(--sim-bg)`);
</script>

<div class="sim-scope relative h-[120px] overflow-hidden border border-line" style={look} inert>
	{#if rootId}
		<div class="pointer-events-none absolute inset-0 origin-top-left scale-[0.75] overflow-hidden p-3.5" style="width:133.33%;height:133.33%;font-family:var(--sim-font);color:var(--sim-ink)">
			<NodeRenderer {store} nodeId={rootId} mode="run" />
		</div>
	{/if}
</div>
