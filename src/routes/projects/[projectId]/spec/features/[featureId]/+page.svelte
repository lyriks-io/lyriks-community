<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { anchorDomId, anchorOf } from '$domain/discussions';
	import type { ActionJourney } from '$domain/features';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import RereadCode from '$ui/ai-session/RereadCode.svelte';
	import { getRuleVerdicts } from '$ui/rules/rule-verdicts.svelte';
	import BlockFoot from '$ui/spec360/BlockFoot.svelte';
	import FeatureValidation from '$ui/spec360/FeatureValidation.svelte';
	import InlineEditor from '$ui/spec360/InlineEditor.svelte';
	import SpecControls from '$ui/spec360/SpecControls.svelte';
	import HeadText from '$ui/spec360/page/HeadText.svelte';
	import SpecDataMap from '$ui/spec360/SpecDataMap.svelte';
	import StagedText from '$ui/spec360/StagedText.svelte';
	import ActionJourneys from '$ui/spec360/features/ActionJourneys.svelte';
	import ActionDataTouched from '$ui/spec360/features/ActionDataTouched.svelte';
	import ActionList from '$ui/spec360/features/ActionList.svelte';
	import CoreFeaturePage from '$ui/spec360/features/CoreFeaturePage.svelte';
	import FeaturePoints from '$ui/spec360/features/FeaturePoints.svelte';
	import AskAiTool from '$ui/spec360/page/AskAiTool.svelte';
	import PageHead from '$ui/spec360/page/PageHead.svelte';
	import SectionBox from '$ui/spec360/page/SectionBox.svelte';
	import { LINK } from '$ui/spec360/page/look';
	import { corePath } from '$ui/spec360/spec-nav';
	import { useEditMode } from '$ui/spec360/edit-mode.svelte';
	import { useEdits } from '$ui/spec360/edits.svelte';
	import AddButton from '$ui/spec360/page/AddButton.svelte';
	import { useSources } from '$ui/spec360/sources.svelte';
	import { useSpecNews } from '$ui/spec360/spec-news.svelte';
	import { useValidation } from '$ui/spec360/validation.svelte';
	import type { PageData } from './$types';

	/**
	 * A core feature's page (criterion 64fa19d5, CoreFeaturePage) or a
	 * feature's page (criterion c72a7e79), after the design: its head (the
	 * core feature's name over the feature's, Edit, its comments, Ask my AI,
	 * what it does, the chips of its facts), the validation of the
	 * whole feature while the spec is a draft, then its boxed sections: its
	 * actions as one list (criterion 50809f1c), each with the rules it obeys read
	 * under it (criterion 7d1e80b6) and what the solver says about them
	 * (criterion be4c97ee); the points Lyriks noticed about it; the tables it
	 * uses with the fields its actions read or write marked; and its code read
	 * again by the reader's AI. Every element is discussed at the foot of
	 * its block and validated where it reads; in the Edit mode a click on an
	 * editable text opens its editor in place (criterion 701caee5).
	 */
	let { data }: { data: PageData } = $props();
	const base = $derived(`/projects/${encodeURIComponent(data.projectId)}/spec`);
	const validation = useValidation();
	const edits = useEdits();
	const mode = useEditMode();
	// Adding an action is a draft's, in its Edit mode, for whoever may write it (criterion 51e215ef).
	const addsActions = $derived(mode.active && validation.draft && validation.source.canWrite);
	const sources = useSources();
	const news = useSpecNews();
	const waits = (anchor: string) => validation.waitsOnMe(anchor) || undefined;
	const editable = (anchor: string) => mode.active && validation.draft && validation.source.canWrite && !!edits.shape(anchor);
	/** A feature that cites the code or a source of the reading was read from it: there is code to re-read. */
	const readFromCode = (anchor: string) => !!sources && (sources.codeCountOf(anchor) > 0 || sources.of(anchor).length > 0);
	const counted = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

	// Where the page sits, named in the top bar (the project's name comes first there).

	// Opening a feature or a core feature takes its New or Changed badge off for this reader (action e5b81279).
	$effect(() => {
		const opened = data.page.kind === 'core' ? data.page.core.id : data.page.feature.id;
		untrack(() => news?.open(opened));
	});

	// What the solver says about its rules comes in beside them, proved in the background (criterion be4c97ee).
	const verdicts = getRuleVerdicts();
	$effect(() => {
		if (data.page.kind !== 'feature') return;
		const { id, actions } = data.page.feature;
		untrack(() => verdicts?.proveFeature(id, actions));
	});

	// The Actions box opens on the journeys diagram, the list under it (action f3bbf419).
	// A page reloaded in place may still hold data read before the journeys existed; once the diagram saves, what it saved.
	let savedJourneys = $state<readonly ActionJourney[] | null>(null);
	const journeys = $derived(savedJourneys ?? data.journeys ?? []);
	// A new read of the page (another feature, or the same one read again) drops what the last diagram saved and what was picked.
	let readFor: unknown = null;
	$effect(() => {
		const read = data.journeys;
		untrack(() => {
			if (read === readFor) return;
			readFor = read;
			savedJourneys = null;
			if (data.page.kind === 'feature' && !data.page.feature.actions.some((a) => a.id === picked)) picked = null;
		});
	});
	// The action read under the diagram (action 6f38e6ed): none by itself, the one a direct link names to it or one of its rules.
	const linkedAction = (hash: string): string | null => {
		if (data.page.kind !== 'feature') return null;
		const f = data.page.feature;
		const named = (anchor: string) => hash === `#${anchorDomId(anchor)}`;
		return f.actions.find((a) => named(anchorOf('action', f.id, a.id)) || a.rules.some((r) => named(anchorOf('rule', f.id, r.id))))?.id ?? null;
	};
	// The diagram shows to whoever may write, or once it has an arrow; else, and in the page's Edit mode, the whole list (and the feature's Data box) reads instead.
	const showsDiagram = $derived(validation.source.canWrite || journeys.some((j) => j.links.length));
	const wholeList = $derived(mode.active || !showsDiagram);
	// The fragment never reaches the server: the link is read once the page runs in the browser.
	let picked = $state<string | null>(null);
	$effect(() => {
		const linked = linkedAction(page.url.hash);
		if (linked) untrack(() => (picked = linked));
	});

	// The design's chip of a fact (.chip2 on paper): mono 11px on toner, a line border.
	const CHIP = 'inline-flex h-[22px] items-center border border-line bg-toner px-[7px] font-evo-mono text-[0.6875rem] text-ink-2';
</script>

{#if data.page.kind === 'core'}
	<!-- A new core feature mounts afresh: its parts never keep the last one's open panels. -->
	{#key data.page.core.id}<CoreFeaturePage core={data.page.core} {base} />{/key}
{:else}
	{@const p = data.page}
	{@const f = p.feature}
	{@const anchor = anchorOf('feature', f.id)}
	{@const read = { text: f.name, desc: f.description }}
	{@const shown = edits.shown(anchor, read)}
	{@const flow = anchorOf('flow', f.id)}
	{@const behaviour = f.actions.flatMap((a) => [anchorOf('action', f.id, a.id), ...a.rules.map((r) => anchorOf('rule', f.id, r.id))])}
	{@const all = [anchor, ...behaviour, ...(f.actions.length ? [flow] : [])]}
	{@const ruleCount = f.actions.reduce((n, a) => n + a.rules.length, 0)}
	{@const profiles = new Set(f.actions.flatMap((a) => a.who.map((w) => w.id))).size}
	<!-- A new feature comes in afresh: its parts never keep the last one's open panels. -->
	{#key f.id}
		<div id="kb-feature-{f.id}" class="flex min-w-0 animate-lk-in flex-col">
			<!-- Its name and description are fields of the Edit mode, held until Save (criterion 41514698). -->
			{#snippet name()}<StagedText {anchor} {read} field="text" label="Name" editable={editable(anchor)}>{shown.text}</StagedText>{/snippet}
			<!-- Its core feature, as a link, is its way up: no trail names where it sits (criteria 14a1164c, 8a6a568b). -->
			<PageHead kicker="Feature" up={{ label: f.coreName, href: `${base}/${corePath(encodeURIComponent(f.coreId))}` }} title={shown.text} {name}>
				{#snippet tools()}
					<AskAiTool {anchor} title={shown.text} />
				{/snippet}
				<div id={anchorDomId(anchor)} data-evo-waits={waits(anchor)} class="flex scroll-mt-44 flex-col gap-2">
					{#if edits.editing === anchor}
						<InlineEditor {anchor} />
					{:else}
						<!-- Its comments and sources close its text, its cross and its check right after them (criterion 14a1164c). -->
						<HeadText {anchor} title={shown.text} values={shown} class="whitespace-pre-line">
							{#snippet text()}<StagedText {anchor} {read} field="desc" multiline label="Description" editable={editable(anchor)}>
									{#if shown.desc}<GlossaryText text={shown.desc} />{:else}<span class="text-ink-3">The specification does not say what this feature does yet.</span>{/if}
								</StagedText>{/snippet}
						</HeadText>
					{/if}
					<div class="flex flex-wrap items-center gap-1.5">
						<span class={CHIP}>{f.actions.length ? counted(f.actions.length, 'action') : 'No action yet'}</span>
						<span class={CHIP}>{counted(ruleCount, 'rule')}</span>
						<!-- Only the screens traced to a source: a screen none backs may have been written by an LLM (criterion c72a7e79). -->
						{#if data.sourcedScreens > 0}<span class={CHIP}>{counted(data.sourcedScreens, 'screen')}</span>{/if}
						<span class={CHIP} title={p.usedBy ? `Used by ${p.usedBy}` : undefined}>{profiles ? `Used by ${counted(profiles, 'profile')}` : 'Used by nobody yet'}</span>
						{#if p.origin}
							<span class={CHIP}>Created by&nbsp;<a href={p.origin.href} class="font-semibold text-blue-ink no-underline hover:underline">{p.origin.key}{p.origin.title ? `, ${p.origin.title}` : ''}</a></span>
						{:else if p.originLabel}
							<span class={CHIP}>{p.originLabel}</span>
						{/if}
					</div>
					<div class="empty:hidden"><BlockFoot {anchor} title={shown.text} /></div>
				</div>
			</PageHead>

			<div class="flex flex-col gap-6">
				<div class="empty:hidden">
					<FeatureValidation anchors={all} sectionId="kb-feature-{f.id}" />
				</div>

				<div id={anchorDomId(flow)} data-evo-waits={f.actions.length ? waits(flow) : undefined} class="scroll-mt-44">
					<SectionBox title="Actions" intro="What a person can do here, in order, and the rules each action obeys.">
						{#snippet actions()}
							{#if f.actions.length}
								<span role="group" aria-label="Review action journey" title="Review the ordered sequence of screens and actions." class="flex flex-wrap items-center gap-2">
									<span class="font-evo-mono text-[0.6875rem] text-ink-3">Action journey</span>
									<SpecControls anchor={flow} title="Action journey · {f.name}" />
								</span>
							{/if}
						{/snippet}
						{#if f.actions.length}
							<!-- The journeys diagram first, under the box's title; arranging it is saved at once and needs only the right to write (actions f3bbf419, 2d9a8378). -->
							{@const opened = f.actions.find((a) => a.id === picked)}
							{#key f.id}<ActionJourneys projectId={data.projectId} featureId={f.id} actions={f.actions} journeys={data.journeys ?? []} canArrange={validation.source.canWrite} {picked} onpick={(id) => (picked = picked === id ? null : id)} onsaved={(j) => (savedJourneys = j)} />{/key}
							<!-- The page's Edit mode, and a reader the diagram is not shown to, keep the whole list; else only the action clicked reads, nothing by itself. -->
							{#if wholeList}
								<ActionList featureId={f.id} actions={f.actions} actionData={data.actionData} />
							{:else if opened}
								<ActionList featureId={f.id} actions={[opened]} actionData={data.actionData} whole />
								<!-- What it touches, under its rules: only its own fields, no map (action 6f38e6ed). -->
								{@const own = data.actionData[opened.id]}
								{#if own}<div class="mt-4 pl-9"><ActionDataTouched data={own} fields={data.map?.data.fields ?? []} mapHref="{base}/tech/data-map" /></div>{/if}
							{:else}
								<p class="m-0 text-sm text-ink-3">Click an action to read it.</p>
							{/if}
							<div class="mt-3 empty:hidden"><BlockFoot anchor={flow} title="Actions · {f.name}" /></div>
						{:else}
							<p class="m-0 text-sm text-ink-3">No action yet: the behavior model declares none for this feature.</p>
						{/if}
						{#if addsActions}<AddButton label="Add an action" onclick={() => void edits.addAction(f.id)} />{/if}
					</SectionBox>
				</div>

				{#if data.findings.length}
					<SectionBox title="Points to review" intro="What Lyriks noticed on this feature. Open a point to read it; decide on it in Notices.">
						<FeaturePoints findings={data.findings} decideHref="{base}/noticed" />
					</SectionBox>
				{/if}

				<!-- The data map drawn on the tables it uses, read-only, what its actions touch marked: the map is validated and discussed on its own page (criterion c72a7e79). Reading from the diagram, each action shows its own data instead (criterion e3df122a). -->
				{#if wholeList}
				<SectionBox
					title="Data"
					intro={!data.tables.length
						? undefined
						: data.usedFields.length
							? `This feature reads or writes ${counted(data.usedFields.length, 'field')} in ${counted(data.tables.length, 'table')} of the data map, highlighted below.`
							: `This feature's states are kept in ${counted(data.tables.length, 'table')} of the data map.`}
				>
					{#snippet actions()}<a href="{base}/tech/data-map" class={LINK}>Whole data map<span aria-hidden="true">→</span></a>{/snippet}
					{#if data.map && data.tables.length}
						<SpecDataMap
							data={data.map.data}
							session={data.session}
							derivedVisibility={data.map.derivedVisibility}
							tablesByFeature={data.map.tablesByFeature}
							cores={data.map.cores}
							placements={data.map.placements}
							canMove={false}
							feature={{ id: f.id, name: f.name }}
							usedFields={data.usedFields}
						/>
					{:else}
						<p class="m-0 text-sm text-ink-3">No table is linked to this feature yet: none of its states carries a field of the data model.</p>
					{/if}
				</SectionBox>
				{/if}

				<!-- A feature read from the code can be read again by the reader's AI (ac-ai-session-reread). -->
				{#if readFromCode(anchor)}
					<div><RereadCode page="spec" {anchor} title={shown.text} featureId={f.id} /></div>
				{/if}
			</div>
		</div>
	{/key}
{/if}
