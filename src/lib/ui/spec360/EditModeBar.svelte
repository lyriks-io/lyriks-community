<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { useEditMode } from './edit-mode.svelte';
	import { useEdits } from './edits.svelte';
	import { askToDiscard, leaveEdit, leaveLabel } from './leave-edit';

	/**
	 * The bar of the Edit mode, at the foot of the screen while it is on: it
	 * says the page is being edited and how, and its button leaves the mode,
	 * reading the same as the head's (Stop editing, or Cancel editing once a
	 * change is held), outlined like it: Save stays the mode's only filled
	 * button. It also holds the mode's keys (Ctrl/Cmd+E, Escape) for
	 * every page of the Specification 360°.
	 */
	const mode = useEditMode();
	const edits = useEdits();

	// Leaving the mode by its keys with changes held asks first (criterion 41514698): the keys only turn it on, or off with nothing held.
	function onkeydown(e: KeyboardEvent) {
		// While a block's editor is open, Escape is that editor's (its Cancel), never the mode's.
		if (e.key === 'Escape' && edits.editing) return;
		if (mode.active && edits.stagedCount > 0) {
			const leaving = mode.key({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, target: e.target });
			if (!leaving) return;
			e.preventDefault();
			mode.set(true);
			void leaveEdit(mode, edits);
			return;
		}
		if (mode.key(e)) e.preventDefault();
	}

	// Leaving the page with changes held asks first; a page of the Specification 360° keeps them (the mode lasts across them).
	beforeNavigate((nav) => {
		if (edits.stagedCount === 0 || !nav.to || nav.type === 'leave') return;
		if (nav.to.url.pathname.startsWith(`/projects/${encodeURIComponent(edits.projectId)}/spec`)) return;
		nav.cancel();
		const to = nav.to.url;
		void askToDiscard(edits).then((ok) => {
			if (ok) void goto(to);
		});
	});
</script>

<svelte:window
	{onkeydown}
	onbeforeunload={(e) => {
		if (edits.stagedCount > 0) e.preventDefault();
	}}
/>

{#if mode.active}
	<div
		role="status"
		class="animate-lk-in-fast fixed bottom-[calc(20px+var(--app-foot-h,0px)+env(safe-area-inset-bottom,0px))] left-[calc(50%+var(--side-w,0px)/2)] z-[90] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 bg-ink py-2.5 pr-3 pl-4 text-[0.8125rem] text-paper shadow-[4px_4px_0_var(--color-blue)]"
	>
		<span aria-hidden="true" class="size-2 flex-none animate-pulse bg-orange motion-reduce:animate-none"></span>
		<b class="font-bold">Edit mode</b>
		<span class="text-toner-2 max-[700px]:hidden">{edits.stagedCount > 0 ? `${edits.stagedCount} ${edits.stagedCount === 1 ? 'change waits' : 'changes wait'} for Save.` : 'Click any text to change it, then Save.'}</span>
		<button
			type="button"
			class="inline-flex h-8 cursor-pointer items-center border-[1.5px] border-paper bg-transparent px-3 font-evo text-[0.6875rem] font-bold tracking-[0.07em] text-paper uppercase hover:bg-paper hover:text-ink"
			onclick={() => void leaveEdit(mode, edits)}>{leaveLabel(edits)}</button
		>
	</div>
{/if}
