<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { clickedWithin, floatInView, Icon, pushToast } from '$ui/design-system';
	import { intoSideAsk } from '$ui/shell/side-ask';
	import { POP } from '$ui/spec360/page/look';

	let { fillPrompt, specPrompt = null, blocked = null, showStep = false, step }: {
		fillPrompt: string;
		specPrompt?: string | null;
		blocked?: string | null;
		showStep?: boolean;
		step?: Snippet;
	} = $props();
	let open = $state(false);
	let root = $state<HTMLElement | null>(null);
	let panel = $state<HTMLElement | null>(null);
	$effect(() => { if (blocked) open = false; });

	function close() {
		open = false;
		root?.querySelector<HTMLButtonElement>('button')?.focus();
	}
	async function toggle() {
		open = !open;
		if (open) {
			await tick();
			panel?.querySelector<HTMLButtonElement>('button')?.focus();
		}
	}

	async function copy(prompt: string) {
		if (blocked) return;
		try {
			await navigator.clipboard.writeText(prompt);
			close();
			pushToast({ level: 'success', message: 'Prompt copied: paste it into your AI. The decisions stay yours.' });
		} catch {
			pushToast({ level: 'error', message: 'The clipboard is not available here.' });
		}
	}
</script>

<svelte:window onkeydown={(event) => { if (open && event.key === 'Escape') close(); }} onpointerdown={(event) => { if (open && !clickedWithin(event.target, root, panel)) open = false; }} />

<span class="relative flex" bind:this={root} {@attach intoSideAsk}>
	<button type="button" class="si ask-row" aria-expanded={open} aria-haspopup="dialog" title={blocked ?? 'Ask my AI about this evolution'} disabled={!!blocked} onclick={() => void toggle()}>
		<span class="lab"><Icon name="sparkles" size={14} /><span class="txt">Ask my AI</span></span>
	</button>
	<!-- Keep the step's run observer mounted when the menu closes, so ongoing work still follows its sections. -->
	<div bind:this={panel} use:floatInView={{ anchor: root, align: 'left' }} style:display={open ? 'flex' : 'none'} role="dialog" tabindex="-1" aria-label="AI work on this evolution" class="w-80 max-w-[calc(100vw-32px)] flex-col gap-3 {POP} p-4 text-ink">
		<strong class="text-sm">This evolution</strong>
		<p class="m-0 text-xs text-ink-2">Choose the work to hand to your AI. You review each suggestion.</p>
		<button type="button" class="border border-line px-3 py-2 text-left text-sm hover:border-ink" onclick={() => void copy(fillPrompt)}>Copy the request brief</button>
		{#if specPrompt}<button type="button" class="border border-line px-3 py-2 text-left text-sm hover:border-ink" onclick={() => void copy(specPrompt)}>Write the specification</button>{/if}
		{#if step && showStep}<div class="flex items-center justify-between gap-3 text-sm"><span>Prefill the current step</span>{@render step()}</div>{/if}
	</div>
</span>
