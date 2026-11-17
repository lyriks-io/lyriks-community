<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { useArrival } from './arrival.svelte';

	/**
	 * The one line an address leaves where it landed (ac-leaf-6709493f): beside
	 * the place it concerns (`anchor`), or at the top of the request when the
	 * place left nothing to open (`top`). It belongs to the arrival and goes with
	 * it, by the person's own close button too (ac-evo-link-arrival-only).
	 */
	interface Props {
		/** The element id of the place this note sits beside. */
		anchor?: string;
		/** The note of an arrival that left nothing to open, at the top of the request. */
		top?: boolean;
	}
	let { anchor, top = false }: Props = $props();

	const arrival = useArrival();
	const text = $derived(!arrival?.place ? null : top ? (arrival.place.anchor === null ? arrival.place.text : null) : anchor ? arrival.noteBeside(anchor) : null);
</script>

{#if text}
	<p class="flex items-start gap-2 rounded-evo-btn border-l-[6px] border-orange bg-orange-tint px-3 py-2 text-xs text-evo-ink-2" role="status" data-arrival-note>
		<Icon name="info" size={13} class="mt-0.5 shrink-0 text-orange-ink" />
		<span class="min-w-0 flex-1">{text}</span>
		<button type="button" class="shrink-0 text-ink-3 hover:text-ink" aria-label="Close this note" onclick={() => arrival?.leave()}>
			<Icon name="x" size={12} />
		</button>
	</p>
{/if}
