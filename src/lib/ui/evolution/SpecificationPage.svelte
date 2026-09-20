<script lang="ts">
	import { Icon } from '$ui/design-system';
	import FieldThread from './FieldThread.svelte';
	import GuidedFill from './GuidedFill.svelte';
	import SpecField from './SpecField.svelte';
	import SpecifyRail from './SpecifyRail.svelte';
	import {
		actsFor,
		blocksFor,
		canOpenGuidedFill,
		canResume,
		canonicalPathsFor,
		fieldKey,
		firstEmptyFieldPath,
		pendingFields,
		type BlockField,
		type EvolutionRequest
	} from '$domain/evolution';
	import type { EvolutionStore } from './draft-store.svelte';

	/**
	 * Stage 1, Specify: the whole specification of a change on ONE continuous
	 * page, read in five acts. Why, for whom, what it does, what it touches, how
	 * it is built. Every field is a question with a real example and why it
	 * matters; a field the author cannot answer yet is an open question, in
	 * amber, counted as empty and never a fault.
	 *
	 * No act gates another. The rail on the left says where the reader is and
	 * how full each act is, names what blocks, and offers the two ways back into
	 * the holes: Resume, and Fill the gaps one question at a time. Every value
	 * lives in the section that owns it; the dossier keeps no copy.
	 */
	interface Props {
		store: EvolutionStore;
		request: EvolutionRequest;
		canEdit: boolean;
		sources: readonly { id: string; title: string; url: string; note: string }[];
		held: Record<string, { summary: string; names: string[] }>;
		onOpenCanonical: (section: string, path: string) => void;
	}
	let { store, request, canEdit, sources, held, onOpenCanonical }: Props = $props();

	// The inline values live in the sections that own them, so they are read
	// through rather than held: whenever the touched features change, read again.
	$effect(() => {
		void store.loadFieldValues(request);
	});

	const filled = $derived(store.filledKeysOf(request));
	const reading = $derived(store.maturity);
	const coherence = $derived(store.coherenceOf(request));
	const readiness = $derived(store.readinessOf(request));
	const blocks = $derived(blocksFor(request));
	const acts = $derived(actsFor(blocks));
	const readingOf = (blockId: string) => reading.perBlock.find((p) => p.block.id === blockId);
	const nextHole = $derived(
		firstEmptyFieldPath(filled, request.leafIds, request.openQuestionKeys, blocks)
	);
	const pendingCount = $derived(
		pendingFields(filled, request.openQuestionKeys, request.leafIds, blocks).length
	);
	const leafName = (id: string) => id;

	let focusedField = $state('');
	let activeActId = $state('why');

	/** The act being read follows the scroll, so the rail always says where you are. */
	$effect(() => {
		if (typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) activeActId = (entry.target as HTMLElement).dataset.act ?? activeActId;
				}
			},
			{ rootMargin: '-20% 0px -70% 0px' }
		);
		for (const el of document.querySelectorAll<HTMLElement>('[data-act]')) observer.observe(el);
		return () => observer.disconnect();
	});

	function scrollTo(id: string) {
		requestAnimationFrame(() =>
			document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
		);
	}
	function goTo(path: string) {
		focusedField = path;
		requestAnimationFrame(() =>
			document.getElementById(`dossier-field-${path}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
		);
	}
	function resume() {
		const allowed = canResume(nextHole);
		if (!allowed.ok) {
			store.notifier.notify('info', allowed.reason);
			return;
		}
		goTo(nextHole);
	}

	/** Fill the gaps: a second reading of this page, one question per screen. */
	let guided = $state(false);
	function openGuided() {
		const allowed = canOpenGuidedFill({ canEdit, pendingCount });
		if (!allowed.ok) {
			store.notifier.notify('info', allowed.reason);
			return;
		}
		guided = true;
	}
	function leaveGuided(fieldPath: string) {
		guided = false;
		if (fieldPath) goTo(fieldPath);
	}

	/** The field home whose thread is open in the side panel. */
	let threadFor = $state<{ field: BlockField; leafId: string | null } | null>(null);

	/** The dossier as plain text: a way to READ it, never the handoff. */
	const textRendering = $derived.by(() => {
		const lines: string[] = [`# ${request.title || 'Untitled request'}`, ''];
		for (const { act, blocks: actBlocks } of acts) {
			lines.push(`## ${act.title}`, '');
			for (const block of actBlocks) {
				for (const field of block.fields) {
					lines.push(`### ${field.question}`);
					const homes = canonicalPathsFor(field, request.leafIds);
					if (homes.length === 0) lines.push('(no home yet: name what this touches)');
					for (const home of homes) {
						const key = fieldKey(field.path, home.leafId);
						const open = request.openQuestionKeys.includes(key);
						const prefix = home.leafId ? `[${home.leafId}] ` : '';
						if (field.editor === 'inline') {
							const value = store.fieldValues[key]?.value?.trim() ?? '';
							lines.push(`${prefix}${open ? '(open question)' : value || '(empty)'}`);
						} else {
							const there = held[field.canonicalPath];
							const status = open ? '(open question)' : filled.has(key) ? `written in ${field.section}` : '(empty)';
							lines.push(`${prefix}${status}${there ? ` [${there.summary}]` : ''}`);
						}
					}
					lines.push('');
				}
			}
		}
		return lines.join('\n');
	});
</script>

<div class="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
	<SpecifyRail
		{acts}
		maturity={reading}
		{coherence}
		{readiness}
		openThreads={store.openThreads(request)}
		{activeActId}
		{pendingCount}
		onJump={(id) => scrollTo(`act-${id}`)}
		onGoTo={goTo}
		onResume={resume}
		onFillTheGaps={openGuided}
	/>

	<div class="min-w-0 space-y-12">
		<p class="text-[12px] text-ink-500">
			This page fills in any order. A field you cannot answer yet is an
			<span class="font-semibold text-warning-700">open question</span>: mark it with the
			<Icon name="circle-question-mark" size={11} class="inline text-warning-600" /> at the right of the
			field, it turns amber, counts as a hole and lowers nothing else. Fill the gaps walks those first.
		</p>

		{#each acts as { act, blocks: actBlocks }, i (act.id)}
			<section id={`act-${act.id}`} data-act={act.id} class="scroll-mt-6 space-y-5">
				<header class="space-y-1">
					<p class="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
						{String(i + 1).padStart(2, '0')} · {act.title}
					</p>
					<h3 class="text-2xl font-bold leading-tight text-ink-900">{act.question}</h3>
				</header>

				{#each actBlocks as block (block.id)}
					{@const state = readingOf(block.id)}
					<div class="space-y-3">
						<div class="flex flex-wrap items-baseline gap-2">
							<h4 class="text-sm font-semibold text-ink-800">{block.title}</h4>
							<span class="text-[11px] text-ink-400">{block.purpose}</span>
							{#if state?.parked}
								<span class="text-[10px] font-semibold text-warning-700" title="Every field of this block is an open question">
									parked
								</span>
							{/if}
							{#if block.conditional}
								<span class="text-[10px] uppercase tracking-wide text-ink-400" title="Shown because the change touches this dimension">
									touched
								</span>
							{/if}
						</div>
						{#each block.fields as field (field.path)}
							<SpecField
								{store}
								{request}
								{field}
								blockState={state?.state ?? 'empty'}
								{canEdit}
								{sources}
								{held}
								{filled}
								focused={focusedField === field.path}
								{onOpenCanonical}
								onOpenThread={(leafId) => (threadFor = { field, leafId })}
							/>
						{/each}
					</div>
				{/each}
			</section>
		{/each}

		<!-- A way to READ the dossier, never the handoff. The next stage is the gate below. -->
		<details class="rounded-card border border-line bg-surface">
			<summary class="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-800">Read as text</summary>
			<p class="px-4 text-[11px] text-ink-500">
				A rendering of what the sections hold, for reading. The next stage is the gate below.
			</p>
			<pre
				class="m-4 mt-2 overflow-x-auto whitespace-pre-wrap rounded-field border border-line bg-surface-sunken/50 p-3 font-mono text-[11px] leading-relaxed text-ink-700">{textRendering}</pre>
		</details>
	</div>
</div>

{#if guided}
	<GuidedFill {store} {request} {canEdit} {held} onLeave={leaveGuided} {onOpenCanonical} />
{/if}

{#if threadFor}
	<FieldThread
		{store}
		{request}
		field={threadFor.field}
		leafId={threadFor.leafId}
		leafName={leafName(threadFor.leafId ?? '')}
		{canEdit}
		onClose={() => (threadFor = null)}
	/>
{/if}
