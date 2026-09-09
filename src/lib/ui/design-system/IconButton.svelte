<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	interface Props {
		name: IconName;
		/** Accessible name — also the hover tooltip. */
		label: string;
		size?: number;
		/** Destructive affordance: hover turns danger-red. */
		danger?: boolean;
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		class?: string;
	}
	let { name, label, size = 13, danger = false, disabled = false, onclick, class: klass = '' }: Props = $props();
</script>

<!-- Icon-only button with a ≥24px hit area (WCAG 2.5.8) around a small glyph. -->
<button
	type="button"
	{disabled}
	{onclick}
	title={label}
	aria-label={label}
	class="grid size-6 shrink-0 place-items-center rounded text-ink-400 transition-colors disabled:opacity-30 {danger
		? 'hover:bg-danger-50 hover:text-danger-600'
		: 'hover:bg-surface-sunken hover:text-ink-700'} {klass}"
>
	<Icon {name} {size} />
</button>
