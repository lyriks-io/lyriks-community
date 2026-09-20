<script lang="ts">
	import { HelpTip, SearchInput, matchesQuery } from '$ui/design-system';
	import {
		CODE_WORK,
		currentLines,
		findingsForCurrentHypothesis,
		type EvolutionRequest,
		type ImpactFinding
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';
	import type { FeatureImplementationCoverage } from '$application/use-cases/load-implementation-coverage';

	/**
	 * Where this change lands in the CODE, read before a line of it is written.
	 *
	 * It is organised by FILE, because that is the unit of the work: a developer
	 * opens files, not specification elements. Each one says why it is in the
	 * list, what it holds today, and therefore what breaking it would break. The
	 * specification vocabulary appears only where it answers that last question,
	 * and it is spelled in the reader's words rather than the engine's.
	 *
	 * It is a briefing and never a verdict. Nothing here opens a repository file:
	 * locations come from the index a checkout syncs, so an empty answer means no
	 * index, not no code.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
		coverage: Record<string, FeatureImplementationCoverage>;
		leaves: readonly { id: string; name: string }[];
	}
	let { store, request, coverage, leaves }: Props = $props();

	let query = $state('');

	const featureName = (id: string) => leaves.find((l) => l.id === id)?.name ?? id;
	const featureIdOf = (finding: ImpactFinding) => finding.nodeId.split(':')[0];

	/** The engine's element kinds, in the words a reader of this product has. */
	const PLAIN: Record<string, string> = {
		action: 'action',
		surface: 'screen',
		state: 'state',
		event: 'event',
		rule: 'guard',
		surface_invariant: 'invariant',
		entity: 'record'
	};
	const plain = (kind: string) => PLAIN[kind] ?? kind;

	interface Located {
		name: string;
		kind: string;
		file: string;
		line: number;
		snippet: string;
	}

	/** The features the change reaches, whose code has to be looked up. */
	const touched = $derived(
		[
			...new Set(
				findingsForCurrentHypothesis(request)
					.filter((f) => f.section === 'leaves' && f.nodeKind !== 'file')
					.map(featureIdOf)
					.filter((id) => !request.leafIds.includes(id))
			)
		].map((id) => ({
			id,
			name: featureName(id),
			why: findingsForCurrentHypothesis(request)
				.filter((f) => f.section === 'leaves' && featureIdOf(f) === id)
				.map((f) => f.note),
			code: coverage[id] ?? null
		}))
	);

	let located = $state<Record<string, { found: Located[]; missing: string[] }>>({});
	let asked = new Set<string>();

	$effect(() => {
		for (const feature of touched) {
			if (asked.has(feature.id)) continue;
			asked.add(feature.id);
			void (async () => {
				try {
					const res = await fetch(
						`/api/behavior/implementation/status?projectId=${encodeURIComponent(
							store.draft.projectId
						)}&featureId=${encodeURIComponent(feature.id)}`
					);
					const body = (await res.json()) as {
						status?: { actions?: Record<string, unknown>[] } | null;
						actions?: Record<string, unknown>[];
					};
					const actions = (body.actions ?? body.status?.actions ?? []) as Record<string, unknown>[];
					const found: Located[] = [];
					const missing: string[] = [];
					for (const action of actions) {
						for (const e of (action.foundEntities ?? []) as Record<string, unknown>[]) {
							for (const l of (e.locations ?? []) as Record<string, unknown>[]) {
								found.push({
									name: String(e.entityName ?? ''),
									kind: String(e.entityType ?? ''),
									file: String(l.file ?? ''),
									line: Number(l.line ?? 0),
									snippet: String(l.snippet ?? '')
								});
							}
						}
						for (const e of (action.missingEntities ?? []) as Record<string, unknown>[])
							missing.push(`${plain(String(e.entityType))} ${e.entityName}`);
					}
					located[feature.id] = { found, missing };
				} catch {
					located[feature.id] = { found: [], missing: [] };
				}
			})();
		}
	});

	interface FileRow {
		path: string;
		/** Why the change reaches this file, in the impact report's own words. */
		why: string[];
		/** What the file is known to implement, and therefore what breaking it breaks. */
		holds: Located[];
		/** The features that answer for it. */
		features: string[];
	}

	/**
	 * One row per file: the unit of the work. A file arrives either because an
	 * impact named it outright, or because the index locates something there.
	 */
	const files = $derived.by<FileRow[]>(() => {
		const rows = new Map<string, FileRow>();
		const at = (path: string): FileRow => {
			const row = rows.get(path) ?? { path, why: [], holds: [], features: [] };
			rows.set(path, row);
			return row;
		};
		for (const f of findingsForCurrentHypothesis(request)) {
			if (f.nodeKind !== 'file') continue;
			const row = at(f.nodeId);
			if (f.note) row.why.push(f.note);
		}
		for (const feature of touched) {
			for (const hit of located[feature.id]?.found ?? []) {
				const row = at(hit.file);
				row.holds.push(hit);
				if (!row.features.includes(feature.name)) {
					row.features.push(feature.name);
					for (const note of feature.why) if (!row.why.includes(note)) row.why.push(note);
				}
			}
		}
		return [...rows.values()]
			.filter((r) => matchesQuery(query, r.path, ...r.why, ...r.holds.map((h) => h.name)))
			.sort((a, b) => b.holds.length - a.holds.length || a.path.localeCompare(b.path));
	});

	/**
	 * The work, in the four shapes code comes in. A finding lands in a bucket
	 * because somebody read it against the repository and said so; one that
	 * nobody has read yet lands in none, and is listed at the foot as exactly
	 * that rather than guessed into a pile.
	 */
	const buckets = $derived(
		CODE_WORK.map((work) => ({
			...work,
			rows: findingsForCurrentHypothesis(request)
				.filter((f) => f.codeWork === work.code)
				.filter((f) => matchesQuery(query, f.nodeId, f.nodeLabel, f.note))
		}))
	);

	/** Impacts nobody has read against the code yet. */
	const unread = $derived(
		findingsForCurrentHypothesis(request).filter((f) => f.codeWork === null).length
	);

	/** Named by the impact report, and the index cannot say where they live. */
	const unmapped = $derived(
		touched.filter((f) => (located[f.id]?.found.length ?? 0) === 0 && matchesQuery(query, f.name))
	);

	/** What has to be written: declared by the change, held by no file yet. */
	const toWrite = $derived(
		currentLines(request)
			.filter((l) => l.verdict === 'missing')
			.filter((l) => matchesQuery(query, l.requirement, l.specStatement))
	);

	/** What the change is not allowed to break, from the impact report. */
	const mustNotBreak = $derived(
		findingsForCurrentHypothesis(request)
			.filter((f) => f.section === 'rules_and_scenarios' || f.severity === 'blocking')
			.filter((f) => matchesQuery(query, f.nodeLabel, f.note))
	);
</script>

<div class="space-y-4">
	<div class="rounded-card border border-line bg-surface-sunken/40 px-4 py-3">
		<div class="flex items-center gap-1.5">
			<p class="text-sm font-semibold text-ink-900">Where this change lands in the code</p>
			<HelpTip
				title="Code impact"
				what="The same change, read against the repository instead of the specification: the files to open, what each of them holds today, and what breaking one would break."
				how={[
					'Read it before you write. The verdict on what you built is stage 3, and it needs the code to exist.',
					'Files to open is the blast radius. The line under each path says why the change reaches it.',
					'What it holds today is what that file is known to implement. It is what a careless edit takes down with it, which is the only reason the specification is quoted here at all.',
					'To write is the change itself: nothing in any file answers for it yet.',
					'What must not break is the short list to keep beside you while you work.'
				]}
				value="A change planned from the specification alone is estimated on the half of the work that is visible. This is the other half, and it is the half that breaks things."
			/>
		</div>
		<p class="mt-1 text-[12px] leading-relaxed text-ink-600">
			Nothing here opens a repository file. What a file is known to hold comes from the index a
			checkout syncs, so a file with nothing under it is a file nobody has mapped yet, not a file
			that does nothing.
		</p>
	</div>

	<SearchInput bind:value={query} placeholder="Search a file, a feature or a risk…" size="md" class="max-w-md" />

	{#each buckets as bucket (bucket.code)}
		<section class="rounded-card border border-line bg-surface">
			<header class="border-b border-line px-4 py-3">
				<div class="flex flex-wrap items-baseline gap-2">
					<p class="text-sm font-semibold text-ink-900">{bucket.label}</p>
					<span class="text-[11px] text-ink-500">
						{bucket.rows.length}{bucket.code === 'add' && toWrite.length > 0
							? ` in the repository, plus ${toWrite.length} the specification declares`
							: ''}
					</span>
				</div>
				<p class="text-[11px] text-ink-500">{bucket.hint}</p>
			</header>

			{#if bucket.rows.length === 0 && !(bucket.code === 'add' && toWrite.length > 0)}
				<p class="px-4 py-5 text-center text-[12px] text-ink-500">
					Nothing here under this hypothesis.
				</p>
			{:else}
				<ul class="divide-y divide-line">
					{#each bucket.rows as row (row.id)}
						{@const file = files.find((f) => f.path === row.nodeId)}
						<li class="px-4 py-2.5">
							{#if row.nodeKind === 'file'}
								<p class="font-mono text-[12px] font-medium text-ink-800">{row.nodeId}</p>
							{:else}
								<p class="text-[12px] font-medium text-ink-800">{row.nodeLabel}</p>
							{/if}
							<p class="mt-0.5 text-[11px] leading-snug text-ink-600">{row.note}</p>
							<!-- What the file holds matters most where it is about to be edited. -->
							{#if file && file.holds.length > 0}
								<p class="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
									{bucket.code === 'at_risk' ? 'Breaking this takes down' : 'Editing this can take down'}
								</p>
								<ul class="mt-0.5 space-y-0.5">
									{#each file.holds as hit (hit.file + hit.line + hit.name)}
										<li class="flex flex-wrap items-baseline gap-x-2 text-[11px]">
											<span class="font-mono text-ink-500">line {hit.line}</span>
											<span class="text-ink-700">{hit.name}</span>
											<span class="text-ink-400">({plain(hit.kind)})</span>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}

					<!-- The change's own elements: nothing in any file answers for them. -->
					{#if bucket.code === 'add'}
						{#each toWrite as line (line.id)}
							<li class="px-4 py-2.5">
								<p class="text-[12px] font-medium text-ink-800">{line.requirement}</p>
								{#if line.specStatement}
									<p class="mt-0.5 text-[11px] leading-snug text-ink-600">{line.specStatement}</p>
								{/if}
								<p class="mt-0.5 text-[10px] text-ink-400">No file answers for this yet.</p>
							</li>
						{/each}
					{/if}
				</ul>
			{/if}
		</section>
	{/each}

	<!-- Every file the index locates something in, so a careless edit is visible. -->
	{#if files.some((f) => f.holds.length > 0)}
		<section class="rounded-card border border-line bg-surface">
			<header class="border-b border-line px-4 py-3">
				<p class="text-sm font-semibold text-ink-900">What these files hold today</p>
				<p class="text-[11px] text-ink-500">
					Read from the index a checkout synced. It is what an edit in one of them can take down
					without anyone noticing until it is shipped.
				</p>
			</header>
			<ul class="divide-y divide-line">
				{#each files.filter((f) => f.holds.length > 0) as file (file.path)}
					<li class="px-4 py-2.5">
						<div class="flex flex-wrap items-baseline gap-2">
							<p class="font-mono text-[12px] font-medium text-ink-800">{file.path}</p>
							<span
								class="shrink-0 rounded-pill bg-warning-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning-700"
							>
								{file.holds.length} to preserve
							</span>
						</div>
						<ul class="mt-1 space-y-0.5">
							{#each file.holds as hit (hit.file + hit.line + hit.name)}
								<li class="flex flex-wrap items-baseline gap-x-2 text-[11px]">
									<span class="font-mono text-ink-500">line {hit.line}</span>
									<span class="text-ink-700">{hit.name}</span>
									<span class="text-ink-400">({plain(hit.kind)})</span>
									{#if hit.snippet}
										<span class="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-400">
											{hit.snippet}
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if unread > 0}
		<p class="rounded-card border border-line bg-surface-sunken/40 px-4 py-2.5 text-[11px] text-ink-600">
			{unread} impact{unread === 1 ? '' : 's'} on this reading has not been read against the code
			yet, so it is in none of the four lists above. What is here is a floor, not a total.
		</p>
	{/if}

	<!-- The honest edge of the list. -->
	{#if unmapped.length > 0}
		<section class="rounded-card border border-warning-200 bg-warning-50/50 px-4 py-3">
			<p class="text-[12px] font-semibold text-warning-800">
				{unmapped.length} feature{unmapped.length === 1 ? '' : 's'} the change reaches, with no code
				mapped
			</p>
			<p class="mt-1 text-[11px] leading-relaxed text-warning-800">
				The list above is short by whatever these hold: {unmapped.map((f) => f.name).join(', ')}.
				Nothing says they have no code, only that no index says where it is. Until one does, the
				blast radius is a lower bound.
			</p>
		</section>
	{/if}
</div>
