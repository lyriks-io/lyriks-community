<script lang="ts">
	import { Chip, Icon } from '$ui/design-system';
	import type { VersionChange, VersionReading, VersionSnapshot } from '$domain/evolution';
	import { TONE, type Tone } from './verdict-tones';

	/**
	 * The versions of a request (ac-evo-freeze-5, -versions-access, -diff): newest
	 * first, each with what changed from the one before, before and after side by
	 * side, and the copy it kept, read-only. A version is never made the one the
	 * code is built against from here: going back is a reopening that freezes the
	 * older content again as a new version.
	 */
	interface Props {
		projectId: string;
		requestId: string;
		/** The version the code is built against, or the last one frozen. */
		specVersion: number;
		frozen: boolean;
		/** Bumped when the request moves, so the copies are read again. */
		stamp: string;
		nameOf: (id: string) => string;
	}
	let { projectId, requestId, specVersion, frozen, stamp, nameOf }: Props = $props();

	let versions = $state<VersionReading[] | null>(null);
	let leafNames = $state<Record<string, string>>({});
	let sinceLast = $state<VersionChange[] | null>(null);
	let failed = $state(false);
	$effect(() => {
		void stamp;
		void load();
	});
	async function load() {
		failed = false;
		const res = await fetch(`/api/evolution?projectId=${encodeURIComponent(projectId)}&requestId=${encodeURIComponent(requestId)}&part=versions`).catch(() => null);
		if (!res?.ok) {
			failed = true;
			return;
		}
		const body = (await res.json()) as { request: { versions: VersionReading[]; sinceLast: VersionChange[] | null; leafNames: Record<string, string> } };
		versions = body.request.versions;
		leafNames = body.request.leafNames ?? {};
		sinceLast = body.request.sinceLast;
	}

	/** One version open on its changes, one on its content. The newest opens on its changes. */
	let changesOpen = $state<Record<number, boolean>>({});
	let readOpen = $state<number | null>(null);
	const changesShown = (v: VersionReading, i: number) => changesOpen[v.version] ?? i === 0;

	const STATUS: Record<VersionChange['status'], { tone: Tone; word: string }> = {
		added: { tone: 'todo', word: 'Added' },
		changed: { tone: 'decide', word: 'Reworded' },
		removed: { tone: 'blocks', word: 'Removed' }
	};
	const KIND_TITLE: Record<VersionChange['kind'], string> = {
		need: 'Need',
		step: 'Step descriptions',
		subject: 'Subjects',
		subject_field: 'What each subject says',
		criterion: 'Acceptance criteria',
		behaviour: 'Behaviour',
		data: 'Data changes',
		section: 'Other parts of the spec',
		rule: 'Rules the whole product keeps',
		finding: 'Findings this change settles'
	};
	const KIND_ORDER: readonly VersionChange['kind'][] = ['subject', 'data', 'section', 'rule', 'finding', 'criterion', 'behaviour', 'subject_field', 'need', 'step'];
	const grouped = (changes: readonly VersionChange[]) =>
		KIND_ORDER.map((kind) => ({ kind, rows: changes.filter((c) => c.kind === kind) })).filter((g) => g.rows.length > 0);
	/** What one change counts as, singular and plural, so the summary reads as a sentence. */
	const NOUN: Record<VersionChange['kind'], [string, string]> = {
		need: ['need answer', 'need answers'],
		step: ['step description', 'step descriptions'],
		subject: ['subject', 'subjects'],
		subject_field: ['subject field', 'subject fields'],
		criterion: ['criterion', 'criteria'],
		behaviour: ['behaviour element', 'behaviour elements'],
		data: ['data change', 'data changes'],
		section: ['page change', 'page changes'],
		rule: ['change to the rules', 'changes to the rules'],
		finding: ['finding settled', 'findings settled']
	};
	/** "2 criteria added · 1 behaviour element removed": what a version did, in one line. */
	function summary(changes: readonly VersionChange[]): string {
		const counts = new Map<string, { kind: VersionChange['kind']; word: string; n: number }>();
		for (const c of changes) {
			const key = `${c.kind}|${c.status}`;
			counts.set(key, { kind: c.kind, word: STATUS[c.status].word.toLowerCase(), n: (counts.get(key)?.n ?? 0) + 1 });
		}
		return [...counts.values()].map(({ kind, word, n }) => `${n} ${NOUN[kind][n === 1 ? 0 : 1]} ${word}`).join(' · ');
	}
	const date = (at: string) => at.slice(0, 16).replace('T', ' ');
	const NEED_LABEL: Record<string, string> = {
		description: 'Description',
		situation: 'Current situation',
		symptoms: 'Observed symptoms',
		cost: 'What it costs',
		objectives: 'Objectives',
		measures: 'Measures'
	};
	const STEP_LABEL: Record<string, string> = { solution: 'Solution', functional_spec: 'Functional spec', technical_spec: 'Technical spec' };
	const CHANGE_WORD: Record<string, string> = { add: 'new', amend: 'changed', remove: 'removed' };
	const ELEMENT_VERB: Record<string, string> = { added: 'creates', changed: 'changes', removed: 'removes' };
</script>

{#snippet changeList(changes: readonly VersionChange[])}
	{#if changes.length === 0}
		<p class="text-xs text-ink-500">Same content as the version before.</p>
	{:else}
		<div class="space-y-3">
			{#each grouped(changes) as group (group.kind)}
				<div class="space-y-1">
					<p class="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-500">{KIND_TITLE[group.kind]}</p>
					<ul class="space-y-1">
						{#each group.rows as c, i (i)}
							{@const look = TONE[STATUS[c.status].tone]}
							<li class="rounded-field border border-line border-l-4 px-3 py-1.5 text-xs {look.row}">
								<p class="flex flex-wrap items-center gap-1.5">
									<Icon name={look.icon} size={12} class={look.text} />
									<span class="font-semibold {look.text}">{STATUS[c.status].word}</span>
									<span class="text-ink-900">{c.label}</span>
									{#if c.where}<span class="text-ink-400">· {c.where}</span>{/if}
								</p>
								{#if c.before && c.after}
									<div class="mt-1 grid gap-2 sm:grid-cols-2">
										<p class="text-ink-500 line-through decoration-ink-300">{c.before}</p>
										<p class="text-ink-900">{c.after}</p>
									</div>
								{:else if c.after}
									<p class="mt-0.5 text-ink-800">{c.after}</p>
								{:else if c.before}
									<p class="mt-0.5 text-ink-500 line-through decoration-ink-300">{c.before}</p>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet content(s: VersionSnapshot)}
	<div class="space-y-4 rounded-card border border-line bg-surface-sunken/40 px-4 py-3 text-xs">
		<div class="space-y-1">
			<p class="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-500">Need</p>
			<dl class="grid gap-x-3 gap-y-1 sm:grid-cols-[9rem_1fr]">
				{#each Object.entries(NEED_LABEL) as [key, label] (key)}
					{@const value = s.need[key as keyof typeof s.need] ?? ''}
					<dt class="font-medium text-ink-600">{label}</dt>
					<dd class="whitespace-pre-line {value.trim() ? 'text-ink-900' : 'italic text-ink-400'}">{value.trim() || 'Not answered'}</dd>
				{/each}
			</dl>
		</div>
		{#if Object.values(s.steps).some((v) => v.trim())}
			<div class="space-y-1">
				<p class="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-500">Step descriptions</p>
				<dl class="grid gap-x-3 gap-y-1 sm:grid-cols-[9rem_1fr]">
					{#each Object.entries(STEP_LABEL) as [key, label] (key)}
						{@const value = s.steps[key as keyof typeof s.steps] ?? ''}
						{#if value.trim()}<dt class="font-medium text-ink-600">{label}</dt><dd class="text-ink-900">{value}</dd>{/if}
					{/each}
				</dl>
			</div>
		{/if}
		{#each s.subjects as subject (subject.id)}
			<div class="space-y-1.5 border-t border-line pt-3">
				<p class="flex items-center gap-2 text-sm font-semibold text-ink-900">
					{subject.name || (subject.baseLeafId ? (leafNames[subject.baseLeafId] ?? subject.baseLeafId) : '') || 'New feature'}
					<Chip tone="neutral">{CHANGE_WORD[subject.kind]}</Chip>
				</p>
				{#if subject.changeSummary || subject.description}<p class="text-ink-700">{subject.changeSummary || subject.description}</p>{/if}
				{#if subject.criteria.length > 0 || subject.rewordedCriteria.length > 0}
					<ul class="list-disc space-y-0.5 pl-4 text-ink-800">
						{#each subject.criteria as c (c.id)}<li>{c.text}</li>{/each}
						{#each subject.rewordedCriteria as c (c.id)}<li>{c.text} <span class="text-ink-400">(rewords an existing criterion)</span></li>{/each}
					</ul>
				{/if}
				{#if subject.retiredCriteria.length > 0}
					<p class="text-ink-500">Retires {subject.retiredCriteria.length} existing {subject.retiredCriteria.length === 1 ? 'criterion' : 'criteria'}.</p>
				{/if}
				{#if subject.elements.length > 0}
					<p class="text-ink-600">
						<span class="font-medium">Behaviour:</span>
						{subject.elements.map((e) => `${ELEMENT_VERB[e.status] ?? e.status} ${e.kind} "${e.label}"`).join(' · ')}
					</p>
				{/if}
			</div>
		{/each}
	</div>
{/snippet}

<section class="space-y-3 rounded-card border border-line bg-surface px-4 py-4" aria-label="Versions">
	<header class="space-y-0.5">
		<h2 class="text-sm font-semibold text-ink-900">Versions</h2>
		<p class="text-xs text-ink-500">
			Read-only. {#if frozen}The code is built against version {specVersion}.{:else}The request was reopened after version {specVersion}; the next freeze makes version {specVersion + 1}.{/if}
			Going back to an older content means reopening the request and freezing it again.
		</p>
	</header>

	{#if failed}
		<p class="text-xs {TONE.blocks.text}">The versions could not be read. Reload the page to try again.</p>
	{:else if versions === null}
		<p class="text-xs text-ink-500">Reading the versions…</p>
	{:else}
		{#if sinceLast !== null}
			<div class="space-y-2 rounded-card border border-l-4 px-3 py-2.5 {TONE.decide.box}">
				<p class="text-xs font-semibold {TONE.decide.text}">Since version {specVersion}, not frozen yet{#if sinceLast.length > 0}: {summary(sinceLast)}{/if}</p>
				{@render changeList(sinceLast)}
			</div>
		{/if}

		<ol class="space-y-2">
			{#each versions as v, i (v.version)}
				{@const isBuilt = frozen && v.version === specVersion}
				{@const showChanges = changesShown(v, i)}
				<li class="space-y-2 rounded-card border px-3 py-2.5 {isBuilt ? 'border-brand-200' : 'border-line'}">
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<span class="text-sm font-semibold text-ink-900">Version {v.version}</span>
						{#if isBuilt}<Chip tone="brand">Built against</Chip>{/if}
						<span class="text-xs text-ink-500">frozen {date(v.at)} by {nameOf(v.by)}</span>
						<span class="ml-auto flex gap-3 text-xs">
							{#if v.changes !== null}
								<button type="button" class="text-brand-600 hover:underline" aria-expanded={showChanges} onclick={() => (changesOpen = { ...changesOpen, [v.version]: !showChanges })}>
									{showChanges ? 'Hide changes' : 'What changed'}
								</button>
							{/if}
							{#if v.snapshot}
								<button type="button" class="text-brand-600 hover:underline" aria-expanded={readOpen === v.version} onclick={() => (readOpen = readOpen === v.version ? null : v.version)}>
									{readOpen === v.version ? 'Close' : 'Read this version'}
								</button>
							{/if}
						</span>
					</div>
					{#if !v.snapshot}
						<p class="text-xs text-ink-500">Its content was not kept: this version was frozen before copies were recorded.</p>
					{:else if v.changes === null}
						<p class="text-xs text-ink-500">{i === versions.length - 1 ? 'First version.' : 'The version before kept no copy, so what changed cannot be shown.'}</p>
					{:else}
						<p class="text-xs text-ink-600">{v.changes.length === 0 ? 'Same content as version ' + (v.version - 1) + '.' : `From version ${v.version - 1}: ${summary(v.changes)}`}</p>
						{#if showChanges && v.changes.length > 0}{@render changeList(v.changes)}{/if}
					{/if}
					{#if readOpen === v.version && v.snapshot}{@render content(v.snapshot)}{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>
