<script lang="ts" module>
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import type { DossierFieldRow } from '$lib/server/evolution-view.server';

	/** One text of a step of prose the Solution reads as requirements: its step, its question, and the answer as it stands. */
	export interface ProseQuestion {
		readonly step: 'solution' | 'functional_spec' | 'technical_spec';
		/** `description`, or the key of the question the step asks after it. */
		readonly key: string;
		readonly label: string;
		readonly field: DossierFieldRow;
	}

	/** The two sections of the Solution, read by the step's note too. */
	export const SOLUTION_SECTIONS = [
		{ id: 'sol-functional', number: '2.1', title: 'Functional requirements' },
		{ id: 'sol-technical', number: '2.2', title: 'Technical requirements' }
	] as const;
</script>

<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { pushToast } from '$ui/design-system';
	import { isOwedBeforeImpact, personKey, placeElementId, pointsOf, textOfPoints, type StepReading } from '$domain/evolution';
	import SectionCard, { type SectionStep } from './SectionCard.svelte';
	import EditedField from './EditedField.svelte';
	import RequirementSuggestions from './RequirementSuggestions.svelte';
	import MentionText from './MentionText.svelte';
	import StepValidateAll from './StepValidateAll.svelte';
	import { useEvolutionWrites } from './evolution-writes.svelte';
	import { patchKey, type Patch } from './dossier-overlay';
	import type { PageChanges } from './page-edit';
	import { mergeActs, sectionStanding, sectionValidation } from './section-validation';
	import { sectionAnswersWithDrawing } from './section-drawing';
	import { ADD_ROW, FOOT_BAR, ROW, ROW_DELETE, ROW_INPUT, primary48 } from './evo-look';
	import { STEP_FOOT_ID, bringNextToValidate } from './evo-scroll';
	import { requirementKindOf, requirementLanguage } from './requirement-kinds';
	import { firstOwingSection, optionalUnwritten } from './solution-owed';

	/**
	 * The Solution of the Evolution design: 2.1 the functional requirements and
	 * 2.2 the technical ones, one numbered line each, read off the texts of the
	 * Solution, the Functional and the Technical spec (one line per statement).
	 * The chip of a line names the question it answers; editing, it is what moves
	 * a line from one question to another. Each section offers its drawing among
	 * its own controls, in place of its list: 2.1 the use case diagram, 2.2 the
	 * technical diagram (ac-evo-sol-diagram-alone); the list and the drawing are
	 * two readings of one section, so its Validate signs both. "Validate all" at the foot signs both sections at once. What is saved reads
	 * at once (ac-evo-form-edit-optimistic); a section whose save fails opens
	 * again on the lines that were typed.
	 */
	interface Version {
		readonly id: string;
		readonly value: string;
		readonly by: string;
		readonly at: string;
	}
	interface Props {
		projectId: string;
		requestId: string;
		functional: readonly ProseQuestion[];
		technical: readonly ProseQuestion[];
		/** The steps validated as a whole along with their answers. */
		stepOf: (step: 'functional_spec' | 'technical_spec') => StepReading;
		members: readonly { id: string; name: string; role?: string; jobs?: readonly string[] }[];
		actorId: string;
		canEdit: boolean;
		canValidate: boolean;
		canComment: boolean;
		lang: string;
		mentionLinks: Readonly<Record<string, { readonly href: string | null }>>;
		versionsOf: (path: string) => readonly Version[];
		nameOf: (id: string) => string;
		editing: string | null;
		onEdit: (id: string | null) => void;
		/** Whether the step opens its first section still owing an answer by itself: not on a page opened at an address. */
		openOwed: boolean;
		/** Whether a section shows its drawing in place of its list, kept for the visit. */
		diagramShown: (sectionId: string) => boolean;
		onDiagram: (sectionId: string, shown: boolean) => void;
		/** The Functional spec's diagram, drawn and edited by the app's own UML editor. */
		useCaseDiagram: Snippet;
		/** The Technical spec's diagram, when the step has one. */
		technicalDiagram?: Snippet | null;
		/** Each section's diagram as an answer, validated with its requirements (ac-evo-sol-diagram-alone); null where the step draws none. */
		drawings?: { readonly functional_spec: DossierFieldRow | null; readonly technical_spec: DossierFieldRow | null };
		/**
		 * Why a step's section cannot be validated as it stands, its texts and its
		 * diagram not in step (ac-evo-func-uml-sync, ac-evo-tech-uml-sync), or null:
		 * the platform would refuse it, so it is never sent (criterion 8fa75115).
		 */
		outOfStep?: (step: 'functional_spec' | 'technical_spec') => string | null;
		onGoSpecification: () => void;
	}
	let {
		projectId,
		requestId,
		functional,
		technical,
		stepOf,
		members,
		actorId,
		canEdit,
		canValidate,
		canComment,
		lang,
		mentionLinks,
		versionsOf,
		nameOf,
		editing,
		onEdit,
		openOwed,
		diagramShown,
		onDiagram,
		useCaseDiagram,
		technicalDiagram = null,
		drawings = { functional_spec: null, technical_spec: null },
		outOfStep = () => null,
		onGoSpecification
	}: Props = $props();
	const writes = useEvolutionWrites(untrack(() => projectId));

	/** What each question is called on the chip of its lines, in the spec's language (ac-evo-sol-diagram-alone). */
	const chipOf = (q: ProseQuestion) => requirementKindOf(requirementLanguage(lang), q.step, q.key) ?? q.label;

	const SECTIONS = $derived([
		{ ...SOLUTION_SECTIONS[0], code: 'FR', questions: functional, step: 'functional_spec' as const, add: '+ Add a requirement', placeholder: 'Describe the requirement' },
		{ ...SOLUTION_SECTIONS[1], code: 'TR', questions: technical, step: 'technical_spec' as const, add: '+ Add a technical requirement', placeholder: 'Describe the technical requirement' }
	]);
	type Section = (typeof SECTIONS)[number];

	/** What one validation of a section covers: its requirements and its diagram, two readings of one section (ac-evo-sol-diagram-alone). */
	const answersOf = (s: Section) => sectionAnswersWithDrawing(s.questions.map((q) => q.field), drawings[s.step]);

	/** The lines of a section, numbered across its questions. */
	const linesOf = (s: Section) => s.questions.flatMap((q, qi) => pointsOf(q.field.value).map((text) => ({ qi, text })));
	const stepsOf = (s: Section): SectionStep[] => {
		const r = stepOf(s.step);
		return r.skip || !r.validation ? [] : [{ step: s.step, validatedBy: r.validation.given, validated: r.validation.validated }];
	};
	const same = (a: string, b: string) => personKey(a) === personKey(b);
	const mineOn = (s: Section) => {
		const filled = answersOf(s).filter((f) => f.filled);
		return (
			filled.length > 0 &&
			filled.every((f) => f.trail?.validation !== 'refused' && (f.trail?.validatedBy ?? []).some((id) => same(id, actorId))) &&
			stepsOf(s).every((st) => st.validatedBy.some((id) => same(id, actorId)))
		);
	};
	const allMine = $derived(SECTIONS.every((s) => mineOn(s) || linesOf(s).length === 0) && SECTIONS.some((s) => linesOf(s).length > 0));

	interface RequirementRow { readonly id: number; qi: number; text: string }
	interface SectionEditor { rows: RequirementRow[]; filledLines: Record<number, string> }
	let nextRowId = 0;
	const rowOf = (qi: number, text: string): RequirementRow => ({ id: nextRowId++, qi, text });
	const editorOf = (s: Section): SectionEditor => ({
		rows: linesOf(s).map((line) => rowOf(line.qi, line.text)),
		filledLines: Object.fromEntries(s.questions.map((q, qi) => [qi, textOfPoints(pointsOf(q.field.value))]))
	});
	const editingSections = (id: string | null) => SECTIONS.filter((s) => id === 'all' || s.id === id);
	// A page edit holds both sections independently; a row's identity survives a deletion before it.
	let editors = $state<Record<string, SectionEditor>>(untrack(() =>
		Object.fromEntries(editingSections(editing).map((s) => [s.id, editorOf(s)]))));
	let kept = $state<Record<string, SectionEditor>>({});
	const editedText = (editor: SectionEditor, qi: number) => textOfPoints(editor.rows.filter((r) => r.qi === qi).map((r) => r.text));
	function replaceQuestion(editor: SectionEditor, qi: number, value: string): void {
		const prior = editor.rows.filter((r) => r.qi === qi);
		const fresh = pointsOf(value).map((text, at) => ({ id: prior[at]?.id ?? nextRowId++, qi, text }));
		const others = editor.rows.filter((r) => r.qi !== qi);
		const first = editor.rows.findIndex((r) => r.qi === qi);
		const at = first >= 0 ? first : others.findIndex((r) => r.qi > qi);
		editor.rows = at < 0 ? [...others, ...fresh] : [...others.slice(0, at), ...fresh, ...others.slice(at)];
	}
	$effect(() => {
		const id = editing;
		untrack(() => {
			editors = Object.fromEntries(editingSections(id).map((s) => [s.id, editors[s.id] ?? kept[s.id] ?? editorOf(s)]));
			kept = {};
		});
	});
	// Incoming suggestions fill untouched questions while typed changes remain in their own section.
	$effect(() => {
		for (const s of editingSections(editing)) {
			s.questions.forEach((q, qi) => {
				const saved = textOfPoints(pointsOf(q.field.value));
				untrack(() => {
					const editor = editors[s.id];
					if (!editor || saved === editor.filledLines[qi] || editedText(editor, qi) !== editor.filledLines[qi]) return;
					replaceQuestion(editor, qi, q.field.value);
					editor.filledLines = { ...editor.filledLines, [qi]: saved };
				});
			});
		}
	});
	const open = (id: string) => onEdit(id);
	// The step opens on what is owed (189c4d88): its first section still owing an answer opens in edit mode, once, unless another is open.
	// Only the Solution's description is owed there; what the tab offers opens no editor by itself (EVO-013, criterion 0a4d6036).
	$effect(() =>
		untrack(() => {
			const owed = firstOwingSection(SECTIONS);
			if (owed && openOwed && canEdit && editing === null) open(owed.id);
		})
	);
	/** The operation that writes one text of a step of prose, and what the page reads of it at once. */
	const writeOf = (q: ProseQuestion, value: string) => ({
		op: q.key === 'description' ? { requestId, op: 'update_step_description', step: q.step, description: value } : { requestId, op: 'answer_step', step: q.step, question: q.key, answer: value },
		patch: [patchKey.text(q.field.path), { kind: 'text', value } as Patch] as const
	});
	const changesOf = (s: Section) => {
		const editor = editors[s.id];
		return editor ? s.questions.flatMap((q, qi) => {
			const after = editedText(editor, qi);
			return after === textOfPoints(pointsOf(q.field.value)) ? [] : [writeOf(q, after)];
		}) : [];
	};
	/** Every held text of the page, collected for the header's single atomic save. */
	export function pageChanges(): PageChanges {
		const changes = SECTIONS.flatMap(changesOf);
		return { operations: changes.map((w) => w.op), patches: Object.fromEntries(changes.map((w) => w.patch)) };
	}
	/** A section's own save retains the exact typed rows if persistence fails. */
	async function save(s: Section): Promise<boolean> {
		const changed = changesOf(s);
		const editor = editors[s.id];
		if (!editor || changed.length === 0) return true;
		const typed = { rows: editor.rows.map((r) => ({ ...r })), filledLines: { ...editor.filledLines } };
		if (await writes.send(Object.fromEntries(changed.map((w) => w.patch)), changed.map((w) => w.op), `your edit of “${s.title}”`)) return true;
		kept = { ...kept, [s.id]: typed };
		return false;
	}
	/** An earlier version written again, read at once; the lines of the editor follow it as a version written meanwhile does. */
	const restoreOf = (q: ProseQuestion) => (value: string) => {
		if (editing === 'all') {
			const section = SECTIONS.find((s) => s.questions.some((question) => question.field.path === q.field.path));
			const editor = section && editors[section.id];
			if (!section || !editor) return Promise.resolve(false);
			replaceQuestion(editor, section.questions.findIndex((question) => question.field.path === q.field.path), value);
			return Promise.resolve(true);
		}
		const w = writeOf(q, value);
		return writes.send(Object.fromEntries([w.patch]), [w.op], 'the restored version');
	};

	const waitsOnReader = (s: Section) => s.questions.length > 0 && sectionStanding(answersOf(s), stepsOf(s), actorId).waits;
	/**
	 * The sections still waiting on the reader's validation, which "Validate all" signs in one save; one whose texts
	 * and diagram are not in step waits apart, never sent to bring the whole save down (criterion 8fa75115).
	 */
	const waitingSections = $derived(canValidate ? SECTIONS.filter((s) => waitsOnReader(s) && !outOfStep(s.step)) : []);
	const heldSections = $derived(canValidate ? SECTIONS.filter((s) => waitsOnReader(s) && !!outOfStep(s.step)) : []);
	const validateAllNote = $derived(
		heldSections.length === 0
			? ''
			: `while ${heldSections.map((s) => `${s.number} ${s.title}`).join(' and ')} ${heldSections.length === 1 ? 'waits until its diagram and its texts say' : 'wait until their diagrams and their texts say'} the same`
	);
	async function validateStep() {
		const act = mergeActs(waitingSections.map((s) => sectionValidation(answersOf(s), stepsOf(s), actorId)));
		if (act.operations.length === 0) return;
		const count = waitingSections.length;
		const sent = writes.send(act.patches, act.operations.map((op) => ({ requestId, ...op })), 'your validation of the Solution');
		// Nothing of the step waits on the reader any more: on to the step's call to action, which pulses (ac-evo-form-validate-next).
		bringNextToValidate(STEP_FOOT_ID);
		if (await sent) pushToast({ level: 'success', message: `You validated the Solution: ${count} ${count === 1 ? 'section' : 'sections'}` });
	}
	const nextOf = (at: number) => {
		const following = SECTIONS[at + 1];
		return following ? { label: following.title, go: () => open(following.id) } : { label: 'Specification', text: 'Finish and switch to Lyriks structure →', go: onGoSpecification };
	};
</script>

{#snippet sectionRead(s: Section)}
	{@const lines = linesOf(s)}
	<!-- What the tab offers and nobody wrote reads Optional, never owed (EVO-013, criterion 0a4d6036). -->
	{@const offered = optionalUnwritten(
		[...s.questions.map((q) => ({ step: q.step, key: q.key, filled: q.field.filled })), ...(drawings[s.step] ? [{ step: s.step, key: 'diagram', filled: drawings[s.step]?.filled ?? false }] : [])],
		requirementKindOf(requirementLanguage(lang), 'solution', 'examples') ?? 'Example'
	)}
	{#if lines.length === 0 && s.questions.some((q) => isOwedBeforeImpact(q.field.path))}
		<p class="text-[0.8125rem] italic text-ink-3">{canEdit ? 'Nothing written yet: edit the section to write it.' : 'Not answered'}</p>
	{:else if lines.length > 0}
		<div class="flex flex-col gap-1.5">
			{#each lines as line, at (at)}
				<!-- The first line of an answer is where a link opens on it (ac-evo-live-guide). -->
				{@const first = lines.findIndex((l) => l.qi === line.qi) === at}
				<div id={first ? placeElementId({ kind: 'field', leafId: null, path: s.questions[line.qi].field.path }) : undefined} class="flex scroll-mt-36 flex-wrap items-center gap-3 rounded-lg px-2.5 py-2">
					<span class="w-11 font-evo-mono text-xs text-evo-muted">{s.code}-{at + 1}</span>
					<span class="flex flex-[0_0_120px]"><span class="whitespace-nowrap bg-toner-2 px-2.5 py-[3px] font-evo-mono text-xs font-bold tracking-[0.06em] text-ink-2 uppercase">{chipOf(s.questions[line.qi])}</span></span>
					<span class="min-w-0 flex-[1_1_360px]"><MentionText text={line.text} links={mentionLinks} /></span>
				</div>
			{/each}
		</div>
	{/if}
	{#if offered.length > 0}
		<p class="flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-3" data-optional>
			<span class="bg-toner-2 px-2 py-[2px] font-evo-mono text-xs font-bold tracking-[0.06em] text-ink-2 uppercase">Optional</span>
			<span>{offered.join(' · ')}{canEdit ? `: write ${offered.length === 1 ? 'it' : 'them'} when the change needs ${offered.length === 1 ? 'it' : 'them'}, or let your AI prefill ${offered.length === 1 ? 'it' : 'them'}.` : ': not written.'}</span>
		</p>
	{/if}
	<RequirementSuggestions {projectId} {requestId} {members} {canEdit} {lang} {mentionLinks}
		fields={SECTIONS.flatMap((section) => section.questions.map((q) => q.field))}
		paths={s.questions.map((q) => q.field.path)} />
{/snippet}

{#snippet sectionEdit(s: Section)}
	<!-- Each section retains its own rows while the whole page is edited (criterion 4477db19). -->
	{@const editor = editors[s.id]}
	<div class="flex flex-col gap-2">
		{#each editor?.rows ?? [] as requirement, at (requirement.id)}
			{@const q = s.questions[requirement.qi]}
			<EditedField label={q.label} versions={versionsOf(q.field.path)} {nameOf} onrestore={canEdit ? restoreOf(q) : null}>
				{#snippet row(history)}
					<div class={ROW}>
						<span class="w-11 font-evo-mono text-xs text-evo-muted">{s.code}-{at + 1}</span>
						<select class="{ROW_INPUT} flex-[0_1_160px] px-3 text-[0.8125rem] font-semibold text-evo-ink-3" aria-label="Question" bind:value={requirement.qi}>
							{#each s.questions as option, oi (`${option.step}.${option.key}`)}<option value={oi}>{chipOf(option)}</option>{/each}
						</select>
						<input class="{ROW_INPUT} flex-[1_1_320px]" aria-label={s.title} placeholder={s.placeholder} bind:value={requirement.text} />
						{@render history()}
						<button type="button" class={ROW_DELETE} aria-label="Delete" onclick={() => { if (editor) editor.rows = editor.rows.filter((r) => r.id !== requirement.id); }}>×</button>
					</div>
				{/snippet}
			</EditedField>
		{/each}
	</div>
	{#if editor}<button type="button" class={ADD_ROW} onclick={() => (editor.rows = [...editor.rows, rowOf(editor.rows.at(-1)?.qi ?? 0, '')])}>{s.add}</button>{/if}
{/snippet}

{#each SECTIONS as s, at (s.id)}
	{#if s.questions.length > 0}
		{@const drawing = s.id === 'sol-functional' ? useCaseDiagram : technicalDiagram}
		<SectionCard
			{projectId}
			{requestId}
			domId={s.id}
			number={s.number}
			title={s.title}
			answers={answersOf(s)}
			steps={stepsOf(s)}
			{members}
			{actorId}
			{canEdit}
			{canValidate}
			{canComment}
			editing={editing === 'all' || editing === s.id}
			pageEditing={editing === 'all'}
			onEdit={(on) => (on ? open(s.id) : onEdit(null))}
			onSave={() => save(s)}
			next={canEdit ? nextOf(at) : null}
			validateBlocked={outOfStep(s.step)}
			diagram={drawing}
			view={drawing
				? {
						diagram: diagramShown(s.id),
						toggle: () => onDiagram(s.id, !diagramShown(s.id))
					}
				: null}
		>
			{#snippet read()}{@render sectionRead(s)}{/snippet}
			{#snippet edit()}{@render sectionEdit(s)}{/snippet}
		</SectionCard>
	{/if}
{/each}

<PageFoot id={STEP_FOOT_ID} class={FOOT_BAR}>
	<StepValidateAll step="Solution" parts={[{ count: waitingSections.length, one: 'section' }]} note={validateAllNote} onclick={() => void validateStep()} />
	<button type="button" class={primary48(allMine)} onclick={onGoSpecification}>Go to Specification section →</button>
</PageFoot>
