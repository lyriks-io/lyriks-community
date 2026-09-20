<script lang="ts">
	import { Button, HelpTip, Icon, matchesQuery, SearchInput } from '$ui/design-system';
	import {
		OBSERVATION_TYPES,
		canLogObservation,
		WALKTHROUGH_TARGETS,
		canFoldBack,
		canInvalidate,
		canPostMessage,
		canRule,
		createObservation,
		validatedNotFoldedBack,
		type EvolutionRequest,
		type Observation,
		type ObservationRuling,
		type ObservationType,
		type WalkthroughTarget
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * Stage 4: the last human check. Every remark is typed, anchored on the screen
	 * and the element it concerns, and carries an annotated capture, so it never
	 * has to be described from memory.
	 *
	 * No remark disappears. A ruling changes the status of an observation, never
	 * its visibility, and an invalidated one keeps its stated reason on screen.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
	}
	let { store, request }: Props = $props();

	let query = $state('');
	let drafting = $state(false);
	let draft = $state(createObservation());
	let reasonFor = $state<Record<string, string>>({});

	const RULING_TONE: Record<ObservationRuling, string> = {
		open: 'bg-surface-sunken text-ink-500',
		validated: 'bg-success-50 text-success-700',
		invalidated: 'bg-ink-100 text-ink-600',
		deferred: 'bg-warning-50 text-warning-700',
		requalified: 'bg-info-50 text-info-600'
	};

	const visible = $derived(
		request.observations.filter((o) =>
			matchesQuery(query, o.body, o.screenId, o.elementId, o.type, o.ruling)
		)
	);
	const owed = $derived(validatedNotFoldedBack(request));

	/**
	 * What the draft is still missing, read live from the same guard the log
	 * applies. Being refused after pressing the button teaches the rule; saying it
	 * while the form is open lets a person satisfy it instead.
	 */
	const loggable = $derived(canLogObservation({ ...draft }));

	function log() {
		if (store.logObservation(request.id, { ...draft })) {
			draft = createObservation();
			drafting = false;
		}
	}

	function rule(observation: Observation, ruling: ObservationRuling) {
		const reason = reasonFor[observation.id] ?? '';
		const allowed =
			ruling === 'invalidated'
				? canInvalidate(store.actor, observation, reason)
				: canRule(store.actor, observation);
		if (!allowed.ok) {
			store.notifier.notify('error', allowed.reason);
			return;
		}
		store.ruleObservation(request.id, observation.id, ruling, reason);
	}
</script>

<div class="space-y-4">
	<div class="rounded-card border border-line bg-surface-sunken/40 px-4 py-3">
		<div class="flex items-center gap-1.5">
			<p class="text-sm font-semibold text-ink-900">Walk the product, and write what you see</p>
			<HelpTip
				title="Acceptance"
				what="The last stage: somebody uses what was built and writes down what they find. It is the only report on this dossier that no engine and no crossing can produce, because it is the only one about how the thing actually feels."
				how={[
					'Walk the product, or the prototype, as the person it was built for.',
					'Log what you see. Every remark is typed (a defect, an adjustment, or a need nobody had named), anchored to a screen and an element, and carries an annotated capture: a screenshot with nothing marked on it does not say what was meant.',
					'Rule each one. A thread ends in exactly one ruling, and a ruling is a person call: validated, invalidated with a reason, deferred, or requalified.',
					'Fold the validated ones back into the spec. Until that is done the request cannot close, because the specification would describe something other than the product that was accepted.'
				]}
				value="A revealed need is the thing no upstream check can find: the coherence engine cannot know that a screen is exhausting, and the implementation report cannot know that what was asked for was the wrong thing."
			/>
		</div>
		<p class="mt-1 text-[12px] leading-relaxed text-ink-600">
			Nothing here is derived. It fills up when a person opens what was built and says what they
			found, which is why it is empty until something exists to walk.
		</p>
	</div>

	{#if owed > 0}
		<!-- The request cannot close while the spec and the accepted product disagree. -->
		<div class="flex items-start gap-2 rounded-card border border-warning-200 bg-warning-50/50 px-3 py-2.5">
			<Icon name="circle-alert" size={14} class="mt-0.5 shrink-0 text-warning-600" />
			<p class="text-[11.5px] leading-snug text-warning-700">
				<strong>{owed}</strong> validated
				{owed === 1 ? 'observation has' : 'observations have'} not been folded back into the spec yet.
				Closing now would leave the specification describing something other than the product that was
				accepted.
			</p>
		</div>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-3">
		<SearchInput
			bind:value={query}
			placeholder="Search an observation, screen or element…"
			class="w-full max-w-xs"
			resultLabel="{visible.length} of {request.observations.length} observations"
		/>
		<Button size="sm" onclick={() => (drafting = !drafting)}>
			<Icon name="plus" size={13} /> Log an observation
		</Button>
	</div>

	{#if drafting}
		<!-- Typed, anchored, illustrated: the three things a logged remark carries. -->
		<section class="space-y-2.5 rounded-card border border-brand-200 bg-brand-50/30 p-3.5">
			<textarea
				bind:value={draft.body}
				rows="2"
				placeholder="What you saw, in your own words"
				class="w-full resize-y rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink-700 outline-none placeholder:text-ink-300 focus:border-brand-400"
			></textarea>
			<div class="grid gap-2 sm:grid-cols-4">
				<label class="block">
					<span class="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Type</span>
					<select
						bind:value={draft.type}
						class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700"
					>
						{#each OBSERVATION_TYPES as t (t.code)}
							<option value={t.code}>{t.label}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">
						Walked
					</span>
					<select
						bind:value={draft.target}
						title="A remark made on the prototype does not carry the same weight as one made on what shipped"
						class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700"
					>
						{#each WALKTHROUGH_TARGETS as t (t.code)}
							<option value={t.code}>{t.label}</option>
						{/each}
					</select>
				</label>
				<label class="block">
					<span class="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Screen</span>
					<input
						bind:value={draft.screenId}
						placeholder="screen-pricing"
						class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none placeholder:text-ink-300"
					/>
				</label>
				<label class="block">
					<span class="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-ink-400">Element</span>
					<input
						bind:value={draft.elementId}
						placeholder="btn-start-trial"
						class="w-full rounded-field border border-line bg-surface px-2 py-1.5 text-xs text-ink-700 outline-none placeholder:text-ink-300"
					/>
				</label>
			</div>
			<div class="flex flex-wrap items-center gap-3 text-[11px] text-ink-600">
				<label class="flex items-center gap-1.5">
					<input type="checkbox" bind:checked={draft.captureAttached} /> capture attached
				</label>
				<label class="flex items-center gap-1.5">
					<input
						type="checkbox"
						bind:checked={draft.captureAnnotated}
						disabled={!draft.captureAttached}
					/> capture annotated
				</label>
				<span class="text-ink-400">
					A screenshot with nothing marked on it does not say what was meant.
				</span>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button size="sm" onclick={log} disabled={!loggable.ok}>Log it</Button>
				{#if !loggable.ok}
					<span class="text-[11px] text-warning-700">{loggable.reason}</span>
				{/if}
				<button type="button" class="text-xs text-ink-500 hover:text-ink-800" onclick={() => (drafting = false)}>
					Cancel
				</button>
			</div>
		</section>
	{/if}

	{#if visible.length === 0}
		<p class="rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-ink-500">
			{request.observations.length === 0
				? 'Nothing logged yet. This fills when somebody walks what was built: one remark per thing found, each anchored to the screen and the element it concerns.'
				: 'No observation matches the search.'}
		</p>
	{:else}
		<ul class="space-y-2.5">
			{#each visible as observation (observation.id)}
				<li class="rounded-card border border-line bg-surface p-3">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class="rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-600"
						>
							{OBSERVATION_TYPES.find((t) => t.code === observation.type)?.label ?? observation.type}
						</span>
						<span class="min-w-0 flex-1 truncate text-sm text-ink-800">
							{observation.body || 'No wording yet'}
						</span>
						<span
							class="rounded-pill px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide {RULING_TONE[
								observation.ruling
							]}"
						>
							{observation.ruling}
						</span>
					</div>

					<p class="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-ink-400">
						<Icon name="target" size={10} />
						{observation.screenId} / {observation.elementId}
						<span class="font-sans text-ink-400">
							on the {WALKTHROUGH_TARGETS.find((t) => t.code === observation.target)?.label.toLowerCase()}
						</span>
					</p>

					{#if observation.ruling === 'invalidated' && observation.rulingReason}
						<!-- The reason stays readable: no remark is dropped without one. -->
						<p class="mt-1.5 rounded-field bg-surface-sunken/60 px-2 py-1 text-[11px] text-ink-600">
							{observation.rulingReason}
						</p>
					{/if}

					{#if observation.foldedBackAt}
						<p class="mt-1.5 inline-flex items-center gap-1 text-[11px] text-success-700">
							<Icon name="check" size={11} /> folded back into the spec on
							{observation.foldedBackAt.slice(0, 10)}
						</p>
					{/if}

					{#if observation.ruling === 'open'}
						<div class="mt-2 flex flex-wrap items-center gap-1.5">
							<button
								type="button"
								onclick={() => rule(observation, 'validated')}
								class="rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-success-300 hover:text-success-700"
							>
								Validate
							</button>
							<button
								type="button"
								onclick={() => rule(observation, 'deferred')}
								class="rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-warning-300 hover:text-warning-700"
							>
								Defer
							</button>
							<button
								type="button"
								onclick={() => rule(observation, 'requalified')}
								class="rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-info-300 hover:text-info-600"
							>
								Requalify
							</button>
							<input
								value={reasonFor[observation.id] ?? ''}
								oninput={(e) =>
									(reasonFor = { ...reasonFor, [observation.id]: e.currentTarget.value })}
								placeholder="Reason, required to invalidate"
								class="min-w-40 flex-1 rounded-field border border-line bg-surface px-2 py-1 text-[11px] text-ink-700 outline-none placeholder:text-ink-300"
							/>
							<button
								type="button"
								onclick={() => rule(observation, 'invalidated')}
								class="rounded-field border border-line px-2 py-1 text-[11px] font-semibold text-ink-600 hover:border-danger-300 hover:text-danger-700"
							>
								Invalidate
							</button>
						</div>
					{:else if observation.ruling === 'validated' && !observation.foldedBackAt}
						{@const allowed = canFoldBack(store.actor, observation, request.leafIds[0] ?? '')}
						<p class="mt-2 text-[11px] {allowed.ok ? 'text-ink-500' : 'text-warning-700'}">
							{allowed.ok
								? 'Ready to fold back into the spec as an acceptance criterion or a behaviour rule.'
								: allowed.reason}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
