<script lang="ts">
	import { Button, Icon, Textarea } from '$ui/design-system';
	import type { StepReading } from '$domain/evolution';
	import { applyEvolution } from './reading-api';
	import { personName } from './people';
	import { isWholeValidatedStep } from '$domain/evolution';
	import NamedValidators from './NamedValidators.svelte';

	/**
	 * Who stands behind one step (ac-evo-req-19, -20), in one line: who
	 * validated and the one button the reader may press. Anyone with access
	 * validates, a viewer excepted, and one validation is enough, unless people
	 * are named on the step: then every one of them (ac-evo-req-named-validators).
	 * Marking the
	 * step not applicable (ac-evo-req-16) is one click away. A refusal comes
	 * back as the sentence the spec wrote.
	 */
	interface Props {
		projectId: string;
		requestId: string;
		reading: StepReading;
		members: readonly { id: string; name: string; role?: string; jobs?: readonly string[]; jobIds?: readonly string[] }[];
		actorId: string;
		canEdit: boolean;
		/** Whether the reader may name who validates the step: while it can still be validated (ac-evo-req-named-validators). */
		canName?: boolean;
		/** Whether this step may be marked not applicable. */
		skippable?: boolean;
		/** Set on a step validated answer by answer (Need, Solution): how many answers it holds, how many are validated. */
		inputs?: { total: number; validated: number } | null;
	}
	let { projectId, requestId, reading, members, actorId, canEdit, canName = false, skippable = false, inputs = null }: Props = $props();
	/** Validated answer by answer: no button for the whole step (ac-evo-form-validate-each). */
	const byAnswer = $derived(!!inputs && inputs.total > 0);

	let busy = $state(false);
	let skipping = $state(false);
	let reason = $state('');

	const v = $derived(reading.validation);
	const nameOf = (id: string) => personName(id, members);
	const mine = $derived(v?.given.includes(actorId) ?? false);
	// One validation is enough. Offered once the step holds what it should: before that, it would be refused.
	const mayValidate = $derived(!!v && !mine && reading.progress === 'done' && !v.validated && !byAnswer);

	async function run(op: Record<string, unknown>) {
		busy = true;
		try {
			return await applyEvolution(projectId, [{ requestId, step: reading.step, ...op }]);
		} finally {
			busy = false;
		}
	}
	async function skip() {
		if (await run({ op: 'mark_step_not_applicable', notApplicable: true, reason })) {
			reason = '';
			skipping = false;
		}
	}
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center gap-2 text-xs">
		{#if reading.skip}
			<span class="flex items-center gap-1 text-ink-700" title="{nameOf(reading.skip.by)}, {reading.skip.at.slice(0, 10)}">
				<Icon name="minus" size={12} class="text-ink-400" />
				Not applicable: {reading.skip.reason}
			</span>
			{#if canEdit}
				<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'mark_step_not_applicable', notApplicable: false })}>Undo</Button>
			{/if}
		{:else if v}
			{#if v.given.length > 0}
				<span class="flex items-center gap-1 font-evo-mono font-bold text-green-ink">
					<Icon name="check" size={12} />
					{v.given.map(nameOf).join(', ')}
				</span>
			{/if}
			{#if isWholeValidatedStep(reading.step)}
				<!-- Who is expected to validate the step as a whole, and naming them (ac-evo-form-name-validators). -->
				<NamedValidators
					step={reading.step}
					expected={v.expected}
					gone={v.gone}
					given={v.given}
					{members}
					{actorId}
					{canName}
					{busy}
					onname={(people) => run({ op: 'name_validators', people })}
				/>
			{/if}
			<!-- Answers are validated one by one on their cards; no line counts them (ac-evo-form-validate-each). -->
			{#if canEdit}
				{#if mayValidate}
					<Button size="sm" disabled={busy} onclick={() => run({ op: 'validate_step' })}>
						<Icon name="check" size={12} />
						Validate
					</Button>
				{:else if mine && !byAnswer}
					<Button size="sm" variant="ghost" disabled={busy} onclick={() => run({ op: 'withdraw_step_validation' })}>Withdraw</Button>
				{/if}
				<span class="ml-auto flex items-center gap-1">
					{#if skippable}
						<button
							type="button"
							class="grid size-7 place-items-center rounded-field border-[1.5px] border-line text-ink-3 hover:border-ink hover:text-ink"
							title="Not applicable"
							aria-label="Not applicable"
							onclick={() => (skipping = !skipping)}
						>
							<Icon name="minus" size={14} />
						</button>
					{/if}
				</span>
			{/if}
		{/if}
	</div>
	{#if skipping}
		<div class="flex max-w-md items-start gap-2">
			<Textarea value={reason} rows={1} placeholder="Why it does not apply" oninput={(value) => (reason = value)} class="flex-1" />
			<Button size="sm" disabled={busy || reason.trim() === ''} onclick={skip}>Skip</Button>
		</div>
	{/if}
</div>
