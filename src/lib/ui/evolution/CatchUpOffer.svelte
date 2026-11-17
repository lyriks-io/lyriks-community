<script lang="ts">
	import { FUNCTIONAL_DIAGRAM_KEY, type DrawableStep } from '$domain/evolution';
	import { Button, Icon } from '$ui/design-system';
	import { copyPrompt } from './copy-prompt';
	import LiveAiButton from './LiveAiButton.svelte';
	import { useLiveSession } from './live-session.svelte';

	/**
	 * What stands in place of a diagram, or of one of its texts, once the other
	 * side moved past it (ac-evo-func-uml-sync, ac-evo-tech-uml-sync,
	 * ac-evo-diagram-assistant): the ways to update it, side by side, and nothing
	 * more. The built-in assistant is offered only where an administrator switched
	 * it on; the person's own AI takes it as the click of 'Draw with my AI' on the
	 * step, session or not (ac-evo-live-no-session), and gets the prompt to paste
	 * outside a request page; and the person may always do it by hand, so no step
	 * is out of reach for want of an AI.
	 */
	interface Props {
		/** The act, said as one: "Update the diagram from the texts". */
		title: string;
		editable: boolean;
		/** An act of the card still running (a card that blocks while it saves); a request page never blocks. */
		busy?: boolean;
		assist: { readonly run: () => void; readonly drawing: boolean; readonly failure?: string | null } | null;
		/** What the person gives their own AI, through the MCP. */
		prompt: string;
		/** Doing it by hand: Draw it myself, Write it myself. */
		byHand?: { readonly label: string; readonly run: () => void } | null;
		/** The step whose texts and diagram are out of step: on a request page, the click of 'Draw with my AI' there. */
		step?: DrawableStep | null;
	}
	let { title, editable, busy = false, assist, prompt, byHand = null, step = null }: Props = $props();

	const live = useLiveSession();
	/** On a request page, 'With my AI' is the click of 'Draw with my AI' on the step, which catches up whichever side is behind (ac-evo-live-draw). */
	const draw = $derived(live && step ? { fieldPath: `step.${step}.${FUNCTIONAL_DIAGRAM_KEY}`, leafId: null, step } : null);
	const copy = () => copyPrompt(prompt, 'Prompt copied: paste it in a new conversation with your AI agent.');
</script>

<div class="rounded-field border-[1.5px] border-dashed border-ink-3 bg-paper px-4 py-5 text-center">
	<p class="text-sm font-bold text-ink-900">{title}</p>
	{#if editable}
		<div class="mt-3 flex flex-wrap justify-center gap-2">
			{#if assist}
				<Button size="sm" disabled={assist.drawing || busy} onclick={assist.run}>
					<Icon name="sparkles" size={12} />{assist.drawing ? 'Writing…' : 'With the built-in assistant'}
				</Button>
			{/if}
			{#if draw}
				<LiveAiButton kind="draw" target={draw} label="With my AI" disabled={busy} />
			{:else}
				<Button size="sm" variant={assist ? 'outline' : 'primary'} title={prompt} onclick={copy}>
					<Icon name="copy" size={12} />With my AI, through the MCP
				</Button>
			{/if}
			{#if byHand}
				<Button size="sm" variant="outline" disabled={busy} onclick={byHand.run}>
					<Icon name="pencil" size={12} />{byHand.label}
				</Button>
			{/if}
		</div>
		{#if assist?.failure}
			<p class="mt-2 text-xs text-red-ink"><span class="font-bold">Not written.</span> {assist.failure}</p>
		{/if}
	{/if}
</div>
