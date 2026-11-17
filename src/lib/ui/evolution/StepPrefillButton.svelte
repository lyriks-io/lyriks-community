<script lang="ts">
	import { untrack } from 'svelte';
	import { Icon, pushToast } from '$ui/design-system';
	import { ANOTHER_STEP_PREFILL, NOTHING_TO_PREFILL, type StepPrefillSection } from '$domain/evolution';
	import { useLiveSession } from './live-session.svelte';
	import { markPlace, placeOnPage } from './evo-scroll';

	/**
	 * 'Prefill the whole step with my AI' (ac-evo-live-prefill-step): the magic
	 * icon on the pill of the step shown. A click has the reader's AI walk the
	 * step section by section; the page brings the section it is on under the
	 * header and marks it, and the icon reads where the run stands (2/3) beside
	 * the cross that stops it. Outside a request page it shows nothing.
	 */
	interface Props {
		/** The step of the page, as the tabs name it. */
		step: string;
		/** What the person calls it: the Briefing, the Solution. */
		label: string;
		/** The sections a run would walk, in the order the step shows them. */
		sections: readonly StepPrefillSection[];
	}
	let { step, label, sections }: Props = $props();

	const live = useLiveSession();
	const run = $derived(live?.stepPrefill?.step === step ? live.stepPrefill : null);
	const running = $derived(run?.state === 'running');
	const elsewhere = $derived(live?.stepPrefill?.state === 'running' && live.stepPrefill.step !== step);
	const refusal = $derived(live?.refusal('prefill') ?? null);
	const blocked = $derived(sections.length === 0 || elsewhere);
	const tip = $derived(
		[
			`Prefill the whole ${label} with my AI: section by section, Lyriks suggests answers and asks what it misses, then moves on to the next section.`,
			run?.state === 'done' ? `Your AI prefilled the ${label}: click to prefill it again.` : null,
			sections.length === 0 ? NOTHING_TO_PREFILL : elsewhere ? ANOTHER_STEP_PREFILL : refusal
		]
			.filter(Boolean)
			.join(' ')
	);
	/** The run reads started at once, section 1 of the step (ac-evo-form-edit-optimistic). */
	function start() {
		if (!live) return;
		if (blocked) {
			pushToast({ level: 'info', message: sections.length === 0 ? NOTHING_TO_PREFILL : ANOTHER_STEP_PREFILL });
			return;
		}
		void live.startStepPrefill(step, label, sections);
	}

	// The page follows the run: each section it moves to comes under the header, marked; the end is said once.
	let seen = untrack(() => (run ? `${run.id}:${run.section}:${run.state}` : null));
	$effect(() => {
		const current = run;
		const key = current ? `${current.id}:${current.section}:${current.state}` : null;
		untrack(() => {
			if (key === seen) return;
			seen = key;
			if (current?.state === 'running') void placeOnPage([current.sectionId]).then((el) => el && markPlace(el));
			else if (current?.state === 'done')
				pushToast({ level: 'success', message: `Your AI prefilled the ${label}: accept or reject its suggestions, then validate each section` });
		});
	});
</script>

{#if live}
	{#if running && run}
		<span class="inline-flex h-8 items-center gap-1 bg-violet-ink pl-2.5 pr-0.5 font-evo-mono text-xs font-bold text-paper" role="status" title={`Your AI prefills the ${label}: section ${run.section} of ${run.of}`}>
			<Icon name="sparkles" size={14} class="animate-lk-pulse" />
			<span class="tabular-nums">{run.section}/{run.of}</span>
			<button type="button" class="flex size-7 items-center justify-center hover:bg-paper/20" title="Stop the prefill: the section in your AI's hands finishes" aria-label="Stop the prefill" onclick={() => void live.stopStepPrefill()}>
				<Icon name="x" size={12} />
			</button>
		</span>
	{:else}
		<!-- A filled violet square, the LLM's voice, that stands out on the pill, session or not: only a run that cannot go reads faded (ac-evo-live-prefill-step). -->
		<button
			type="button"
			class="inline-flex size-8 items-center justify-center {blocked ? 'bg-paper/15 text-paper/50' : 'bg-violet-ink text-paper hover:brightness-110'}"
			title={tip}
			aria-label={tip}
			onclick={start}
		>
			<Icon name={run?.state === 'done' ? 'check' : 'sparkles'} size={15} />
		</button>
	{/if}
{/if}
