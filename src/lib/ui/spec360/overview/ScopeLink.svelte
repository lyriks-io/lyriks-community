<script lang="ts">
	import type { ScopeBoundaryView } from '$application/spec360/scope-boundary';

	/**
	 * The Overview's discreet way to the Scope drawer while what is out of scope
	 * waits for approval (criteria 3b04797c, 9424a65d): <n> out of scope, To
	 * approve. Once approved it is gone; the approval reads in the History of
	 * the Reverse page. It opens the drawer; nothing else moves.
	 */
	interface Props {
		view: ScopeBoundaryView;
		onOpen: () => void;
	}
	let { view, onOpen }: Props = $props();
</script>

<button
	type="button"
	id="kb-scope"
	class="inline cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[inherit] text-ink-2 underline decoration-line decoration-1 underline-offset-[3px] hover:text-ink hover:decoration-ink"
	aria-haspopup="dialog"
	onclick={onOpen}
>{view.leftOutCount} out of scope</button><span class="ml-1.5 font-evo-mono text-[0.6875rem] tracking-[0.06em] text-orange-ink uppercase">To approve</span>
