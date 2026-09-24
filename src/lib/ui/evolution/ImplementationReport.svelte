<script lang="ts">
	import { Button, Icon, SearchInput, matchesQuery } from '$ui/design-system';
	import {
		IMPLEMENTATION_VERDICTS,
		canAdopt,
		canCloseReport,
		canComposeRebrief,
		lineBrief,
		rechallengePending,
		canRemove,
		canUnfoldDiff,
		currentLines,
		isReviewable,
		linesInBucket,
		protectedLineIds,
		undecidedCount,
		inheritedUndecidedCount,
		type EvolutionRequest,
		type ImplementationVerdict
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * Stage 3: every requirement confronted with the code, under one of five
	 * verdicts.
	 *
	 * The header states where the verdicts come from, and it is not decoration:
	 * the report is derived by crossing specified requirements with implementation
	 * coverage and reading code anchors, never from the agent's own account of
	 * what it did. That is the difference between evidence and a claim.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
	}
	let { store, request }: Props = $props();

	let query = $state('');
	let unfolded = $state<Record<string, boolean>>({});

	const VERDICT_TONE: Record<ImplementationVerdict, string> = {
		conform: 'bg-success-50 text-success-700 border-success-200',
		non_conform: 'bg-warning-50 text-warning-700 border-warning-200',
		missing: 'bg-danger-50 text-danger-700 border-danger-200',
		out_of_scope: 'bg-accent-50 text-accent-700 border-accent-200',
		regression: 'bg-danger-50 text-danger-700 border-danger-300'
	};

	const lines = $derived(
		currentLines(request).filter((l) =>
			matchesQuery(query, l.requirement, l.filePath, l.specStatement, l.codeStatement, l.verdict)
		)
	);
	const undecided = $derived(undecidedCount(request));
	const inheritedOpen = $derived(inheritedUndecidedCount(request));
	const closable = $derived(canCloseReport(request));
	const awaitingRecheck = $derived(rechallengePending(request));

	/** The brief for one refused line, put on the clipboard for the coding agent. */
	async function copyBrief(lineId: string) {
		const target = request.implementationFindings.find((l) => l.id === lineId);
		if (!target) return;
		const text = lineBrief(request, target);
		try {
			await navigator.clipboard.writeText(text);
			store.notifier.notify('info', 'Brief copied for the next attempt.');
		} catch {
			store.notifier.notify('error', 'The clipboard is not available here; select the brief and copy it.');
		}
	}
	const rebriefable = $derived(canComposeRebrief(request));
	const protectedIds = $derived(new Set(protectedLineIds(request)));

	function toggleDiff(id: string) {
		const line = request.implementationFindings.find((l) => l.id === id);
		if (!line) return;
		const allowed = canUnfoldDiff(line);
		if (!allowed.ok) {
			store.notifier.notify('error', allowed.reason);
			return;
		}
		unfolded = { ...unfolded, [id]: !unfolded[id] };
	}

	function adopt(lineId: string) {
		const line = request.implementationFindings.find((l) => l.id === lineId);
		if (!line) return;
		const allowed = canAdopt(request, store.actor, line);
		if (!allowed.ok) {
			store.notifier.notify('error', allowed.reason);
			return;
		}
		store.decideLine(request.id, lineId, 'adopted');
	}

	function drop(lineId: string) {
		const line = request.implementationFindings.find((l) => l.id === lineId);
		if (!line) return;
		const allowed = canRemove(request, store.actor, line);
		if (!allowed.ok) {
			store.notifier.notify('error', allowed.reason);
			return;
		}
		store.decideLine(request.id, lineId, 'removed');
	}
</script>

<div class="space-y-4">
	{#if request.frozen || request.specVersion > 0}
		<!-- What this report is judged against: a numbered, dated thing. -->
		<p class="flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
			<span class="rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold text-ink-700">
				spec version {request.specVersion}
			</span>
			{#if !request.frozen}
				<span class="text-warning-700">amended since: the next crossing into Verify freezes version {request.specVersion + 1}</span>
			{:else}
				<span>frozen on {(request.frozenVersions.at(-1)?.at ?? '').slice(0, 10)}. A report naming another version is refused at the door.</span>
			{/if}
		</p>
	{/if}
	{#if awaitingRecheck}
		<div class="flex items-start gap-2 rounded-card border border-warning-200 bg-warning-50/60 px-3 py-2.5">
			<Icon name="lock" size={14} class="mt-0.5 shrink-0 text-warning-600" />
			<p class="text-[11.5px] leading-snug text-warning-700">
				An adoption amended the spec. This report closes once the amended spec has passed the
				Challenge check again, coherence and docking.
			</p>
		</div>
	{/if}
	<!-- Where the verdicts come from. The agent's summary is never a source. -->
	<div class="flex items-start gap-2 rounded-card border border-info-200 bg-info-50/50 px-3 py-2.5">
		<Icon name="info" size={14} class="mt-0.5 shrink-0 text-info-600" />
		<p class="text-[11.5px] leading-snug text-info-700">
			Derived by crossing the specified requirements with the implementation coverage, and by reading
			the code anchors of the touched spans. Never from the summary written by the agent that did the
			work: that is a claim, and it hides exactly the omissions and additions this report exists to
			surface.
		</p>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<SearchInput
			bind:value={query}
			placeholder="Search a requirement, file or verdict…"
			class="w-full max-w-xs"
			resultLabel="{lines.length} of {currentLines(request).length} lines"
		/>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-[11px] text-ink-500">
				Iteration {request.iteration} · {undecided} undecided{inheritedOpen > 0
					? ` · ${inheritedOpen} already in the features, not blocking`
					: ''}
			</span>
			<Button
				variant="outline"
				size="sm"
				disabled={!rebriefable.ok}
				title={rebriefable.ok ? 'Compose the brief for the next attempt' : rebriefable.reason}
				onclick={() => store.rebrief(request.id)}
			>
				<Icon name="rotate" size={13} /> Rebrief
			</Button>
			<Button
				size="sm"
				disabled={!closable.ok}
				title={closable.ok ? 'Settle this iteration' : closable.reason}
				onclick={() => store.notifier.notify('info', 'Every line is decided; the report can be closed.')}
			>
				Close the report
			</Button>
		</div>
	</div>

	<!-- One bucket per verdict, with the batch decision the panel offers on its header. -->
	{#each IMPLEMENTATION_VERDICTS as verdict (verdict.code)}
		{@const bucket = lines.filter((l) => l.verdict === verdict.code)}
		{@const open = bucket.filter((l) => l.decision === 'undecided').length}
		{@const allValidated = bucket.length > 0 && bucket.every((l) => l.decision === 'validated')}
		{@const allInvalidated = bucket.length > 0 && bucket.every((l) => l.decision === 'invalidated')}
		{#if bucket.length > 0}
			<section class="rounded-card border border-line bg-surface">
				<header class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
					<span
						class="rounded-pill border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide {VERDICT_TONE[
							verdict.code
						]}"
					>
						{verdict.label}
					</span>
					<span class="text-[11px] text-ink-500">
						{bucket.length} lines{open === 0
							? ', all decided'
							: open === bucket.length
								? ''
								: `, ${open} still undecided`}
					</span>
					<div class="ml-auto flex items-center gap-1">
						<!-- A batch that has been applied says so and stops inviting the
						     same click: what is left to decide is what the button offers. -->
						<button
							type="button"
							onclick={() => store.decideBucket(request.id, verdict.code, 'validated')}
							aria-pressed={allValidated}
							disabled={open === 0}
							class="rounded-field border px-2 py-1 text-[11px] font-semibold transition {allValidated
								? 'border-success-300 bg-success-50 text-success-700'
								: open === 0
									? 'cursor-default border-line text-ink-300'
									: 'border-line text-ink-600 hover:border-success-300 hover:text-success-700'}"
							title={open === 0
								? 'Every line of this bucket is decided'
								: 'Accept every undecided line of this bucket at once'}
						>
							{allValidated ? 'All validated' : `Validate all${open && open < bucket.length ? ` (${open})` : ''}`}
						</button>
						<button
							type="button"
							onclick={() => store.decideBucket(request.id, verdict.code, 'invalidated')}
							aria-pressed={allInvalidated}
							disabled={open === 0}
							class="rounded-field border px-2 py-1 text-[11px] font-semibold transition {allInvalidated
								? 'border-danger-300 bg-danger-50 text-danger-700'
								: open === 0
									? 'cursor-default border-line text-ink-300'
									: 'border-line text-ink-600 hover:border-danger-300 hover:text-danger-700'}"
							title={open === 0
								? 'Every line of this bucket is decided'
								: 'Refuse every undecided line of this bucket; they become the next brief'}
						>
							{allInvalidated
								? 'All invalidated'
								: `Invalidate all${open && open < bucket.length ? ` (${open})` : ''}`}
						</button>
					</div>
				</header>

				<ul class="divide-y divide-line">
					{#each bucket as line (line.id)}
						<li class="px-4 py-2.5">
							<div class="flex flex-wrap items-center gap-2">
								<span class="min-w-0 flex-1 text-sm font-medium text-ink-800">
									{line.requirement}
								</span>
								{#if line.scope === 'inherited'}
									<span
										class="shrink-0 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[9px] font-semibold text-ink-500"
										title="The feature already held this before the request. It is the feature's own backlog: decide it if you wish, it does not hold this report open."
									>
										already in the feature
									</span>
								{/if}
								{#if protectedIds.has(line.id)}
									<span
										class="shrink-0 rounded-pill bg-success-50 px-1.5 py-0.5 text-[9px] font-semibold text-success-700"
										title="Named untouchable in the next brief"
									>
										protected
									</span>
								{/if}
								<span
									class="shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide {line.decision ===
									'undecided'
										? 'bg-surface-sunken text-ink-500'
										: 'bg-brand-50 text-brand-600'}"
								>
									{line.decision}
								</span>
							</div>

							<!-- What the requirement asks, said here rather than folded away: on a
							     line with no code behind it, the fold would open on nothing. -->
							{#if line.specStatement}
								<p class="mt-1 text-[12px] leading-snug text-ink-600">{line.specStatement}</p>
							{/if}

							<div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
								{#if isReviewable(line)}
									<button
										type="button"
										onclick={() => toggleDiff(line.id)}
										class="inline-flex items-center gap-1 font-mono hover:text-brand-600"
									>
										<Icon
											name="chevron-right"
											size={11}
											class="transition-transform {unfolded[line.id] ? 'rotate-90' : ''}"
										/>
										{line.filePath}:{line.lineRange}
									</button>
								{:else}
									<span class="text-ink-400">
										Nothing was located in code for this, so there is no file to open.
									</span>
								{/if}
								{#if line.acceptanceTestPassing}
									<span class="inline-flex items-center gap-0.5 text-success-600">
										<Icon name="check" size={11} /> test passing
									</span>
								{/if}
							</div>

							{#if unfolded[line.id] && isReviewable(line)}
								<!-- On a non-conform line, what the spec asks beside what the code does. -->
								<div class="mt-2 grid gap-2 rounded-field bg-surface-sunken/50 p-2.5 sm:grid-cols-2">
									<div>
										<p class="text-[9px] font-semibold uppercase tracking-wide text-ink-400">
											The spec asks
										</p>
										<p class="mt-0.5 text-[12px] text-ink-700">
											{line.specStatement || line.requirement}
										</p>
									</div>
									<div>
										<p class="text-[9px] font-semibold uppercase tracking-wide text-ink-400">
											The code does
										</p>
										<p class="mt-0.5 text-[12px] text-ink-700">
											{line.codeStatement || 'Nothing was located for this requirement.'}
										</p>
									</div>
								</div>
							{/if}

							<!-- The decision is on the button that took it: a choice you cannot
							     see is one you take twice. -->
							<div class="mt-2 flex flex-wrap items-center gap-1.5">
								<button
									type="button"
									onclick={() => store.decideLine(request.id, line.id, 'validated')}
									aria-pressed={line.decision === 'validated'}
									class="rounded-field border px-2 py-1 text-[11px] font-semibold transition {line.decision ===
									'validated'
										? 'border-success-300 bg-success-50 text-success-700'
										: 'border-line text-ink-600 hover:border-success-300 hover:text-success-700'}"
								>
									{line.decision === 'validated' ? 'Validated' : 'Validate'}
								</button>
								<button
									type="button"
									onclick={() => store.decideLine(request.id, line.id, 'invalidated')}
									aria-pressed={line.decision === 'invalidated'}
									class="rounded-field border px-2 py-1 text-[11px] font-semibold transition {line.decision ===
									'invalidated'
										? 'border-danger-300 bg-danger-50 text-danger-700'
										: 'border-line text-ink-600 hover:border-danger-300 hover:text-danger-700'}"
								>
									{line.decision === 'invalidated' ? 'Invalidated' : 'Invalidate'}
								</button>
								{#if line.decision === 'invalidated'}
									<button
										type="button"
										onclick={() => copyBrief(line.id)}
										class="inline-flex items-center gap-1 rounded-field border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
										title="What the spec expects, what the code does, where, and what to do: ready for the coding agent"
									>
										<Icon name="copy" size={11} /> Copy the brief
									</button>
								{/if}
								{#if line.verdict === 'out_of_scope'}
									<!-- The two halves of the out-of-scope choice, offered nowhere else. -->
									<button
										type="button"
										onclick={() => adopt(line.id)}
										aria-pressed={line.decision === 'adopted'}
										title="Write the missing criterion into its canonical section; the line comes back conform"
										class="rounded-field border px-2 py-1 text-[11px] font-semibold transition {line.decision ===
										'adopted'
											? 'border-brand-300 bg-brand-100 text-brand-700'
											: 'border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100'}"
									>
										{line.decision === 'adopted' ? 'Adopted into the spec' : 'Adopt into the spec'}
									</button>
									<button
										type="button"
										onclick={() => drop(line.id)}
										aria-pressed={line.decision === 'removed'}
										title="Drop it from the code instead of writing it into the spec"
										class="rounded-field border px-2 py-1 text-[11px] font-semibold transition {line.decision ===
										'removed'
											? 'border-danger-300 bg-danger-50 text-danger-700'
											: 'border-line text-ink-600 hover:border-danger-300 hover:text-danger-700'}"
									>
										{line.decision === 'removed' ? 'Removed from the code' : 'Remove from the code'}
									</button>
								{/if}
								{#if line.decidedAt}
									<span class="text-[10px] text-ink-400">
										decided {new Date(line.decidedAt).toLocaleString()}
									</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/each}

	{#if currentLines(request).length === 0}
		<p class="rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-ink-500">
			No report for iteration {request.iteration} yet. It is built by crossing the requirements with
			the implementation coverage once the code lands.
		</p>
	{/if}
</div>
