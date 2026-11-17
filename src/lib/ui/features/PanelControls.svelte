<script lang="ts">
	import { Icon } from '$ui/design-system';

	/**
	 * Collapse and Close of the feature slide-over, kept in its header so the
	 * reader never scrolls to the foot of a long panel to leave it (spec:
	 * criterion fa87f754). Collapse shows only in the wide view.
	 */
	interface Props {
		expanded: boolean;
		onCollapse: () => void;
		onClose: () => void;
	}
	let { expanded, onCollapse, onClose }: Props = $props();
</script>

{#if expanded}
	<button
		type="button"
		onclick={onCollapse}
		class="inline-flex items-center rounded-field border border-line bg-surface p-1.5 text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
		aria-label="Collapse"
		title="Back to the narrow view (Escape)"
	>
		<Icon name="chevron-right" size={13} />
	</button>
{/if}
<button
	type="button"
	onclick={onClose}
	class="inline-flex items-center rounded-field border border-line bg-surface p-1.5 text-ink-400 hover:bg-surface-sunken hover:text-ink-700"
	aria-label="Close panel"
	title="Close panel"
>
	<Icon name="x" size={13} />
</button>
