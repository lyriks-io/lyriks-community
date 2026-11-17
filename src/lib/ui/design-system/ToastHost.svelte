<script lang="ts">
	import type { ToastLevel } from '$application/ports';
	import { flip } from 'svelte/animate';
	import { cubicIn, cubicOut } from 'svelte/easing';
	import Icon from './Icon.svelte';
	import { flyOrFade } from './reduced-motion';
	import { toasts, dismissAllToasts, dismissToast, holdToast, releaseToast, type Toast } from './toast.svelte';

	// At most this many show at once; the older ones fold into one line that unfolds them (criterion cb973a27).
	const SHOWN = 3;
	const stack = $derived(toasts());
	let unfolded = $state(false);
	const folded = $derived(unfolded ? 0 : Math.max(0, stack.length - SHOWN));
	const shown = $derived(stack.slice(folded));
	$effect(() => {
		if (stack.length <= SHOWN) unfolded = false;
	});

	// The design's toast (.ly-toast): an ink bar whose 4px left edge, and its square, say the level in the hue.
	const dot: Record<ToastLevel, string> = {
		success: 'bg-green',
		info: 'bg-blue-on-ink',
		warn: 'bg-orange',
		error: 'bg-red-on-ink'
	};
	const edge: Record<ToastLevel, string> = {
		success: 'border-green',
		info: 'border-blue-on-ink',
		warn: 'border-orange',
		error: 'border-red-on-ink'
	};

	function runAction(t: Toast) {
		t.action?.run();
		dismissToast(t.id);
	}

	// A toast waits while the pointer is on it or the keyboard in it, and only then (criterion 8613eec9).
	function left(e: PointerEvent, t: Toast) {
		const el = e.currentTarget as HTMLElement;
		if (!el.contains(document.activeElement)) releaseToast(t.id);
	}
	function blurred(e: FocusEvent, t: Toast) {
		const el = e.currentTarget as HTMLElement;
		if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
		if (!el.matches(':hover')) releaseToast(t.id);
	}
</script>

<!-- Always there, so the last toast can leave the way it came. It rises in and sinks away, fading; those
     still shown slide to their new place; with reduced motion it only fades (criterion 8613eec9). -->
<div class="pointer-events-none fixed bottom-[calc(var(--app-foot-h,0px)+24px)] left-1/2 z-[60] flex w-max max-w-[calc(100vw-48px)] -translate-x-1/2 flex-col items-center gap-2">
	{#if folded > 0 || (unfolded && stack.length > SHOWN)}
		<div class="pointer-events-auto flex items-center gap-3 bg-ink px-3 py-1.5 font-evo text-xs text-paper" data-reduced-fade transition:flyOrFade={{ y: 8, duration: 180 }}>
			<button type="button" class="min-h-8 cursor-pointer border-0 bg-transparent px-1 font-bold text-paper underline underline-offset-4" aria-expanded={unfolded} onclick={() => (unfolded = !unfolded)}
				>{unfolded ? 'Fold the older messages' : `${folded} more`}</button
			>
			<button type="button" class="min-h-8 cursor-pointer border-0 bg-transparent px-1 text-ink-4 hover:text-paper" onclick={dismissAllToasts}>Dismiss all</button>
		</div>
	{/if}
	{#each shown as t (t.id)}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			role={t.level === 'error' ? 'alert' : 'status'}
			aria-live={t.level === 'error' ? 'assertive' : 'polite'}
			class="pointer-events-auto flex max-w-md items-center gap-3 border-l-4 bg-ink py-2.5 pr-3 pl-4 font-evo text-paper {edge[t.level]}"
			data-reduced-fade
			in:flyOrFade={{ y: 16, duration: 280, easing: cubicOut }}
			out:flyOrFade={{ y: 16, duration: 200, easing: cubicIn }}
			animate:flip={{ duration: 240, easing: cubicOut }}
			onpointerenter={() => holdToast(t.id)}
			onpointerleave={(e) => left(e, t)}
			onfocusin={() => holdToast(t.id)}
			onfocusout={(e) => blurred(e, t)}
		>
			<span class="size-2.5 shrink-0 {dot[t.level]}" aria-hidden="true"></span>
			<!-- Clamped as a last guard: whatever the message, the close button stays in reach. -->
			<p class="line-clamp-3 min-w-0 flex-1 break-words text-[0.8125rem] leading-snug">{t.message}</p>
			{#if (t.count ?? 1) > 1}<span class="shrink-0 font-evo-mono text-xs font-bold text-paper" title="Came {t.count} times">×{t.count}</span>{/if}
			{#if t.action}
				<button type="button" class="min-h-9 shrink-0 border-[1.5px] border-paper bg-transparent px-3 text-xs font-bold tracking-[0.07em] text-paper uppercase shadow-press-paper transition-[transform,box-shadow] duration-75 hover:-translate-px active:translate-[3px] active:shadow-none" onclick={() => runAction(t)}>{t.action.label}</button>
			{/if}
			<button type="button" class="grid size-7 shrink-0 place-items-center text-ink-4 hover:text-paper" aria-label="Dismiss" onclick={() => dismissToast(t.id)}>
				<Icon name="x" size={14} />
			</button>
		</div>
	{/each}
</div>
