<script lang="ts">
	import GlossaryText from "$ui/glossary/GlossaryText.svelte";
	import type { KernelRule } from "$application/specification/index-feature-rules";
	import { unspaFeaturePath, unspaRulePath } from "$ui/features/unspa-dashboard-url";
	import { sortByVerdict } from "$application/analysis/rule-verdicts";
	import { getRuleVerdicts } from "./rule-verdicts.svelte";
	import RuleVerdictMark from "./RuleVerdictMark.svelte";

	/**
	 * The lines of behavior-model rules, built the way the rule inventory always
	 * built them: a meta line (the effect, the category), the sentence, the
	 * reason, and Edit. One list of them: an action's rules, a surface's own, or
	 * a feature's. The feature tree opens these under the feature and the action
	 * they belong to, which is where a reader looks for them.
	 */
	interface Props {
		rules: readonly KernelRule[];
		/** The sentence an action's refusals share; each refusal then reads as one case under it. */
		refusalLead?: string | null;
		/** Under an action heading a rule's title is only its category, so it moves to the meta line. */
		underAction?: boolean;
		/** Opens the Behavior tab's EMBEDDED editor on `path` (null = the project). */
		onOpenEditor?: (path?: string | null) => void;
	}
	let {
		rules,
		refusalLead = null,
		underAction = false,
		onOpenEditor,
	}: Props = $props();

	/* What the solver says about each rule. Drawing a feature's rules proves
	   that feature in the background: the sentences show at once, the verdicts
	   come as each proof answers, and a feature is never proved twice. */
	const verdicts = getRuleVerdicts();
	$effect(() => {
		if (!verdicts) return;
		const groups = new Map<string | null, boolean>();
		for (const rule of rules) {
			const id = rule.origin.kind === "project" ? null : rule.origin.featureId;
			groups.set(id, (groups.get(id) ?? false) || rule.kind === "invariant");
		}
		verdicts.request([...groups].map(([featureId, hasStatements]) => ({ featureId, hasStatements })));
	});

	/* A feature the solver could not prove says so once, under its rules:
	   no verdict there is not a clean one. */
	const unproven = $derived.by(() => {
		if (!verdicts) return [];
		const texts = new Set<string>();
		for (const rule of rules) {
			const id = rule.origin.kind === "project" ? null : rule.origin.featureId;
			const read = id ? verdicts.features.get(id) : undefined;
			if (read?.solver === "unavailable" && read.scope) texts.add(read.scope.text);
		}
		return [...texts];
	});

	/* Once the solver answers, the most worrying verdict reads first and the
	   order moves as each verdict arrives; without a solver (Community, or no
	   verdict yet) the rules keep the model's order. */
	const ordered = $derived(
		verdicts ? sortByVerdict(rules, (rule) => verdicts.verdictOf(rule)) : rules,
	);

	/** Where Edit opens the rule in the framed editor; null = the project itself. */
	const rulePath = (rule: KernelRule) => {
		if (rule.origin.kind === "project") return null;
		const feature = rule.origin.featureId;
		return (
			unspaRulePath(rule) ?? (feature ? unspaFeaturePath(feature) : null)
		);
	};
</script>

{#snippet effectTag(rule: KernelRule)}
	{@const tone =
		rule.kind === "invariant"
			? "text-info-600 bg-info-500"
			: rule.effect === "block"
				? "text-danger-600 bg-danger-500"
				: "text-success-600 bg-success-500"}
	<span class="inline-flex items-center gap-1 {tone.split(' ')[0]}">
		<span class="size-1.5 {tone.split(' ')[1]}" aria-hidden="true"></span>
		{rule.kind === "invariant"
			? "Invariant"
			: rule.effect === "block"
				? "Blocks"
				: "Allows"}
	</span>
{/snippet}

{#snippet noReason(rule: KernelRule)}
	{#if !rule.hasDescription}
		<span
			class="rounded-pill bg-warning-50 px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide text-warning-600"
			title="The rule says what it requires, not why"
		>
			No reason
		</span>
	{/if}
{/snippet}

{#snippet verdictChip(rule: KernelRule)}
	{@const verdict = verdicts?.verdictOf(rule)}
	{#if verdict}
		<RuleVerdictMark {verdict} />
	{/if}
{/snippet}

<!-- A flaw shows its proof in full: the reader decides from it, not from a tooltip. -->
{#snippet flawProof(rule: KernelRule)}
	{@const verdict = verdicts?.verdictOf(rule)}
	{#if verdict?.flaw && verdict.detail}
		<div class="mt-1 rounded-field bg-danger-50 px-2 py-1 text-[0.6875rem] text-ink-700">
			<p>{verdict.detail}</p>
			{#if verdict.fix}<p class="mt-0.5 text-ink-500">{verdict.fix}</p>{/if}
		</div>
	{/if}
{/snippet}

{#snippet why(rule: KernelRule)}
	{#if rule.hasDescription}
		<p class="text-xs text-ink-500">
			<span class="font-medium text-ink-400">Why:</span>
			<GlossaryText text={rule.description} />
		</p>
	{/if}
{/snippet}

{#snippet editLinks(rule: KernelRule)}
	{#if onOpenEditor}
		<button
			type="button"
			onclick={() => onOpenEditor(rulePath(rule))}
			class="mt-0.5 shrink-0 text-[0.6875rem] font-medium text-brand-500 hover:text-brand-600 hover:underline"
		>
			Edit
		</button>
	{/if}
{/snippet}

<!-- Every line is built the same way, on the same left edge: a small meta line
     (the effect, then the category), the sentence, the reason. Nothing sits in
     a column of its own, so no badge of a varying width can push the text. -->
{#snippet row(rule: KernelRule)}
	{@const titleInMeta = underAction && rule.kind === "rule"}
	<li class="flex items-start gap-3 px-4 py-2">
		<div class="min-w-0 flex-1 space-y-0.5">
			<p
				class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.625rem] font-semibold uppercase tracking-wide"
			>
				{@render effectTag(rule)}
				{#if titleInMeta}
					<span class="text-ink-300" aria-hidden="true">·</span>
					<span class="text-ink-400">{rule.title}</span>
				{/if}
				{@render noReason(rule)}
				{@render verdictChip(rule)}
			</p>
			{#if !titleInMeta}
				<p class="text-xs font-semibold text-ink-800">{rule.title}</p>
			{/if}
			<p class="text-xs text-ink-700">
				<GlossaryText text={rule.statement} ears />
			</p>
			{@render why(rule)}
			{@render flawProof(rule)}
		</div>
		{@render editLinks(rule)}
	</li>
{/snippet}

<!-- One condition under the sentence its action's refusals share. -->
{#snippet caseRow(
	rule: KernelRule,
	refusal: NonNullable<KernelRule["refusal"]>,
)}
	<li class="flex items-start gap-3 px-4 py-1.5">
		<div class="min-w-0 flex-1 space-y-0.5">
			<p
				class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.625rem] font-semibold uppercase tracking-wide"
			>
				{@render effectTag(rule)}
				<span class="text-ink-300" aria-hidden="true">·</span>
				<span class="text-ink-400">{rule.title}</span>
				{@render noReason(rule)}
				{@render verdictChip(rule)}
			</p>
			<p class="text-xs text-ink-700">
				<GlossaryText text={refusal.case} ears />{#if refusal.message}<span
						class="text-ink-500">, and it shows "{refusal.message}"</span
					>{/if}
			</p>
			{@render why(rule)}
			{@render flawProof(rule)}
		</div>
		{@render editLinks(rule)}
	</li>
{/snippet}

{#if refusalLead}
	<p class="px-4 pt-1 text-xs text-ink-700">
		<GlossaryText text={refusalLead} ears />
	</p>
{/if}
<ul>
	{#each ordered as rule (rule.id)}
		{#if refusalLead && rule.refusal}
			{@render caseRow(rule, rule.refusal)}
		{:else}
			{@render row(rule)}
		{/if}
	{/each}
</ul>
{#each unproven as text (text)}
	<p class="px-4 pb-2 text-[0.6875rem] text-warning-600">{text}</p>
{/each}
