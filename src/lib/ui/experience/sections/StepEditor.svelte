<script lang="ts">
	import { Button, Icon } from '$ui/design-system';
	import {
		dataReadsOfStep,
		operationsOfStep,
		OPERATION_KINDS,
		DATA_MODES,
		type JourneyStep,
		type OperationKind,
		type DataMode
	} from '$domain/experience';
	import type { ExperienceStore } from '../draft-store.svelte';

	interface Props {
		store: ExperienceStore;
		journeyId: string;
		steps: JourneyStep[];
	}
	let { store, journeyId, steps }: Props = $props();

	const screens = $derived(store.draft.screens);
	const screenName = (id: string | null) =>
		id ? store.draft.screens.find((s) => s.id === id)?.name || 'screen' : null;
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
			Steps · ordered interactions
		</p>
		<Button variant="outline" size="sm" onclick={() => store.addStep(journeyId)}>
			<Icon name="plus" size={13} /> Step
		</Button>
	</div>

	{#if steps.length === 0}
		<p class="text-xs text-ink-400">No step yet - add the first user-facing interaction.</p>
	{:else}
		<ol class="space-y-2">
			{#each steps as step, i (step.id)}
				{@const ops = operationsOfStep(store.draft, step.id)}
				{@const reads = dataReadsOfStep(store.draft, step.id)}
				<li class="rounded-card border border-line bg-surface p-3">
					<div class="flex items-center gap-2">
						<span class="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-600">
							{i + 1}
						</span>
						<input
							value={step.name}
							oninput={(e) => store.updateStep(step.id, 'name', e.currentTarget.value)}
							placeholder="Step - e.g. Open aging dashboard"
							class="min-w-0 flex-1 border-none bg-transparent text-sm font-medium text-ink-800 outline-none placeholder:font-normal placeholder:text-ink-300"
						/>
						<div class="flex shrink-0 items-center gap-0.5">
							<button
								type="button"
								disabled={i === 0}
								onclick={() => store.reorderStep(step.id, 'up')}
								class="px-1 text-ink-300 hover:text-ink-700 disabled:opacity-30"
								title="Move up">↑</button
							>
							<button
								type="button"
								disabled={i === steps.length - 1}
								onclick={() => store.reorderStep(step.id, 'down')}
								class="px-1 text-ink-300 hover:text-ink-700 disabled:opacity-30"
								title="Move down">↓</button
							>
							<button
								type="button"
								onclick={() => store.removeStep(step.id)}
								class="px-1 text-ink-300 hover:text-danger-500"
								title="Remove step"><Icon name="x" size={14} /></button
							>
						</div>
					</div>

					<!-- linked screen -->
					<div class="mt-2 flex items-center gap-2 pl-8">
						<Icon name="monitor" size={12} />
						{#if step.linkedScreenId}
							<span class="rounded-pill bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-600">
								{screenName(step.linkedScreenId)}
							</span>
							<button
								type="button"
								onclick={() => store.unlinkScreen(step.id)}
								class="text-[11px] text-ink-400 hover:text-danger-500">unlink</button
							>
						{:else}
							<select
								value=""
								onchange={(e) => {
									if (e.currentTarget.value) store.linkScreen(step.id, e.currentTarget.value);
								}}
								class="rounded-field border border-line bg-surface px-2 py-1 text-[11px] text-ink-600"
							>
								<option value="">PICK SCREEN…</option>
								{#each screens as sc (sc.id)}
									<option value={sc.id}>{sc.name || 'Untitled screen'}</option>
								{/each}
							</select>
							{#if screens.length === 0}
								<span class="text-[11px] text-ink-300">- add screens in the Library tab</span>
							{/if}
						{/if}
					</div>

					{#if store.showInvisible}
						<div class="mt-3 grid gap-3 pl-8 lg:grid-cols-2">
							<!-- Events Flow -->
							<div class="rounded-field border border-dashed border-line bg-surface-sunken/50 p-2.5">
								<div class="mb-1.5 flex items-center justify-between">
									<span class="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
										Events Flow
									</span>
									<button
										type="button"
										onclick={() => store.addOperation(step.id)}
										class="text-[11px] font-medium text-brand-600 hover:underline">+ op</button
									>
								</div>
								{#if ops.length === 0}
									<p class="text-[11px] text-ink-300">No API / cache / event op.</p>
								{:else}
									<ul class="space-y-1">
										{#each ops as op (op.id)}
											<li class="flex items-center gap-1.5">
												<select
													value={op.kind}
													onchange={(e) =>
														store.updateOperation(
															op.id,
															'kind',
															e.currentTarget.value as OperationKind
														)}
													class="rounded border border-line bg-surface px-1 py-0.5 text-[10px] font-semibold uppercase text-ink-600"
												>
													{#each OPERATION_KINDS as k (k.code)}
														<option value={k.code}>{k.label}</option>
													{/each}
												</select>
												<input
													value={op.label}
													oninput={(e) =>
														store.updateOperation(op.id, 'label', e.currentTarget.value)}
													placeholder="GET /dashboard"
													class="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-700 outline-none"
												/>
												<button
													type="button"
													onclick={() => store.removeOperation(op.id)}
													class="text-ink-300 hover:text-danger-500"><Icon name="x" size={12} /></button
												>
											</li>
										{/each}
									</ul>
								{/if}
							</div>

							<!-- Data Consumed -->
							<div class="rounded-field border border-dashed border-line bg-surface-sunken/50 p-2.5">
								<div class="mb-1.5 flex items-center justify-between">
									<span class="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-400">
										Data Consumed
									</span>
									<button
										type="button"
										onclick={() => store.addDataRead(step.id)}
										class="text-[11px] font-medium text-brand-600 hover:underline">+ entity</button
									>
								</div>
								{#if reads.length === 0}
									<p class="text-[11px] text-ink-300">No entity read / write.</p>
								{:else}
									<ul class="space-y-1.5">
										{#each reads as read (read.id)}
											<li class="flex items-center gap-1.5">
												<select
													value={read.mode}
													onchange={(e) =>
														store.setDataReadMode(read.id, e.currentTarget.value as DataMode)}
													class="rounded border border-line bg-surface px-1 py-0.5 text-[10px] font-semibold uppercase text-ink-600"
												>
													{#each DATA_MODES as m (m.code)}
														<option value={m.code}>{m.label}</option>
													{/each}
												</select>
												<input
													value={read.entityName}
													oninput={(e) =>
														store.updateDataRead(read.id, 'entityName', e.currentTarget.value)}
													placeholder="Entity"
													class="w-24 shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-700 outline-none"
												/>
												<input
													value={read.fields.join(', ')}
													oninput={(e) => store.setDataReadFields(read.id, e.currentTarget.value)}
													placeholder="fields, comma-sep"
													class="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-600 outline-none"
												/>
												<button
													type="button"
													onclick={() => store.removeDataRead(read.id)}
													class="text-ink-300 hover:text-danger-500"><Icon name="x" size={12} /></button
												>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>
