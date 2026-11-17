<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import { tick, untrack } from 'svelte';
	import { Button, Chip, Icon } from '$ui/design-system';
	import type { DataRuleReading, DataRuleVerdict, DataRulesReading } from '$application/use-cases';
	import { fetchReading, fetchVerdicts, postRuleAction } from './data-rules-client';
	import { breakingSteps, ruleStatus, type DecisionBucket, type RuleStatus } from './data-rule-status';
	import { page } from '$app/state';
	import { isCommunity, lockedSentence, planOpening, UPGRADE_PLAN_NAMES } from '$domain/licensing';

	interface Props {
		projectId: string;
		/** A writing role ties fields and names existence states; a viewer reads. */
		canWrite: boolean;
		/** The data model's last save: the rules are read again after it. */
		savedAt: string | null;
		/** A rule to open on (the `rule` of a link), unfolded and highlighted. */
		focusRule: string | null;
		height: string;
		/** Whether the installation proves (Enterprise): without it no verdict is asked and nothing names the solver. */
		proofs: boolean;
	}
	let { projectId, canWrite, savedAt, focusRule, height, proofs }: Props = $props();

	let reading = $state<DataRulesReading | null>(null);
	let loadError = $state<string | null>(null);
	let verdicts = $state<ReadonlyMap<string, DataRuleVerdict>>(new Map());
	let proving = $state(false);
	let verdictError = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let picked = $state<Record<string, string>>({});

	async function load() {
		const result = await fetchReading(projectId);
		if (!result.ok) {
			loadError = result.error;
			return;
		}
		loadError = null;
		reading = result.reading;
		if (!proofs) return;
		proving = true;
		// What the induction settles shows at once; the search answers the rest.
		const settled = await fetchVerdicts(projectId, true);
		if (settled.ok) verdicts = new Map(settled.verdicts.map((v) => [v.key, v]));
		const answer = await fetchVerdicts(projectId);
		proving = false;
		verdictError = answer.ok ? null : answer.error;
		if (answer.ok) verdicts = new Map(answer.verdicts.map((v) => [v.key, v]));
		else if (!settled.ok) verdicts = new Map();
	}

	// Read again after every save of the model, once it settles. Only the save
	// is tracked: reading `reading` here would make each load start the next.
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		void savedAt;
		const settle = untrack(() => (reading ? 800 : 0));
		clearTimeout(timer);
		timer = setTimeout(() => void load(), settle);
		return () => clearTimeout(timer);
	});

	// Open on the rule a link names, once the reading is there.
	let focused = false;
	$effect(() => {
		if (!reading || !focusRule || focused) return;
		focused = true;
		void tick().then(() =>
			document.getElementById(`rule-${focusRule}`)?.scrollIntoView({ block: 'center', behavior: scrollMotion() })
		);
	});

	async function act(key: string, action: Parameters<typeof postRuleAction>[1]) {
		busy = key;
		actionError = null;
		const result = await postRuleAction(projectId, action);
		busy = null;
		if (!result.ok) {
			actionError = result.error;
			return;
		}
		await load();
	}

	// The rules as text, each with what is known of it: to paste into a ticket or a review.
	let copied = $state(false);
	async function copyRules() {
		if (!reading) return;
		const text = reading.tables
			.map((table) => {
				const lines = reading!.rules
					.filter((r) => r.entityId === table.entityId)
					.map((r) => `- [${statuses.get(r.key)?.label ?? ''}] ${r.ears}`);
				return lines.length > 0 ? [table.name, ...lines].join('\n') : '';
			})
			.filter(Boolean)
			.join('\n\n');
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard blocked: the rules stay readable on the page */
		}
	}

	const tableName = (entityId: string) => reading?.tables.find((t) => t.entityId === entityId)?.name ?? '';
	// Community locks the solver (EVO-001): a rule it would prove names the plan that opens it.
	const solverLock = $derived(
		isCommunity((page.data as { edition?: string | null }).edition)
			? { plan: UPGRADE_PLAN_NAMES[planOpening('solver')], sentence: lockedSentence('solver') }
			: undefined
	);
	const statusOf = (rule: DataRuleReading): RuleStatus =>
		ruleStatus(rule, verdicts.get(rule.key), { tableName: tableName(rule.entityId), proving, proofs, solverLock });

	const statuses = $derived(new Map((reading?.rules ?? []).map((rule) => [rule.key, statusOf(rule)])));
	const count = (bucket: DecisionBucket) => [...statuses.values()].filter((s) => s.bucket === bucket).length;
	/** Why no rule got a proof, once, when the solver did not start on this installation. */
	const solverDown = $derived.by(() => {
		for (const v of verdicts.values()) {
			const reason = v.answer.reason;
			if (typeof reason === 'string' && reason.startsWith('The solver did not start')) {
				const why = reason.replace(/^The solver did not start:?\s*/, '');
				return why
					? `The solver did not start (${why}): nothing here is proven.`
					: 'The solver did not start: nothing here is proven.';
			}
		}
		return null;
	});
	const broken = $derived((reading?.rules ?? []).filter((r) => statuses.get(r.key)?.bucket === 'broken'));
	/** Fields nothing carries yet, once each, with the states suggested for them. */
	const untied = $derived.by(() => {
		const seen = new Set<string>();
		return (reading?.rules ?? []).filter((r) => {
			if (r.tiedTo || r.check === 'none' || r.check === 'out-of-reach' || seen.has(r.fieldId)) return false;
			seen.add(r.fieldId);
			return true;
		});
	});
	/**
	 * A table's rules in model order, rules of one kind on several fields read
	 * once: the group's sentence, then one line per field with its own verdict.
	 */
	type Item =
		| { kind: 'rule'; rule: DataRuleReading }
		| { kind: 'group'; key: string; ears: string; rules: DataRuleReading[] };
	const itemsOf = (entityId: string): Item[] => {
		if (!reading) return [];
		const rules = reading.rules.filter((r) => r.entityId === entityId);
		const byKey = new Map(rules.map((r) => [r.key, r]));
		const groupOf = new Map<string, DataRulesReading['groups'][number]>();
		for (const group of reading.groups) {
			if (group.entityId === entityId) for (const key of group.ruleKeys) groupOf.set(key, group);
		}
		const items: Item[] = [];
		const placed = new Set<string>();
		for (const rule of rules) {
			const group = groupOf.get(rule.key);
			if (!group) items.push({ kind: 'rule', rule });
			else if (!placed.has(group.key)) {
				placed.add(group.key);
				items.push({ kind: 'group', key: group.key, ears: group.ears, rules: group.ruleKeys.flatMap((k) => byKey.get(k) ?? []) });
			}
		}
		return items;
	};
	const linkable = (rule: DataRuleReading) => rule.check !== 'none' && rule.check !== 'out-of-reach';
	/** A field's link is one fact: shown under the first of its rules that can use it. */
	const linkShownOn = $derived.by(() => {
		const byKey = new Map((reading?.rules ?? []).map((rule) => [rule.key, rule]));
		const first = new Map<string, string>();
		// A field's link shows even when no rule of it can use it (a uniqueness, a
		// permission): whoever made it, a person must see it and be able to undo it.
		for (const rule of reading?.rules ?? []) {
			const current = first.get(rule.fieldId);
			if (!current) first.set(rule.fieldId, rule.key);
			else if (linkable(rule) && !linkable(byKey.get(current)!)) first.set(rule.fieldId, rule.key);
		}
		return new Set(first.values());
	});
	/**
	 * A field nothing is linked to and no state is suggested for: said once per
	 * table rather than as a to-do on each row. A suggestion only matches by
	 * name, so this never claims the behaviour cannot hold the field.
	 */
	const unsuggested = (rule: DataRuleReading) =>
		!rule.tiedTo && linkable(rule) && (reading?.suggestions[rule.fieldId] ?? []).length === 0;
	const unsuggestedCount = $derived(untied.filter(unsuggested).length);
	/** The table's fields no state is suggested for, once each, in model order. */
	const unsuggestedOf = (entityId: string): DataRuleReading[] => {
		const seen = new Set<string>();
		return (reading?.rules ?? []).filter((r) => {
			if (r.entityId !== entityId || !unsuggested(r) || seen.has(r.fieldId)) return false;
			seen.add(r.fieldId);
			return true;
		});
	};
	const booleanStates = $derived((reading?.states ?? []).filter((s) => s.type === 'boolean'));
	/** Choice states, offered as a status condition to edit ("offer.status != <a value>"). */
	const statusStates = $derived((reading?.states ?? []).filter((s) => s.type === 'enum' && (s.enumValues ?? []).length > 0));

	const LINKED_BY = { lyriks: 'linked by Lyriks', 'ai-client': 'linked by an AI client', person: 'linked by a person' } as const;

	const BUCKETS: { bucket: DecisionBucket; label: string; tone: 'danger' | 'warning' | 'neutral' | 'success' }[] = $derived([
		{ bucket: 'broken', label: 'broken', tone: 'danger' },
		{ bucket: 'unchecked', label: 'unchecked', tone: 'warning' },
		{ bucket: 'proving', label: 'being proved', tone: 'neutral' },
		{ bucket: 'not-tied', label: 'not checked yet', tone: 'neutral' },
		{ bucket: 'held', label: 'holding within the bound', tone: 'neutral' },
		{ bucket: 'proved', label: 'proved', tone: 'success' },
		{ bucket: 'simulated', label: 'checked in simulation', tone: 'neutral' },
		{ bucket: 'out-of-reach', label: proofs ? "out of the solver's reach" : 'not checked', tone: 'neutral' },
		{ bucket: 'permission', label: 'permissions', tone: 'neutral' }
	]);
</script>

<div class="p-4">
	{#if loadError}
		<p class="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-600" role="alert">{loadError}</p>
	{:else if !reading}
		<p class="py-10 text-center text-xs text-ink-400" role="status">Reading the rules…</p>
	{:else}
		<!-- What this reading is for, and what linking a field changes -->
		<details class="mb-3 rounded-card border border-line bg-surface px-4 py-2 text-xs text-ink-600" open={untied.length > 0 && verdicts.size === 0}>
			<summary class="cursor-pointer font-semibold text-ink-700">How this works</summary>
			<ol class="mt-2 list-decimal space-y-1 pl-5">
				<li>Each sentence is a rule your tables state (a required field, a choice, a starting value), read from the data model.</li>
				<li>
					{proofs ? 'The solver checks' : 'Lyriks checks'} a rule once its field is linked to the behaviour state that holds its value, for example a
					World's name to <span class="font-mono">world.name</span>. A table with required fields also says when one of its
					records exists: a yes-or-no state (<span class="font-mono">integrity.receiptExists</span>), or a condition on its
					status (<span class="font-mono">service.status != none</span>).
				</li>
				{#if proofs}
					<li>
						The solver then runs the rule against every feature: <strong>Proved</strong> when it holds on every run, however
						long; <strong>Holds for 6 steps</strong> when no path of up to 6 steps breaks it, which is not a proof since
						nothing beyond those steps was searched; <strong>Broken</strong> with the feature and the action that break it. A
						simulation refuses a step that breaks it.
					</li>
				{:else}
					<li>Every simulation then refuses a step that breaks a linked rule.</li>
				{/if}
			</ol>
			<p class="mt-2 text-ink-500">
			Links are made as the product is captured: by Lyriks itself when only one state can hold a field, and by the AI
			client that reads the code. Linking changes no feature and no table: it only tells {proofs ? 'the solver' : 'Lyriks'} where the value
			lives. Correct a link here at any time; one you unlink is never made again automatically.
		</p>
		</details>

		<!-- What needs a decision, first -->
		<section class="mb-4 rounded-card border border-line bg-surface px-4 py-3" aria-label="What needs a decision">
			<div class="flex flex-wrap items-center gap-2 text-xs">
				<span class="font-semibold text-ink-700">{reading.rules.length} rule(s)</span>
				{#each BUCKETS as b (b.bucket)}
					{@const n = count(b.bucket)}
					{#if n > 0}<Chip tone={b.tone}>{n} {b.label}</Chip>{/if}
				{/each}
				{#if proving}
					<span class="text-ink-400" role="status">
						{verdicts.size > 0 ? `${verdicts.size} settled; the solver is proving the others…` : 'The solver is proving the rules…'}
					</span>
				{/if}
				<Button variant="outline" size="sm" class="ml-auto" onclick={copyRules}>
					<Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy the rules'}
				</Button>
			</div>
			{#if !reading.engine}
				<p class="mt-2 text-xs text-warning-500">
					The behavior engine did not answer: nothing can be tied{proofs ? ' or proven' : ''} right now.
				</p>
			{:else if verdictError}
				<p class="mt-2 text-xs text-warning-500">No verdict: {verdictError}</p>
			{:else if solverDown}
				<p class="mt-2 text-xs text-warning-500">{solverDown}</p>
			{/if}
			{#if actionError}
				<p class="mt-2 text-xs text-danger-500" role="alert">{actionError}</p>
			{/if}
			{#if broken.length > 0}
				<ul class="mt-3 space-y-1">
					{#each broken as rule (rule.key)}
						<li class="text-sm text-ink-700">
							<a class="font-medium text-danger-500 hover:underline" href={rule.href}>{rule.ears}</a>
							{#each breakingSteps(verdicts.get(rule.key)) as step, i (i)}
								<span class="text-xs text-ink-500">{i === 0 ? ' Broken by ' : ' then '}{step}</span>
							{/each}
						</li>
					{/each}
				</ul>
			{/if}
			{#if untied.length > 0}
				<p class="mt-3 text-xs text-ink-500">
					{untied.length} field(s) are not checked yet.
					{#if untied.length - unsuggestedCount > 0}{untied.length - unsuggestedCount} have a suggested state: link each one below to the state that holds its value.{/if}
					{#if unsuggestedCount > 0}{unsuggestedCount} have none, listed once per table: the behaviour may not model them.{/if}
				</p>
			{/if}
		</section>

		<datalist id="data-rule-states">
			{#each reading.states as s (s.path)}<option value={s.path}>{s.featureName ? `${s.type} · ${s.featureName}` : s.type}</option>{/each}
		</datalist>
		<datalist id="data-rule-existence">
			{#each booleanStates as s (s.path)}<option value={s.path}>{s.featureName ?? ''}</option>{/each}
			{#each statusStates as s (s.path)}<option value="{s.path} != {s.enumValues?.[0] ?? ''}">{`${s.path}: ${(s.enumValues ?? []).join(', ')}`}</option>{/each}
		</datalist>

		{#snippet verdictOf(rule: DataRuleReading, compact = false)}
			{@const status = statuses.get(rule.key)!}
			{#if status.bucket === 'not-tied' && !linkShownOn.has(rule.key)}
				<p class="mt-1 text-xs text-ink-500">Checked once {rule.fieldName} is linked, above.</p>
			{:else if status.detail && !(compact && status.bucket === 'not-tied')}<p class="mt-1 text-xs text-ink-500">{status.detail}</p>{/if}
			{#each breakingSteps(verdicts.get(rule.key)) as step, i (i)}
				<p class="text-xs text-ink-500">{i + 1}. {step}</p>
			{/each}
		{/snippet}

		{#snippet linkOf(rule: DataRuleReading)}
			{#if !linkShownOn.has(rule.key)}
				<!-- said once per field, under its first rule -->
			{:else if rule.tiedTo}
				<p class="mt-1 flex items-center gap-2 text-[0.6875rem] text-ink-400">
					<Icon name="link" size={12} /> Held by <span class="font-mono">{rule.tiedTo}</span>
					{#if rule.linkedBy}<span>· {LINKED_BY[rule.linkedBy]}</span>{/if}
					{#if canWrite}
						<button type="button" class="underline hover:text-ink-600" disabled={busy !== null} onclick={() => act(rule.key, { action: 'untie', fieldId: rule.fieldId })}>unlink</button>
					{/if}
				</p>
			{:else if canWrite && linkable(rule)}
				{@const suggested = reading?.suggestions[rule.fieldId] ?? []}
				<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
					<span class="text-ink-500">Held by</span>
					{#each suggested as s (s.path)}
						<Button variant="outline" size="sm" disabled={busy !== null} title="Link {rule.fieldName} to {s.path}" onclick={() => act(rule.key, { action: 'tie', fieldId: rule.fieldId, statePath: s.path })}>
							<span class="font-mono">{s.path}</span>{#if s.featureName}<span class="text-ink-400">&nbsp;· {s.featureName}</span>{/if}
						</Button>
					{/each}
					<input
						class="h-7 w-52 rounded-pill border border-line bg-surface px-2 font-mono text-xs"
						list="data-rule-states"
						placeholder={suggested.length > 0 ? 'or another state' : 'search the states'}
						aria-label="State that holds {rule.fieldName}"
						bind:value={picked[rule.key]}
					/>
					<Button variant="outline" size="sm" disabled={busy !== null || !picked[rule.key]} onclick={() => act(rule.key, { action: 'tie', fieldId: rule.fieldId, statePath: picked[rule.key] ?? '' })}>Link</Button>
				</div>
			{/if}
		{/snippet}

		<div class="space-y-3 overflow-auto pr-1" style="max-height: {height}">
			{#each reading.tables as table (table.entityId)}
				{@const rules = reading.rules.filter((r) => r.entityId === table.entityId)}
				<section class="rounded-card border border-line bg-surface-sunken/30 px-4 py-3">
					<header class="flex flex-wrap items-center justify-between gap-2">
						<h3 class="text-sm font-semibold text-ink-900">{table.name}</h3>
						<div class="flex flex-wrap items-center gap-2 text-xs text-ink-500">
							{#if table.existence}
								{#if table.existence === 'always'}
									<span>Always exists: the behaviour keeps one record of it in play</span>
								{:else}
									<span>Exists while <span class="font-mono text-ink-700">{table.existenceReads ?? table.existence}</span></span>
								{/if}
								{#if canWrite}
									<Button variant="ghost" size="sm" disabled={busy !== null} onclick={() => act(table.entityId, { action: 'existence', entityId: table.entityId, statePath: null })}>Clear</Button>
								{/if}
							{:else if canWrite && rules.some((r) => r.missing === 'existence')}
								<span>When does one exist? A yes-or-no state, a status condition, or <span class="font-mono">always</span>:</span>
								{#each table.candidates as path (path)}
									<Button variant="outline" size="sm" disabled={busy !== null} onclick={() => act(table.entityId, { action: 'existence', entityId: table.entityId, statePath: path })}>{path}</Button>
								{/each}
								<input
									class="h-7 w-44 rounded-pill border border-line bg-surface px-2 font-mono text-xs"
									list="data-rule-existence"
									placeholder="state, or status != none"
									aria-label="Existence state of {table.name}"
									bind:value={picked[`existence:${table.entityId}`]}
								/>
								<Button variant="outline" size="sm" disabled={busy !== null || !picked[`existence:${table.entityId}`]} onclick={() => act(table.entityId, { action: 'existence', entityId: table.entityId, statePath: picked[`existence:${table.entityId}`] ?? null })}>Name it</Button>
							{/if}
						</div>
					</header>
					{#if rules.length === 0}
						<p class="mt-1 text-xs text-ink-400">States no rule yet: give it a required field, a relation or a choice.</p>
					{:else}
						<ul class="mt-2 space-y-2">
							{#each itemsOf(table.entityId) as item (item.kind === 'rule' ? item.rule.key : item.key)}
								{#if item.kind === 'rule' && unsuggested(item.rule)}
									<li id="rule-{item.rule.key}" class="hidden"></li>
								{:else if item.kind === 'rule'}
									{@const rule = item.rule}
									{@const status = statuses.get(rule.key)!}
									<li id="rule-{rule.key}" class="rounded-lg px-2 py-1.5 {focusRule === rule.key ? 'ring-2 ring-brand-500' : ''}">
										<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
											<Chip tone={status.tone}>{status.label}</Chip>{#if status.lockedBy}<span title={status.detail}><Chip tone="neutral">Proof: {status.lockedBy}</Chip></span>{/if}
											<a class="text-sm leading-relaxed text-ink-800 hover:underline" href={rule.href}>{rule.ears}</a>
										</div>
										{@render verdictOf(rule)}
										{@render linkOf(rule)}
									</li>
								{:else if item.rules.every((r) => r.check === 'none')}
									<!-- a permission states nothing to check: one sentence, no line per field -->
									<li class="rounded-lg px-2 py-1.5 {item.rules.some((r) => r.key === focusRule) ? 'ring-2 ring-brand-500' : ''}">
										{#each item.rules as r (r.key)}<span id="rule-{r.key}"></span>{/each}
										<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
											<Chip tone="neutral">Permission</Chip>
											<p class="text-sm leading-relaxed text-ink-800">{item.ears}</p>
										</div>
									</li>
								{:else}
									<li class="rounded-lg px-2 py-1.5">
										<p class="text-sm leading-relaxed text-ink-800">{item.ears}</p>
										{#each item.rules.filter(unsuggested) as r (r.key)}<span id="rule-{r.key}"></span>{/each}
										{#if item.rules.some((r) => !unsuggested(r))}
										<ul class="mt-1.5 space-y-1.5 border-l border-line pl-3">
											{#each item.rules.filter((r) => !unsuggested(r)) as rule (rule.key)}
												{@const status = statuses.get(rule.key)!}
												<li id="rule-{rule.key}" class="rounded-lg px-1 py-0.5 {focusRule === rule.key ? 'ring-2 ring-brand-500' : ''}">
													<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
														<a class="w-28 truncate font-mono text-xs text-ink-700 hover:underline" href={rule.href} title={rule.ears}>{rule.fieldName}</a>
														<Chip tone={status.tone}>{status.label}</Chip>{#if status.lockedBy}<span title={status.detail}><Chip tone="neutral">Proof: {status.lockedBy}</Chip></span>{/if}
														{#if !rule.tiedTo}{@render linkOf(rule)}{/if}
													</div>
													{@render verdictOf(rule, true)}
													{#if rule.tiedTo}{@render linkOf(rule)}{/if}
												</li>
											{/each}
										</ul>
										{/if}
									</li>
								{/if}
							{/each}
						</ul>
						{@const quiet = unsuggestedOf(table.entityId)}
						{#if quiet.length > 0}
							{@const pickKey = `quiet:${table.entityId}`}
							{@const chosen = quiet.find((r) => r.key === picked[`${pickKey}:field`])}
							<div class="mt-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-500">
								<p>
									<Chip tone="neutral">Not checked yet</Chip>
									No state is suggested for
									{#each quiet as r, i (r.fieldId)}{i > 0 ? ', ' : ''}<a class="font-mono text-ink-700 hover:underline" href={r.href}>{r.fieldName}</a>{/each}:
									the behaviour may not model {quiet.length > 1 ? 'them' : 'it'}.
								</p>
								{#if canWrite}
									<div class="mt-1.5 flex flex-wrap items-center gap-2">
										<select class="h-7 rounded-pill border border-line bg-surface px-2 font-mono text-xs" aria-label="Field to link in {table.name}" bind:value={picked[`${pickKey}:field`]}>
											<option value="">field…</option>
											{#each quiet as r (r.fieldId)}<option value={r.key}>{r.fieldName}</option>{/each}
										</select>
										<span>held by</span>
										<input
											class="h-7 w-52 rounded-pill border border-line bg-surface px-2 font-mono text-xs"
											list="data-rule-states"
											placeholder="search the states"
											aria-label="State that holds the chosen field of {table.name}"
											bind:value={picked[pickKey]}
										/>
										<Button variant="outline" size="sm" disabled={busy !== null || !chosen || !picked[pickKey]} onclick={() => chosen && act(chosen.key, { action: 'tie', fieldId: chosen.fieldId, statePath: picked[pickKey] ?? '' })}>Link</Button>
									</div>
								{/if}
							</div>
						{/if}
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>
