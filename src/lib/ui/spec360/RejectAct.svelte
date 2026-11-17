<script lang="ts">
	import { tick } from 'svelte';
	import { Icon, clickedWithin, floatInView, pushToast } from '$ui/design-system';
	import { sendChangeRequest } from './change-request';
	import { useDiscussions } from './discussions.svelte';
	import { useValidation } from './validation.svelte';
	import { FIELD, POP, PRESS_FILL, QUIET } from './page/look';

	/**
	 * The cross of an element's four acts (criterion a4ef7658): Request a change.
	 * It opens a small box under it, 'What should change?'; Send request rejects
	 * the element and opens a discussion on it with the text. Once a change is
	 * requested the cross reads filled orange, no button, until the element is
	 * validated again. Offered while a draft, to whoever may edit it and has not
	 * validated it.
	 */
	interface Props {
		anchor: string;
		/** What the element is called, for the discussion the request opens. */
		title: string;
		/** A 28 px square, where the acts close a head's text (criterion a4ef7658). */
		small?: boolean;
	}
	let { anchor, title, small = true }: Props = $props();
	const validation = useValidation();
	const discussions = useDiscussions();
	// Whoever validated the element no longer reads the cross: their check, which turns into Withdraw, is their way
	// back (criterion a4ef7658, owner 2026-11-07).
	const shown = $derived(validation.draft && validation.source.canWrite && !!validation.standing(anchor) && !validation.mine(anchor));
	const rejected = $derived(!!validation.standing(anchor)?.rejected);

	let open = $state(false);
	let note = $state('');
	let root = $state<HTMLSpanElement | null>(null);
	let panel = $state<HTMLSpanElement | null>(null);
	let field = $state<HTMLTextAreaElement | null>(null);

	async function toggle() {
		open = !open;
		if (!open) return;
		await tick();
		field?.focus();
	}

	function cancel() {
		open = false;
		note = '';
	}

	function send() {
		const reason = note.trim();
		if (!reason) return void pushToast({ level: 'info', message: 'Say what should change first' });
		cancel();
		void sendChangeRequest(validation, discussions, anchor, title, reason);
	}

	const ACT = $derived(`grid ${small ? 'size-7' : 'size-9'} flex-none place-items-center border-[1.5px] transition-colors duration-200`);
</script>

<svelte:window onpointerdown={(e) => open && !clickedWithin(e.target, root, panel) && cancel()} />

{#if shown}
	<span class="relative inline-flex" bind:this={root}>
		{#if rejected}
			<span class="{ACT} border-ink bg-orange text-ink" role="img" title="Change requested: it waits for a correction, then for its validations again" aria-label="Change requested" data-reject-state="requested">
				<Icon name="x" size={small ? 14 : 16} />
			</span>
		{:else}
			<button type="button" class="{ACT} cursor-pointer border-ink bg-paper text-ink hover:bg-red-tint hover:text-red-ink" aria-expanded={open} aria-haspopup="dialog" title="Request a change" aria-label="Request a change: {title}" data-reject-state="offered" onclick={toggle}>
				<Icon name="x" size={small ? 14 : 16} />
			</button>
		{/if}
		{#if open}
			<span bind:this={panel} use:floatInView={{ anchor: root, align: 'right' }} role="dialog" aria-label="Request a change on {title}" class="flex w-[320px] max-w-[calc(100vw-32px)] animate-lk-in-fast flex-col gap-2.5 {POP} p-3.5 text-left">
				<label class="flex flex-col gap-1.5">
					<span class="font-evo-mono text-[0.6875rem] tracking-[0.08em] text-ink-3 uppercase">What should change?</span>
					<textarea
						bind:this={field}
						bind:value={note}
						rows="3"
						placeholder="Say what is wrong or missing… (Ctrl+Enter to send)"
						class="box-border min-h-[72px] resize-y {FIELD} px-2.5 py-2 font-[inherit] text-[0.8125rem]"
						onkeydown={(e) => {
							if (e.key === 'Escape') cancel();
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
						}}
					></textarea>
				</label>
				<span class="flex items-center justify-end gap-3">
					<button type="button" class={QUIET} onclick={cancel}>Cancel</button>
					<button type="button" class="{PRESS_FILL} inline-flex h-8 items-center px-3 text-[0.6875rem]" onclick={send}>Send request</button>
				</span>
			</span>
		{/if}
	</span>
{/if}
