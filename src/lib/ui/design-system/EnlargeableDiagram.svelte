<script lang="ts">
	import type { Snippet } from 'svelte';
	import DiagramHeader from './DiagramHeader.svelte';
	import EnlargedBackdrop from './EnlargedBackdrop.svelte';
	import Icon from './Icon.svelte';
	import { DiagramEnlarger, frameClass, portalWhile } from './enlarge.svelte';
	import { dragToScroll } from './drag-to-scroll';

	/**
	 * Any schema of the app, openable large (feat-fb747-diagram-fullscreen): in
	 * its card it wears an expand icon at its top right; enlarged, it fills the
	 * page under its title, closed by the cross, Escape or a click beside it. The
	 * schema is told whether it is enlarged, so it can take the room. Held and
	 * dragged, a schema overflowing its box moves around in it (drag-to-scroll).
	 * A schema already drawn in a PanZoomCanvas with its own enlarger does not
	 * need this frame.
	 */
	interface Props {
		/** What the schema shows, heading the enlarged dialog. */
		title: string;
		children: Snippet<[boolean]>;
		class?: string;
		/** Where the expand icon sits and how big it is: a schema with a toolbar puts it at the toolbar's end, as tall as its controls. */
		trigger?: string;
	}
	let { title, children, class: klass = '', trigger = 'top-2 right-2 size-8' }: Props = $props();

	const enlarger = new DiagramEnlarger();
	$effect(() => enlarger.attach());
</script>

<EnlargedBackdrop {enlarger} />
<div
	use:portalWhile={enlarger.enlarged}
	{@attach dragToScroll}
	class={enlarger.enlarged ? `${frameClass(enlarger.display)} gap-3` : `relative ${klass}`}
	role={enlarger.enlarged ? 'dialog' : undefined}
	aria-modal={enlarger.enlarged ? 'true' : undefined}
	aria-label={enlarger.enlarged ? `${title}, enlarged` : undefined}
>
	{#if enlarger.enlarged}
		<DiagramHeader {enlarger} {title} />
		<div class="min-h-0 flex-1 overflow-auto">{@render children(true)}</div>
	{:else}
		{@render children(false)}
		<button
			type="button"
			class="absolute {trigger} z-10 grid place-items-center border-[1.5px] border-line bg-paper text-ink-3 transition-colors hover:border-ink hover:text-ink"
			aria-label="Open {title} large"
			title="Open large"
			onclick={() => enlarger.open()}
		>
			<Icon name="expand" size={14} />
		</button>
	{/if}
</div>
