<script lang="ts">
	import { Button, Icon, Textarea, pushToast } from '$ui/design-system';
	import type { DossierCounts } from '$lib/server/evolution-view.server';
	import { applyEvolution } from './reading-api';
	import { TONE } from './verdict-tones';
	import { personName } from './people';
	import { whileBusy } from './busy.svelte';

	/**
	 * The band that moves a request to its next step, or says exactly why it
	 * cannot yet. The refusal is printed, never hidden, with the waiver offered
	 * beside it: a request that stalls silently is what this band prevents.
	 */
	interface Props {
		projectId: string;
		dossier: DossierCounts;
		canEdit: boolean;
		isAdmin: boolean;
	}
	let { projectId, dossier, canEdit, isAdmin }: Props = $props();

	let waiving = $state(false);
	let reason = $state('');
	let busy = $state(false);

	/** The engine's stages, named as the step of the path they open (ac-evo-req-6). */
	const LABEL: Record<string, string> = {
		coherence: 'Impact analysis',
		implementation: 'Build: freezes the spec as a numbered version',
		acceptance: 'Approval',
		delivered: 'Deployment: the stakeholders approved it'
	};
	const next = $derived(dossier.gate.next ? (LABEL[dossier.gate.next] ?? dossier.gate.next) : null);

	/** What Lyriks does while a gate is crossed, said on the veil (busy.svelte.ts). */
	const CROSSING: Record<string, string> = {
		coherence: 'Lyriks is comparing the specification with the existing system…',
		implementation: 'Lyriks is preparing the implementation specification…',
		acceptance: 'Lyriks is compiling the implementation report…',
		delivered: 'Archiving the report and updating the reference spec…'
	};
	async function run(op: Record<string, unknown>) {
		busy = true;
		try {
			const send = () => applyEvolution(projectId, [{ requestId: dossier.id, ...op }]);
			const crossing = op.op === 'cross_stage' && dossier.gate.next ? CROSSING[dossier.gate.next] : null;
			const ok = crossing ? await whileBusy(crossing, send) : await send();
			if (ok && op.op === 'cross_stage') pushToast({ level: 'success', message: `Moved on: ${next}` });
			return ok;
		} finally {
			busy = false;
		}
	}

	async function waive() {
		if (await run({ op: 'cross_stage', waiverReason: reason })) {
			reason = '';
			waiving = false;
		}
	}
</script>

{#if next}
	{@const tone = dossier.gate.ok ? TONE.ok : dossier.coherence.blockingUndecided > 0 ? TONE.blocks : TONE.decide}
	<div class="rounded-card border border-l-4 p-4 {tone.box}">
		{#if dossier.waiver}
			<div class="mb-3 flex flex-wrap items-start gap-2 rounded-field border border-l-4 px-3 py-2 {TONE.decide.box}">
				<Icon name="flag" size={14} class="mt-0.5 shrink-0 {TONE.decide.text}" />
				<div class="min-w-0 flex-1">
					<p class="font-mono text-[0.6875rem] tracking-[0.08em] uppercase {TONE.decide.text}">Crossed on a waiver</p>
					<p class="mt-0.5 text-xs text-ink-700">{dossier.waiver.reason}</p>
					<p class="mt-0.5 font-mono text-[0.625rem] text-ink-400">Granted by {personName(dossier.waiver.grantedBy)} on {dossier.waiver.grantedAt.slice(0, 10)}</p>
				</div>
				{#if isAdmin}
					<Button variant="outline" size="sm" disabled={busy} onclick={() => run({ op: 'lift_waiver' })}>Lift waiver</Button>
				{/if}
			</div>
		{/if}

		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p class="flex items-center gap-1.5 text-[0.9375rem] font-bold text-ink-900">
					<Icon name={dossier.gate.ok ? 'check' : 'lock'} size={14} class={tone.text} />
					{dossier.gate.ok ? `Next: ${next}` : (dossier.gate.reason ?? 'Not ready yet')}
				</p>
				{#if !dossier.gate.ok && dossier.gate.detail}
					<p class="mt-0.5 text-xs text-ink-700">{dossier.gate.detail}</p>
				{/if}
			</div>
			{#if canEdit}
				<div class="flex flex-wrap gap-2">
					{#if dossier.gate.ok}
						<Button disabled={busy} onclick={() => run({ op: 'cross_stage' })}>
							{#if dossier.gate.next === 'implementation'}
								<Icon name="lock" size={14} />
								Freeze version {dossier.specVersion + 1}
							{:else if dossier.gate.next === 'delivered'}
								<Icon name="check" size={14} />
								Approve
							{:else}
								Move on
								<Icon name="arrow-right" size={14} />
							{/if}
						</Button>
					{:else if !waiving}
						<Button variant="outline" size="sm" disabled={busy} onclick={() => (waiving = true)}>Cross anyway</Button>
					{/if}
					{#if dossier.stage !== 'specification' && dossier.stage !== 'draft' && dossier.status === 'open'}
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							title={dossier.specVersion > 0 ? `Reopens version ${dossier.specVersion} for changes; the next freeze makes version ${dossier.specVersion + 1}.` : 'Back to the specification.'}
							onclick={() => run({ op: 'rebrief' })}
						>
							<Icon name="pencil" size={12} />
							Reopen the specification
						</Button>
					{/if}
				</div>
			{/if}
		</div>

		{#if waiving}
			<div class="mt-3">
				<Textarea value={reason} rows={2} placeholder="Why (shown to everyone until an admin lifts it)" oninput={(v) => (reason = v)} />
				<div class="mt-2 flex gap-2">
					<Button size="sm" disabled={busy || reason.trim() === ''} onclick={waive}>Cross with this waiver</Button>
					<Button size="sm" variant="ghost" onclick={() => (waiving = false)}>Cancel</Button>
				</div>
			</div>
		{/if}
	</div>
{/if}
