<script lang="ts">
	import { Icon } from '$ui/design-system';
	import { useProjectAiSession } from './project-ai-session.svelte';

	/**
	 * 'Re-read the code with my AI' on a feature of the Specification 360° read
	 * from the code, or a finding of the Retrospecification
	 * (ac-ai-session-reread): the reader's own AI reads that part of the code
	 * again and corrects what was extracted, then says in one sentence what it
	 * changed, shown under the button. Offered to who may edit the project; greyed
	 * without a session, a click copying the prompt that opens one.
	 */
	interface Props {
		page: 'spec' | 'retrospec';
		/** The place re-read: a Specification 360° anchor, or the finding's id. */
		anchor: string;
		title: string;
		featureId?: string;
		/** What the finding says, handed to the AI with it. */
		text?: string;
	}
	let { page, anchor, title, featureId, text }: Props = $props();
	const ai = useProjectAiSession();
	const click = $derived(ai?.clickOn('reread', anchor) ?? null);
	const pending = $derived(click?.state === 'waiting' || click?.state === 'taken');

	function reread() {
		void ai?.send({ kind: 'reread', page, anchor, title, ...(featureId ? { featureId } : {}), ...(text ? { text } : {}) });
	}
</script>

{#if ai?.canEdit()}
	<span class="flex flex-col items-start gap-1" data-reread-code>
		<button
			type="button"
			disabled={pending}
			title={ai.refusal ?? 'Lyriks reads this part of the code again and corrects what was extracted'}
			onclick={reread}
			class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 border-[1.5px] bg-transparent px-2.5 text-xs font-bold tracking-[0.07em] uppercase disabled:cursor-default disabled:opacity-40 {ai.isOpen ? 'pressable border-ink text-ink' : 'border-ink-3 text-ink-3'}"
		>
			<Icon name="code" size={13} />
			{click?.state === 'answered' ? 'Re-read the code again' : 'Re-read the code with my AI'}
		</button>
		{#if click?.state === 'waiting'}
			<span class="inline-flex items-center gap-1.5 font-evo-mono text-xs text-ink-3">
				<span class="animate-lk-pulse size-2 bg-orange" aria-hidden="true"></span>
				waiting for your AI
				<button type="button" class="cursor-pointer border-0 bg-transparent p-0 font-sans text-xs font-semibold text-ink underline decoration-[1.5px] underline-offset-[3px]" onclick={() => ai.withdraw(click.id)}>Withdraw</button>
			</span>
		{:else if click?.state === 'taken'}
			<span class="inline-flex items-center gap-1.5 font-evo-mono text-xs text-ink-3">
				<span class="animate-lk-pulse size-2 bg-orange" aria-hidden="true"></span>
				{ai.saying ? `Lyriks is re-reading · ${ai.saying}` : 'Lyriks is re-reading the code'}
			</span>
		{:else if click?.state === 'answered'}
			<span class="max-w-[520px] text-xs text-ink-2">{click.answeredNothing ? 'Lyriks answered nothing: ask again.' : click.answer}</span>
		{/if}
	</span>
{/if}
