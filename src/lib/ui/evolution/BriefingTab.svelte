<script lang="ts" module>
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import type { DossierReading } from '$lib/server/evolution-view.server';

	/** The three sections of the Briefing and the need's questions each one holds, read by the step's note too. */
	export const BRIEFING_SECTIONS = [
		{ id: 'need-origin', number: '1.1', title: 'Request origin', keys: ['description'] },
		{ id: 'need-current', number: '1.2', title: 'Current situation', keys: ['situation', 'symptoms', 'cost'] },
		{ id: 'need-target', number: '1.3', title: 'Target situation', keys: ['objectives', 'measures'] }
	] as const;

	type NeedField = DossierReading['need']['fields'][number];
	/** What a section validates: its answers of the need, and in 1.1 who asked and where it comes from (ac-evo-form-origin-validated). */
	export function briefingSectionAnswers(dossier: DossierReading, section: (typeof BRIEFING_SECTIONS)[number]) {
		const answers = section.keys.map((key) => dossier.need.fields.find((f) => f.path === `00-need.${key}`)).filter((f): f is NeedField => !!f);
		return [...answers, ...(section.id === 'need-origin' ? dossier.originAnswers : [])];
	}
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { pushToast } from '$ui/design-system';
	import { ORIGIN_ANSWER_KEYS, REQUEST_ORIGINS, linesOf, owesAnswer, parseMeasure, personKey, placeElementId, prefillable } from '$domain/evolution';
	import type { ProposalRow } from '$lib/server/evolution-view.server';
	import SectionCard from './SectionCard.svelte';
	import EditedField from './EditedField.svelte';
	import SuggestionRows from './SuggestionRows.svelte';
	import StepValidateAll from './StepValidateAll.svelte';
	import { useEvolutionWrites } from './evolution-writes.svelte';
	import { patchKey, type Patch } from './dossier-overlay';
	import type { PageChanges } from './page-edit';
	import { mergeActs, sectionStanding, sectionValidation, suggestionValidation, takenByValidateAll } from './section-validation';
	import { STEP_FOOT_ID, bringNextToValidate, scrollToBlock } from './evo-scroll';
	import ArrivalNote from './ArrivalNote.svelte';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import { ADD_ROW, KICKER, ROW, ROW_DELETE, ROW_INPUT, TEXTAREA, primary48, FOOT_BAR } from './evo-look';

	/**
	 * The Briefing of the Evolution design, on the request's own answers: 1.1
	 * where the request comes from and the requester's words, 1.2 the current
	 * situation (the problem, the symptoms, what it costs), 1.3 the target
	 * situation (the objectives and the expected outcomes). Each section signs
	 * the answers it holds; the Need stands validated once all of them are, and
	 * "Validate all" at the foot signs every section still waiting on the reader.
	 * What is saved reads at once (ac-evo-form-edit-optimistic): a section saved
	 * shows its new text while it saves; one that fails opens again on what was typed.
	 */
	interface Version {
		readonly id: string;
		readonly value: string;
		readonly by: string;
		readonly at: string;
	}
	interface Props {
		projectId: string;
		dossier: DossierReading;
		proposals: readonly ProposalRow[];
		members: readonly { id: string; name: string; role?: string; jobs?: readonly string[] }[];
		actorId: string;
		canEdit: boolean;
		canValidate: boolean;
		canComment: boolean;
		lang: string;
		versionsOf: (path: string) => readonly Version[];
		nameOf: (id: string) => string;
		/** The section opened to edit, by its id, and how the page moves the editor on. */
		editing: string | null;
		onEdit: (id: string | null) => void;
		/** Whether the step opens its first section still owing an answer by itself: not on a page opened at an address. */
		openOwed: boolean;
		/** The first section of the next step, edited once the last one here is done. */
		nextStep: { readonly label: string; readonly go: () => void };
		onGoSolution: () => void;
	}
	let { projectId, dossier, proposals, members, actorId, canEdit, canValidate, canComment, lang, versionsOf, nameOf, editing, onEdit, openOwed, nextStep, onGoSolution }: Props = $props();
	const writes = useEvolutionWrites(untrack(() => projectId));

	const fieldOf = (key: string) => dossier.need.fields.find((f) => f.path === `00-need.${key}`);
	const answersOf = (keys: readonly string[]) => keys.map(fieldOf).filter((f): f is NeedField => !!f);
	const SECTIONS = BRIEFING_SECTIONS;
	const sectionAnswers = (s: (typeof SECTIONS)[number]) => briefingSectionAnswers(dossier, s);

	const same = (a: string, b: string) => personKey(a) === personKey(b);
	const mineOn = (answers: readonly { filled: boolean; trail?: { validation?: string; validatedBy?: readonly string[] } | null }[]) => {
		const filled = answers.filter((a) => a.filled);
		return filled.length > 0 && filled.every((a) => a.trail?.validation !== 'refused' && (a.trail?.validatedBy ?? []).some((id) => same(id, actorId)));
	};
	/** The step's call to action turns violet once the reader validated every section of the page. */
	const allMine = $derived(SECTIONS.every((s) => mineOn(sectionAnswers(s)) || !sectionAnswers(s).some((a) => a.filled)) && SECTIONS.some((s) => sectionAnswers(s).some((a) => a.filled)));

	/** The questions of the section a question belongs to, the ones a prefill covers (ac-evo-live-prefill). */
	const sectionPathsOf = (key: string) => (SECTIONS.find((s) => (s.keys as readonly string[]).includes(key))?.keys ?? []).map((k) => `00-need.${k}`).filter(prefillable);
	const proposalFor = (path: string) => proposals.find((p) => p.targetField === path && p.leafId === null) ?? null;
	/** Who asked and where it comes from, which the AI suggests in 1.1 like any answer (ac-evo-live-prefill). */
	const ORIGIN_PATHS = [ORIGIN_ANSWER_KEYS.requester, ORIGIN_ANSWER_KEYS.origin] as const;
	const originSuggestions = $derived(ORIGIN_PATHS.map(proposalFor).filter((p): p is ProposalRow => p !== null));
	const suggestionsOn = (section: (typeof SECTIONS)[number]) =>
		section.keys.filter((k) => proposalFor(`00-need.${k}`)).length + (section.id === 'need-origin' ? originSuggestions.length : 0);

	const originLabel = $derived(REQUEST_ORIGINS.find((o) => o.code === dossier.origin)?.label ?? null);
	const requester = $derived(dossier.requester && dossier.requester !== 'local-operator' ? nameOf(dossier.requester) : null);
	const quote = (text: string) => (lang === 'fr' ? `« ${text} »` : `“${text}”`);

	// What the open editor holds, keyed like the need, and the request's own fields.
	let drafts = $state<Record<string, string>>(untrack(() => Object.fromEntries(SECTIONS.flatMap((s) => s.keys).map((key) => [key, fieldOf(key)?.value ?? '']))));
	let draftRequester = $state(untrack(() => dossier.requester === 'local-operator' ? '' : (dossier.requester ?? '')));
	let draftOrigin = $state(untrack(() => dossier.origin ?? ''));
	let draftRows = $state<Record<string, string[]>>(untrack(() => ({ symptoms: linesOf(fieldOf('symptoms')?.value ?? '') })));
	let draftOutcomes = $state<{ what: string; today: string; target: string }[]>(untrack(() => linesOf(fieldOf('measures')?.value ?? '').map((line) => parseMeasure(line) ?? { what: line, today: '', target: '' })));
	const textOf = (key: string) => fieldOf(key)?.value ?? '';
	const outcomeLine = (o: { what: string; today: string; target: string }) =>
		o.today.trim() !== '' || o.target.trim() !== '' ? `${o.what.trim()}: ${o.today.trim()} → ${o.target.trim()}` : o.what.trim();
	/** What the editor holds for a question, as the text it would save. */
	function draftOf(key: string): string {
		if (key === 'symptoms') return (draftRows.symptoms ?? []).map((l) => l.trim()).filter(Boolean).join('\n');
		if (key === 'measures') return draftOutcomes.map(outcomeLine).filter(Boolean).join('\n');
		return drafts[key] ?? '';
	}
	/** Puts a value in the editor of a question, the way that question edits it. */
	function setDraft(key: string, value: string) {
		if (key === 'symptoms') draftRows = { ...draftRows, symptoms: linesOf(value) };
		else if (key === 'measures')
			draftOutcomes = linesOf(value)
				.map((line) => parseMeasure(line) ?? { what: line, today: '', target: '' })
				.map((m) => ({ what: m.what, today: m.today, target: m.target }));
		else drafts = { ...drafts, [key]: value };
	}

	/** A suggestion of the AI waits on a question of the section: it is decided where the section reads, not edited (ac-evo-form-edit-suggestion). */
	const suggestionsWait = (section: (typeof SECTIONS)[number]) => suggestionsOn(section) > 0;

	/** What was typed in a section whose save failed: its editor opens again on it, never on the saved text. */
	let kept = $state<{ id: string; values: Record<string, string>; requester: string; origin: string } | null>(null);
	// Capture the open editors once. A later AI suggestion must never hide typed
	// text or remove it from the page Save; the server still guards that save.
	let pageSections = $state<string[]>(untrack(() => editing === 'all' ? SECTIONS.filter((section) => !suggestionsWait(section)).map((section) => section.id) : []));
	// The editor fills from the answers as they stand each time a section opens, from here or from the page.
	let draftsOf = $state<string | null>(untrack(() => editing === 'all' || SECTIONS.some((s) => s.id === editing) ? editing : null));
	$effect(() => {
		const id = editing;
		untrack(() => {
			if (!id || (id !== 'all' && !SECTIONS.some((s) => s.id === id))) {
				draftsOf = null;
				pageSections = [];
				return;
			}
			if (draftsOf === id) return;
			const carried = id === 'all' ? SECTIONS.find((section) => section.id === draftsOf) : null;
			if (id === 'all') pageSections = SECTIONS.filter((section) => !suggestionsWait(section) || section.id === carried?.id).map((section) => section.id);
			const held = carried ? Object.fromEntries(carried.keys.map((key) => [key, draftOf(key)])) : {};
			const back = kept?.id === id ? kept : null;
			kept = null;
			if (carried?.id !== 'need-origin') {
				draftRequester = back?.requester ?? (dossier.requester === 'local-operator' ? '' : (dossier.requester ?? ''));
				draftOrigin = back?.origin ?? dossier.origin ?? '';
			}
			for (const key of SECTIONS.flatMap((s) => s.keys)) setDraft(key, held[key] ?? back?.values[key] ?? textOf(key));
			draftsOf = id;
		});
	});
	/** Opens a section in edit mode; one where suggestions of the AI wait is brought into view as it reads instead. */
	function open(id: string) {
		const section = SECTIONS.find((s) => s.id === id);
		if (!section || !suggestionsWait(section)) return onEdit(id);
		onEdit(null);
		void tick().then(() => scrollToBlock(id));
	}
	// The step opens on what is owed (189c4d88): its first section still owing an answer, with no suggestion of the AI
	// waiting, opens in edit mode, once, unless another is open.
	$effect(() =>
		untrack(() => {
			const owed = SECTIONS.find((s) => !suggestionsWait(s) && answersOf(s.keys).some(owesAnswer));
			if (owed && openOwed && canEdit && editing === null) open(owed.id);
		})
	);

	/** Writes what changed in the section, nothing else, read at once on the page; false once it failed, what was typed kept. */
	function changesOf(id: string): PageChanges {
		const sections = SECTIONS.filter((s) => id === 'all' ? pageSections.includes(s.id) : s.id === id);
		const need: Record<string, string> = {};
		const request: Record<string, string> = {};
		for (const key of sections.flatMap((s) => s.keys)) if (draftOf(key) !== textOf(key)) need[key] = draftOf(key);
		if (sections.some((s) => s.id === 'need-origin')) {
			if (draftRequester.trim() !== (dossier.requester === 'local-operator' ? '' : (dossier.requester ?? ''))) request.requester = draftRequester.trim();
			if (draftOrigin && draftOrigin !== (dossier.origin ?? '')) request.origin = draftOrigin;
		}
		const ops = [
			...(Object.keys(request).length > 0 ? [{ requestId: dossier.id, op: 'update_request', ...request }] : []),
			...(Object.keys(need).length > 0 ? [{ requestId: dossier.id, op: 'update_need', ...need }] : [])
		];
		const patches: Record<string, Patch> = {
			...Object.fromEntries(Object.entries(need).map(([key, value]) => [patchKey.text(`00-need.${key}`), { kind: 'text', value }] as const)),
			...(Object.keys(request).length > 0 ? { [patchKey.request]: { kind: 'request', ...request } } : {})
		};
		return { operations: ops, patches };
	}

	/** The header gathers every changed section without writing any of them early. */
	export function pageChanges(): PageChanges {
		return editing === 'all' && draftsOf === 'all' ? changesOf('all') : { operations: [], patches: {} };
	}

	async function save(id: string): Promise<boolean> {
		const section = SECTIONS.find((s) => s.id === id);
		const { operations, patches } = changesOf(id);
		if (operations.length === 0) return true;
		const need = Object.fromEntries((section?.keys ?? []).map((key) => [key, draftOf(key)]));
		const typed = { id, values: { ...need }, requester: draftRequester, origin: draftOrigin };
		if (await writes.send(patches, operations, `your edit of “${section?.title ?? 'the Briefing'}”`)) return true;
		kept = typed;
		return false;
	}
	/** An earlier version written again: the editor shows it at once, and what it held before if the save fails. */
	const restoreNeed = (key: string) => async (value: string) => {
		const before = draftOf(key);
		setDraft(key, value);
		if (editing === 'all') return true;
		const ok = await writes.send({ [patchKey.text(`00-need.${key}`)]: { kind: 'text', value } }, [{ requestId: dossier.id, op: 'update_need', [key]: value }], 'the restored version');
		if (!ok) setDraft(key, before);
		return ok;
	};

	/** The suggestions of the AI a section holds, every one of them, taken by Validate all or not. */
	const suggestionsIn = (section: (typeof SECTIONS)[number]): ProposalRow[] => [
		...section.keys.map((k) => proposalFor(`00-need.${k}`)).filter((p): p is ProposalRow => p !== null),
		...(section.id === 'need-origin' ? originSuggestions : [])
	];
	/**
	 * The sections still waiting on the reader, which "Validate all" signs in one save: a written answer
	 * they are not behind, or a suggestion of the AI it accepts as it stands (ac-evo-form-validate-each).
	 */
	const waitingSections = $derived(
		// Accepting a suggestion is a write: only who may edit the request takes them along.
		canValidate ? SECTIONS.filter((s) => sectionStanding(sectionAnswers(s), [], actorId).waits || (canEdit && suggestionsIn(s).some(takenByValidateAll))) : []
	);
	const takenSuggestions = $derived(canEdit ? waitingSections.flatMap((s) => suggestionsIn(s).filter(takenByValidateAll)) : []);
	/** Suggestions Validate all leaves waiting: one that still asks a question, or that cannot be accepted as it stands. */
	const leftSuggestions = $derived(SECTIONS.flatMap((s) => suggestionsIn(s)).filter((p) => !takenByValidateAll(p)).length);
	const validateAllNote = $derived(
		[
			takenSuggestions.length > 0 ? `accepting the ${takenSuggestions.length === 1 ? 'suggestion' : `${takenSuggestions.length} suggestions`} of Lyriks ${takenSuggestions.length === 1 ? 'it holds' : 'they hold'}` : '',
			leftSuggestions > 0 ? `${leftSuggestions} ${leftSuggestions === 1 ? 'suggestion waits' : 'suggestions wait'} on you to answer its question or to decide it` : ''
		]
			.filter(Boolean)
			.join('; ')
	);
	async function validateStep() {
		const act = mergeActs([
			...waitingSections.map((s) => sectionValidation(sectionAnswers(s), [], actorId)),
			suggestionValidation(takenSuggestions)
		]);
		if (act.operations.length === 0) return;
		const count = waitingSections.length;
		const sent = writes.send(act.patches, act.operations.map((op) => ({ requestId: dossier.id, ...op })), 'your validation of the Briefing');
		// Nothing of the step waits on the reader any more: on to the step's call to action, which pulses (ac-evo-form-validate-next).
		bringNextToValidate(STEP_FOOT_ID);
		if (await sent) pushToast({ level: 'success', message: `You validated the Briefing: ${count} ${count === 1 ? 'section' : 'sections'}` });
	}

	/** Each section names the one edited after it, the last one the first of the Solution. */
	const nextOf = (at: number) => {
		const following = SECTIONS[at + 1];
		return following ? { label: following.title, go: () => open(following.id) } : nextStep;
	};
	/** Each answer is a place a link opens on (ac-evo-live-guide). */
	const placeOf = (key: string) => placeElementId({ kind: 'field', leafId: null, path: `00-need.${key}` });
	const PLACE = 'flex scroll-mt-36 flex-col gap-4';
	const placeholder = (key: string) => (canEdit ? 'Not written yet: edit the section to write it.' : 'Not answered');
</script>

{#snippet blank(key: string)}
	<!-- An empty answer with a suggestion under it says nothing: the suggestion is what to decide, the pencil waits for it. -->
	{#if !proposalFor(`00-need.${key}`)}<p class="-mt-2 text-[0.8125rem] italic text-ink-3">{placeholder(key)}</p>{/if}
{/snippet}

{#snippet suggestion(key: string, kind: 'text' | 'list')}
	{@const proposal = proposalFor(`00-need.${key}`)}
	<!-- What a link to a suggestion decided since says, beside the answer it was on (ac-leaf-6709493f). -->
	<ArrivalNote anchor={placeOf(key)} />
	{#if proposal}<SuggestionRows {projectId} requestId={dossier.id} {proposal} {kind} canDecide={canEdit} section={sectionPathsOf(key)} current={textOf(key)} />{/if}
{/snippet}

{#snippet originRead()}
	{@const description = fieldOf('description')}
	<div class="flex flex-col gap-4">
		<ArrivalNote anchor="need-origin" />
		<div class="flex flex-wrap gap-3">
			<div class="flex flex-[1_1_200px] flex-col gap-1 rounded-evo-btn bg-toner-1 px-3.5 py-3">
				<span class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Requester</span>
				<span class="font-bold">{requester ?? 'Not said'}</span>
			</div>
			<div class="flex flex-[1_1_200px] flex-col gap-1 rounded-evo-btn bg-toner-1 px-3.5 py-3">
				<span class="font-evo-mono text-xs tracking-[0.06em] text-ink-3 uppercase">Source</span>
				<span class="font-bold">{originLabel ?? 'Not set'}</span>
			</div>
		</div>
		{#each originSuggestions as proposal (proposal.id)}
			{@const isSource = proposal.targetField === ORIGIN_ANSWER_KEYS.origin}
			<!-- A suggestion on who asked or where it comes from, shown as the page names it (ac-evo-live-prefill). -->
			<div class={PLACE}>
				<span class={KICKER}>{isSource ? 'Source' : 'Requester'}</span>
				<SuggestionRows
					{projectId}
					requestId={dossier.id}
					proposal={isSource ? { ...proposal, value: REQUEST_ORIGINS.find((o) => o.code === proposal.value)?.label ?? proposal.value } : proposal}
					kind="text"
					canDecide={canEdit}
					section={ORIGIN_PATHS}
				/>
			</div>
		{/each}
		<div id={placeOf('description')} class={PLACE}>
			<span class={KICKER}>Verbatim</span>
			{#if description?.filled}
				<p class="-mt-2 whitespace-pre-line border-l-[3px] border-ink pl-3.5 leading-relaxed text-evo-ink-2">
					<GlossaryText text={quote(description.value)} /><br /><span class="font-evo-mono text-xs text-evo-muted">{[requester, originLabel].filter(Boolean).join(', ')}</span>
				</p>
			{:else}{@render blank('description')}{/if}
			{@render suggestion('description', 'text')}
		</div>
	</div>
{/snippet}

{#snippet originEdit()}
	<div class="flex flex-col gap-2">
		<div class={ROW}>
			<span class="{ROW_INPUT} flex flex-[0_1_200px] items-center font-bold">Requester</span>
			<input class="{ROW_INPUT} flex-[1_1_260px]" aria-label="Requester" placeholder="Who asked for it?" bind:value={draftRequester} />
		</div>
		<div class={ROW}>
			<span class="{ROW_INPUT} flex flex-[0_1_200px] items-center font-bold">Source</span>
			<select class="{ROW_INPUT} flex-[1_1_260px]" aria-label="Source" bind:value={draftOrigin}>
				<option value="" disabled>Where does it come from?</option>
				{#each REQUEST_ORIGINS as origin (origin.code)}<option value={origin.code}>{origin.label}</option>{/each}
			</select>
		</div>
	</div>
	<EditedField label="Requester’s verbatim" for="need-verbatim" versions={versionsOf('00-need.description')} {nameOf} onrestore={canEdit ? restoreNeed('description') : null}>
		<textarea id="need-verbatim" rows="3" class={TEXTAREA} bind:value={drafts.description}></textarea>
	</EditedField>
{/snippet}

{#snippet currentRead()}
	{@const situation = fieldOf('situation')}
	{@const symptoms = fieldOf('symptoms')}
	{@const cost = fieldOf('cost')}
	<div class="flex flex-col gap-4">
		<div id={placeOf('situation')} class={PLACE}>
			<span class={KICKER}>Problem</span>
			{#if situation?.filled}<p class="-mt-2 whitespace-pre-line leading-relaxed"><GlossaryText text={situation.value} /></p>{:else}{@render blank('situation')}{/if}
			{@render suggestion('situation', 'text')}
		</div>
		<div id={placeOf('symptoms')} class={PLACE}>
			<span class={KICKER}>Observed symptoms</span>
			{#if symptoms?.filled}
				<div class="flex flex-col gap-2">
					{#each linesOf(symptoms.value) as line, at (at)}
						<div class="flex flex-wrap items-center gap-3 rounded-lg bg-red-tint px-3.5 py-2.5">
							<span class="size-2.5 flex-none bg-red"></span>
							<span class="flex-[1_1_280px]"><GlossaryText text={line} /></span>
						</div>
					{/each}
				</div>
			{:else}{@render blank('symptoms')}{/if}
			{@render suggestion('symptoms', 'list')}
		</div>
		{#if cost?.filled || proposalFor('00-need.cost')}
			<div id={placeOf('cost')} class={PLACE}>
				<span class={KICKER}>What it costs</span>
				{#if cost?.filled}<p class="-mt-2 whitespace-pre-line leading-relaxed"><GlossaryText text={cost.value} /></p>{/if}
				{@render suggestion('cost', 'text')}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet currentEdit()}
	<EditedField label="Problem" for="need-problem" versions={versionsOf('00-need.situation')} {nameOf} onrestore={canEdit ? restoreNeed('situation') : null}>
		<textarea id="need-problem" rows="2" class={TEXTAREA} bind:value={drafts.situation}></textarea>
	</EditedField>
	<EditedField label="Observed symptoms" versions={versionsOf('00-need.symptoms')} {nameOf} onrestore={canEdit ? restoreNeed('symptoms') : null}>
		<div class="flex flex-col gap-2">
			{#each draftRows.symptoms as _, at (at)}
				<div class={ROW}>
					<input class="{ROW_INPUT} flex-[1_1_300px]" aria-label="Symptom" placeholder="Describe the symptom" bind:value={draftRows.symptoms[at]} />
					<button type="button" class={ROW_DELETE} aria-label="Delete" onclick={() => (draftRows.symptoms = draftRows.symptoms.filter((_, i) => i !== at))}>×</button>
				</div>
			{/each}
		</div>
	</EditedField>
	<button type="button" class={ADD_ROW} onclick={() => (draftRows.symptoms = [...draftRows.symptoms, ''])}>+ Add a symptom</button>
	<EditedField label="What it costs" for="need-cost" versions={versionsOf('00-need.cost')} {nameOf} onrestore={canEdit ? restoreNeed('cost') : null}>
		<textarea id="need-cost" rows="2" class={TEXTAREA} bind:value={drafts.cost}></textarea>
	</EditedField>
{/snippet}

{#snippet targetRead()}
	{@const objectives = fieldOf('objectives')}
	{@const measures = fieldOf('measures')}
	<div class="flex flex-col gap-4">
		<div id={placeOf('objectives')} class={PLACE}>
			<span class={KICKER}>Target</span>
			{#if objectives?.filled}<p class="-mt-2 whitespace-pre-line leading-relaxed"><GlossaryText text={objectives.value} /></p>{:else}{@render blank('objectives')}{/if}
			{@render suggestion('objectives', 'list')}
		</div>
		<div id={placeOf('measures')} class={PLACE}>
			<span class={KICKER}>Expected outcomes</span>
			{#if measures?.filled}
				<div class="flex flex-col gap-2">
					{#each linesOf(measures.value) as line, at (at)}
						{@const m = parseMeasure(line)}
						<div class="flex flex-wrap items-center gap-3 rounded-lg bg-green-tint px-3.5 py-2.5">
							<span class="size-2.5 flex-none bg-green"></span>
							<span class="flex-[1_1_280px]"><GlossaryText text={m?.what ?? line} /></span>
							{#if m}
								<span class="flex items-baseline gap-2 text-[0.8125rem]">
									<span class="text-red-ink line-through">{m.today}</span>
									<span aria-hidden="true" class="text-ink-3">→</span>
									<span class="font-bold text-green-ink">{m.target}</span>
								</span>
							{/if}
						</div>
					{/each}
				</div>
			{:else}{@render blank('measures')}{/if}
			{@render suggestion('measures', 'list')}
		</div>
	</div>
{/snippet}

{#snippet targetEdit()}
	<EditedField label="Target situation in one sentence" for="need-target" versions={versionsOf('00-need.objectives')} {nameOf} onrestore={canEdit ? restoreNeed('objectives') : null}>
		<textarea id="need-target" rows="2" class={TEXTAREA} bind:value={drafts.objectives}></textarea>
	</EditedField>
	<EditedField label="Expected outcomes" versions={versionsOf('00-need.measures')} {nameOf} onrestore={canEdit ? restoreNeed('measures') : null}>
		<div class="flex flex-col gap-2">
			{#each draftOutcomes as _, at (at)}
				<div class={ROW}>
					<input class="{ROW_INPUT} flex-[1_1_240px] font-semibold" aria-label="Indicator" placeholder="Indicator" bind:value={draftOutcomes[at].what} />
					<input class="{ROW_INPUT} flex-[0_1_150px]" aria-label="Current value" placeholder="Today" bind:value={draftOutcomes[at].today} />
					<span aria-hidden="true" class="text-ink-3">→</span>
					<input class="{ROW_INPUT} flex-[0_1_150px] font-bold" aria-label="Target value" placeholder="Target" bind:value={draftOutcomes[at].target} />
					<button type="button" class={ROW_DELETE} aria-label="Delete" onclick={() => (draftOutcomes = draftOutcomes.filter((_, i) => i !== at))}>×</button>
				</div>
			{/each}
		</div>
	</EditedField>
	<button type="button" class={ADD_ROW} onclick={() => (draftOutcomes = [...draftOutcomes, { what: '', today: '', target: '' }])}>+ Add an expected outcome</button>
{/snippet}

{#each SECTIONS as section, at (section.id)}
	<SectionCard
		{projectId}
		requestId={dossier.id}
		domId={section.id}
		number={section.number}
		title={section.title}
		answers={sectionAnswers(section)}
		{members}
		{actorId}
		{canEdit}
		{canValidate}
		{canComment}
		suggestions={suggestionsOn(section)}
		editBlocked={suggestionsWait(section) ? "Accept or reject the suggestions of Lyriks first" : null}
		editing={editing === section.id || (editing === 'all' && pageSections.includes(section.id))}
		pageEditing={editing === 'all'}
		onEdit={(on) => (on ? open(section.id) : onEdit(null))}
		onSave={() => save(section.id)}
		next={canEdit ? nextOf(at) : null}
		read={section.id === 'need-origin' ? originRead : section.id === 'need-current' ? currentRead : targetRead}
		edit={section.id === 'need-origin' ? originEdit : section.id === 'need-current' ? currentEdit : targetEdit}
	/>
{/each}

<PageFoot id={STEP_FOOT_ID} class={FOOT_BAR}>
	<StepValidateAll step="Briefing" parts={[{ count: waitingSections.length, one: 'section' }]} note={validateAllNote} onclick={() => void validateStep()} />
	<button type="button" class={primary48(allMine)} onclick={onGoSolution}>Go to Solution →</button>
</PageFoot>
