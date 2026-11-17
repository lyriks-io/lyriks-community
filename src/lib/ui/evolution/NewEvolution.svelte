<script lang="ts">
	import { untrack } from 'svelte';
	import { pushToast } from '$ui/design-system';
	import { PRIMARY_48, SECONDARY_48 } from './evo-look';

	/**
	 * "New evolution", the way the design starts one: from scratch, a title and
	 * the request opens on its first question; or from a ticket, through the
	 * person's AI with their tracker's MCP and the Lyriks MCP, the page waiting
	 * for the request the AI opens and taking the person to it as it lands.
	 */
	interface Props {
		projectId: string;
		productName: string;
		/** The requests already on the board, to know the one the AI opens. */
		known: readonly string[];
		onCreate: (title: string) => Promise<boolean>;
		onOpen: (id: string) => void;
		onCancel: () => void;
	}
	let { projectId, productName, known, onCreate, onOpen, onCancel }: Props = $props();

	type Way = 'scratch' | 'ticket';
	let way = $state<Way>('scratch');
	let title = $state('');
	let busy = $state(false);

	async function create() {
		if (title.trim() === '') return pushToast({ level: 'info', message: 'Give the evolution a title first' });
		busy = true;
		try {
			await onCreate(title.trim().charAt(0).toUpperCase() + title.trim().slice(1));
		} finally {
			busy = false;
		}
	}

	/** What the person pastes into their AI, the ticket named in their own words after it. */
	const instruction = $derived(
		`Create a Lyriks evolution in the ${productName} project (${projectId}) from the ticket I name: reuse its description, acceptance criteria and comments, and link the ticket to the evolution. Then follow the lyriks-evolution skill and ask me what the ticket does not say.`
	);

	/** Waiting for the AI: the first request that was not on the board opens as it lands, read live. */
	let waiting = $state(false);
	const before = untrack(() => new Set(known));
	async function copy() {
		try {
			await navigator.clipboard.writeText(instruction);
			pushToast({ level: 'success', message: 'Instruction copied' });
		} catch {
			pushToast({ level: 'error', message: 'The clipboard is not available here.' });
		}
	}
	function ran() {
		waiting = true;
		pushToast({ level: 'info', message: 'Your LLM reads the ticket through your ticketing tool’s MCP and creates the evolution in Lyriks…' });
	}
	$effect(() => {
		if (!waiting) return;
		const landed = known.find((id) => !before.has(id));
		if (!landed) return;
		waiting = false;
		pushToast({ level: 'success', message: 'Evolution pre-filled from the ticket: to review' });
		onOpen(landed);
	});

	// The design's choice card (.ly-choice): sand, its border transparent; chosen, paper inside a 1.5px ink border.
	const WAY = 'flex min-h-[110px] flex-[1_1_320px] flex-col gap-2 rounded-evo-card px-[22px] py-5 text-left text-evo-ink';
	const wayLook = (on: boolean) => (on ? 'border-[1.5px] border-ink bg-paper' : 'border-[1.5px] border-transparent bg-surface hover:border-line');
</script>

<section class="evo-motion animate-lk-in flex flex-col gap-5 font-evo text-[0.9375rem] leading-normal text-evo-ink" aria-label="New change">
	<div class="flex flex-col gap-1.5"><h1 class="m-0 text-[1.75rem] font-bold leading-[1.15] tracking-[-0.03em]">New change</h1></div>
	<h2 class="m-0 text-[1.375rem] font-bold tracking-[-0.02em]">How do you want to start this evolution?</h2>
	<div class="flex flex-wrap gap-4">
		<button type="button" class="{WAY} {wayLook(way === 'scratch')}" aria-pressed={way === 'scratch'} onclick={() => (way = 'scratch')}>
			<span class="text-[1.0625rem] leading-[1.25] font-bold">Start from scratch</span>
			<span class="text-sm leading-normal text-ink-2">Give it a title, then complete the solution block by block, with the LLM’s help if needed.</span>
		</button>
		<button type="button" class="{WAY} {wayLook(way === 'ticket')}" aria-pressed={way === 'ticket'} onclick={() => (way = 'ticket')}>
			<span class="text-[1.0625rem] leading-[1.25] font-bold">Import a ticket</span>
			<span class="text-sm leading-normal text-ink-2">Through your LLM, from your ticketing tool: the solution fills itself in from the ticket (description, criteria, comments), and its reference stays linked to the evolution.</span>
		</button>
	</div>

	{#if way === 'scratch'}
		<div class="flex flex-col gap-3 rounded-evo-card border border-transparent bg-surface p-6">
			<label for="ne-title" class="font-evo-mono text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Evolution title</label>
			<input
				id="ne-title"
				class="min-h-12 w-full rounded-lg border-[1.5px] border-evo-control bg-toner-1 px-3 text-base text-ink placeholder:text-ink-3 focus:border-blue focus:outline-none"
				placeholder="E.g.: Payment in installments"
				bind:value={title}
				onkeydown={(e) => e.key === 'Enter' && void create()}
			/>
			<button type="button" class="{PRIMARY_48} self-end" disabled={busy} onclick={create}>Create and start editing →</button>
		</div>
	{:else}
		<div class="flex flex-col gap-3.5 rounded-evo-card border border-transparent bg-surface p-6">
			<div class="flex flex-col gap-3">
				<span class="text-sm text-ink-2">In your LLM, with your ticketing tool’s MCP and the Lyriks MCP connected, paste this instruction:</span>
				<pre class="m-0 whitespace-pre-wrap rounded-evo-btn bg-evo-ink px-[18px] py-4 font-evo-mono text-[0.8125rem] leading-relaxed text-evo-code">{instruction}</pre>
				<div class="flex flex-wrap items-center gap-2.5">
					<button type="button" class={SECONDARY_48} onclick={copy}>Copy the instruction</button>
					<button type="button" class={PRIMARY_48} disabled={waiting} onclick={ran}>I ran the instruction</button>
					{#if waiting}
						<!-- Lifts as soon as the request the AI opens reaches this page. -->
						<span class="flex items-center gap-2 font-evo-mono text-[0.8125rem] text-ink-3" role="status">
							<span class="animate-lk-spin size-4 rounded-full border-2 border-toner-2 border-t-orange" aria-hidden="true"></span>
							Waiting for your LLM to create the evolution…
						</span>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</section>
