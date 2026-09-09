<script lang="ts">
	import { Icon } from '$ui/design-system';

	interface Props {
		queued: boolean;
		onToggle: () => void;
	}
	let { queued, onToggle }: Props = $props();
</script>

<button
	type="button"
	onclick={(e) => {
		e.stopPropagation();
		onToggle();
	}}
	aria-pressed={queued}
	title={queued ? 'In the work queue (click to remove)' : 'Add to the work queue'}
	class="grid size-6 shrink-0 place-items-center rounded-md transition-colors {queued
		? 'bg-brand-50 text-brand-600'
		: 'text-ink-300 hover:bg-surface-sunken hover:text-brand-500'}"
>
	<Icon name="flag" size={12} />
</button>
