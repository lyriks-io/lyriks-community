<script lang="ts">
	import { Icon, pushToast } from '$ui/design-system';
	import type { HandOff, NextStepId, NextSteps } from './next-steps';
	import { ICON_BTN, KICKER, PRIMARY_44, SECONDARY_44 } from './evo-look';
	import { useLiveSession } from './live-session.svelte';

	/**
	 * What happens next, under the executive summary (ac-evo-verd-next-steps):
	 * the steps left until the change is live, the one to take now with its
	 * button, and where the project deploys from a branch, the git commands that
	 * merge the request's branch and report it. Once the change is live, what
	 * happened, then what comes next (ac-evo-verd-next-steps-done).
	 */
	interface Props {
		next: NextSteps;
		/** The reader may take the step that is due now. */
		canAct: boolean;
		onAct: (step: NextStepId) => void;
		/** The reader's role lets them hand a step of the close to their AI, the request open or closed. */
		mayHandOff: boolean;
	}
	let { next, canAct, onAct, mayHandOff }: Props = $props();

	/** Each step git or the index carries out can be handed to the reader's AI (ac-evo-verd-steps-to-ai). */
	const live = useLiveSession();
	const handTip = $derived(live?.isOpen ? 'Send to my AI' : 'Copy the brief for my AI');
	/** The AI is on this step right now: the step says so at a glance, with what the AI said it does (ac-evo-verd-steps-ai-working). */
	const onIt = (handOff: HandOff | undefined): boolean => !!handOff && live?.closeClick(handOff.step)?.state === 'taken';
	// The reader's AI at work: the LLM's voice, in the design's violet.
	const SPIN = 'animate-lk-spin size-3.5 flex-none rounded-full border-2 border-violet/30 border-t-violet-ink';

	const ACT: Record<Exclude<NextStepId, 'live'>, string> = { accept: 'Start acceptance testing →', approve: 'Approve the evolution →' };
	// The step marks of the design's stepper: done green, the current one orange, the rest toner-2.
	const MARK = {
		done: 'bg-green text-ink',
		now: 'bg-orange text-ink',
		later: 'bg-toner-2 text-ink-3'
	} as const;
	const WORD = { done: 'done', now: 'now', later: 'later' } as const;

	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			pushToast({ level: 'success', message: `${what} copied` });
		} catch {
			pushToast({ level: 'error', message: 'The clipboard is not available here.' });
		}
	}
	const copyCommands = () => copy((next.commands ?? []).join('\n'), 'The merge commands');
	// The design's prompt block (.ly-prompt): ink, paper mono text.
	const PRE = 'm-0 rounded-evo-btn bg-evo-ink px-4 py-3 font-evo-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap wrap-anywhere text-paper';
</script>

{#snippet toAi(handOff: HandOff)}
	{@const click = live?.closeClick(handOff.step) ?? null}
	{#if click?.state === 'taken'}
		<span class="inline-flex flex-none items-center gap-1.5 self-center bg-violet-tint px-2.5 py-1 font-evo-mono text-xs font-bold text-violet-ink">
			<span class={SPIN} aria-hidden="true"></span>Lyriks is on it
		</span>
	{:else if click?.state === 'waiting'}
		<span class="inline-flex flex-none items-center gap-1.5 self-center bg-violet-tint px-2.5 py-1 font-evo-mono text-xs font-bold text-violet-ink">
			<span class="animate-lk-pulse size-2 flex-none bg-orange" aria-hidden="true"></span>Lyriks has it
		</span>
	{:else}
		<button
			type="button"
			class="inline-flex size-9 flex-none items-center justify-center rounded-lg {ICON_BTN} text-violet-ink"
			title={handTip}
			aria-label={handTip}
			onclick={() => live && void live.sendClose(handOff.step, handOff.brief, mayHandOff)}
		>
			<Icon name="sparkles" size={15} />
		</button>
	{/if}
{/snippet}

{#snippet saying(handOff: HandOff | undefined)}
	{#if onIt(handOff) && live?.saying}
		<span class="flex items-center gap-1.5 text-[0.8125rem] font-medium text-violet-ink" aria-live="polite"><Icon name="sparkles" size={13} />{live.saying}</span>
	{/if}
{/snippet}

<section class="flex flex-col gap-4 rounded-evo-card border border-transparent bg-surface px-6 py-5" aria-label={next.live ? 'What happened' : 'What happens next'}>
	<span class={KICKER}>{next.live ? 'WHAT HAPPENED' : 'WHAT HAPPENS NEXT'}</span>
	<ol class="m-0 flex list-none flex-col gap-4 p-0">
		{#each next.steps as step, i (step.id)}
			<li class="flex gap-3.5">
				<span class="grid size-7 flex-none place-items-center font-evo-mono text-xs font-bold {onIt(step.handOff) ? 'bg-violet-tint' : MARK[step.state]}" aria-hidden="true"
					>{#if step.state === 'done'}<Icon name="check" size={14} />{:else if onIt(step.handOff)}<span class={SPIN}></span>{:else}{i + 1}{/if}</span
				>
				<div class="flex min-w-0 flex-1 flex-col gap-1.5">
					<span class="flex flex-wrap items-center gap-2">
						<span class="text-[0.9375rem] font-bold {step.state === 'later' ? 'text-ink-3' : 'text-evo-ink'}">{step.title}</span>
						<span class="sr-only">({WORD[step.state]})</span>
						{#if step.state === 'now'}<span class="border-[1.5px] border-orange bg-orange px-2 py-0.5 font-evo-mono text-xs font-bold tracking-[0.06em] text-ink uppercase">now</span>{/if}
					</span>
					<span class="text-sm leading-[1.55] {step.state === 'later' ? 'text-ink-3' : 'text-ink-2'}">{step.text}</span>
					{#if step.check}
						{@const check = step.check}
						{@const whole = check.found === check.carried}
						<!-- Read again on the specification as it stands: what the request carried, found or not (ac-evo-verd-landed-check). -->
						<span class="flex items-center gap-1.5 text-[0.8125rem] font-bold {whole ? 'text-green-ink' : 'text-red-ink'}">
							<Icon name={whole ? 'check' : 'circle-alert'} size={14} />
							{whole
								? `Checked in Knowledge: all ${check.carried} changes are there.`
								: `Checked in Knowledge: ${check.carried - check.found} of ${check.carried} changes are not there.`}
						</span>
						{#if !whole}
							<ul class="m-0 flex list-none flex-col gap-1 border-l-2 border-red pl-3 text-[0.8125rem] leading-[1.5] text-ink-2">
								{#each check.missing as miss, i (i)}
									<li><span class="font-semibold">{miss.where}</span> · {miss.what}</li>
								{/each}
							</ul>
						{/if}
					{/if}
					{#if step.id === 'live' && next.commands && step.state !== 'done'}
						<!-- The merge is made in git; reporting it is what makes the change official (ac-evo-branch-merge). -->
						<pre class="{PRE} mt-1">{next.commands.join('\n')}</pre>
						{#if step.state === 'now'}
							<div class="mt-1 flex items-center gap-2">
								<button type="button" class={SECONDARY_44} onclick={copyCommands}><Icon name="copy" size={14} />Copy the commands</button>
								{#if step.handOff && mayHandOff && live}{@render toAi(step.handOff)}{/if}
							</div>
							{@render saying(step.handOff)}
						{/if}
					{:else if step.state === 'now' && canAct}
						<button type="button" class="{PRIMARY_44} mt-1 self-start" onclick={() => onAct(step.id)}>{step.id === 'live' ? 'Close the evolution' : ACT[step.id]}</button>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
	{#if next.after.length > 0}
		<!-- Live: what is left is the person's AI and git, and the specification to read as it now stands. -->
		<span class="{KICKER} mt-2 border-t-[1.5px] border-ink pt-4">WHAT COMES NEXT</span>
		<ul class="m-0 flex list-none flex-col gap-4 p-0">
			{#each next.after as step (step.id)}
				<li class="flex gap-3.5">
					<span class="grid size-7 flex-none place-items-center bg-blue-tint text-blue-ink" aria-hidden="true"
						>{#if onIt(step.handOff)}<span class={SPIN}></span>{:else}<Icon name="arrow-right" size={14} />{/if}</span
					>
					<div class="flex min-w-0 flex-1 flex-col gap-1.5">
						{#if step.href}
							<a href={step.href} class="self-start text-[0.9375rem] font-bold text-evo-violet-ink no-underline hover:underline">{step.title} →</a>
						{:else}
							<span class="text-[0.9375rem] font-bold text-evo-ink">{step.title}</span>
						{/if}
						<span class="text-sm leading-[1.55] text-ink-2">{step.text}</span>
						{#if step.command}
							{@const command = step.command}
							<div class="mt-1 flex items-start gap-2">
								<pre class="{PRE} min-w-0 flex-1">{command}</pre>
								<button
									type="button"
									class="inline-flex size-9 flex-none items-center justify-center rounded-lg {ICON_BTN} text-ink"
									title="Copy the command"
									aria-label="Copy the command"
									onclick={() => copy(command, 'The command')}
								>
									<Icon name="copy" size={15} />
								</button>
								{#if step.handOff && mayHandOff && live}{@render toAi(step.handOff)}{/if}
							</div>
							{@render saying(step.handOff)}
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
