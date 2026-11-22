<script lang="ts">
	import type { RetrospecScope } from '$domain/retrospec';
	import type { NextAnalysisView } from '$lib/shared/code-drift-page';
	import { useProjectAiSession } from '$ui/ai-session/project-ai-session.svelte';
	import { confirmDialog } from '$ui/design-system';
	import { copyRunPrompt, handRunToMyAi, handsInSession } from '$ui/retrospec/run-handover';
	import { sendRetrospecActs } from '$ui/retrospec/review.svelte';
	import { BTN_MAIN } from '$ui/spec360/page/look';

	/**
	 * The next analysis at the head of Mismatch, while no run is under way
	 * (criterion d44eb4e4, EVO-014): Delta analysis, Full analysis and, after a
	 * run closed before its final check, Resume analysis, the default ticked
	 * (criterion 04f3bc85); Run it with my AI asks first what the run reads
	 * (criterion bf0ea80c), then starts it and hands it to the AI in session, or
	 * copies its prompt on the spot when none listens (criteria 91e59d2e,
	 * 6f022f18). The person stays on Mismatch, where the preview takes over.
	 */
	interface Props {
		projectId: string;
		productName: string;
		offer: NextAnalysisView;
	}
	let { projectId, productName, offer }: Props = $props();
	const ai = useProjectAiSession();

	let ticked = $state<RetrospecScope | null>(null);
	// The default follows the page as it reads again; a tick of the person holds until the run starts.
	const chosen = $derived(ticked && offer.choices.some((c) => c.scope === ticked && !c.unavailable) ? ticked : offer.scope);
	let busy = $state(false);

	async function run() {
		const choice = offer.choices.find((c) => c.scope === chosen);
		if (!choice || choice.unavailable || !(await confirmDialog({ ...choice.question, confirmLabel: 'Launch' }))) return;
		const inSession = handsInSession(ai);
		// No AI listens: the prompt is copied at the press, while the browser still lets the page write to the clipboard.
		if (!inSession) await copyRunPrompt('run', choice.prompt);
		busy = true;
		const started = await sendRetrospecActs(projectId, [{ op: 'start', mode: 'repo', scope: choice.scope }], 'Launching the analysis');
		if (started && inSession && ai) await handRunToMyAi(ai, 'run', productName);
		if (started) ticked = null;
		busy = false;
	}
</script>

<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-next-run>
	<span class="font-evo-mono text-xs font-bold tracking-[0.06em] text-ink-3 uppercase">Next analysis</span>
	<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What the next Reverse-Specification reads">
		{#each offer.choices as choice (choice.scope)}
			<button
				type="button"
				role="radio"
				aria-checked={chosen === choice.scope}
				disabled={busy || !!choice.unavailable}
				title={choice.unavailable ?? choice.sub}
				class="inline-flex min-h-[34px] cursor-pointer items-center gap-2 border-[1.5px] px-3 text-[0.8125rem] font-semibold disabled:cursor-not-allowed disabled:opacity-45 {chosen === choice.scope ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink'}"
				onclick={() => (ticked = choice.scope)}
				data-scope={choice.scope}
			>
				{choice.title}
			</button>
		{/each}
	</div>
	<button type="button" class={BTN_MAIN} disabled={busy} onclick={() => void run()} data-run-with-my-ai>Run it with my AI</button>
	{#each offer.choices.filter((c) => c.unavailable) as choice (choice.scope)}
		<span class="w-full text-[0.8125rem] text-ink-3" data-scope-unavailable={choice.scope}>{choice.title}: {choice.unavailable}</span>
	{/each}
</div>
