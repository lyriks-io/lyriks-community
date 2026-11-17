<script lang="ts">
	import { scrollMotion } from '$ui/shell/scroll-motion';
	import Gauge from '$ui/design-system/Gauge.svelte';
	import { slantedOutline } from '$ui/design-system/gauge';
	import { tick, untrack, type Snippet } from 'svelte';
	import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation';
	import ArrivalNote from './ArrivalNote.svelte';
	import { Arrival, decidedNote, goneSuggestionNote, provideArrival } from './arrival.svelte';
	import { Button, Icon, confirmDialog, pushToast } from '$ui/design-system';
	import DevelopmentBoard from './DevelopmentBoard.svelte';
	import FinalReport from './FinalReport.svelte';
	import DecisionLog from './DecisionLog.svelte';
	import type { ClosingReading } from '$lib/server/evolution-closing.server';
	import EvolutionAiTool from './EvolutionAiTool.svelte';
	import RequestBar from './RequestBar.svelte';
	import { fillEvolutionPrompt } from './fill-prompt';
	import LiveAiButton from './LiveAiButton.svelte';
	import RequestSettings from './RequestSettings.svelte';
	import { relativeWhen } from './relative-when';
	import { LiveSession, provideLiveSession } from './live-session.svelte';
	import { specChecklist, specWritten } from './spec-board';
	import { AI_ACTIVITY_EVENT, type AiActivity } from '$lib/shared/ai-activity';
	import { readFunctionalDiagram } from '$lib/domain/evolution';
	import { EvolutionWrites, provideEvolutionWrites } from './evolution-writes.svelte';
	import { provideRequestLanguage } from './request-language.svelte';
	import { requirementOrder } from './requirement-kinds';
	import { overlayActions, overlayDossier, overlayProposals, overlayReport, patchKey, type Patches } from './dossier-overlay';
	import {
		ALL_BLOCK_FIELDS,
		NEED_FIELDS,
		STAGE_ORDER,
		answersEditableAt,
		blockFieldByPath,
		PLACE_PARAM,
		parsePlace,
		placeElementId,
		proposalArrival,
		type ProposalFate,
		type EvolutionStep,
		type LocalGraph,
		type PagePlace,
		type ImpactHypothesis,
		type RequestStage,
		type StepPrefillSection,
		type DecisionEntry
	} from '$domain/evolution';
	import type { DossierReading, HistoryPart, ImpactPart, ProposalRow, ReportPart } from '$lib/server/evolution-view.server';
	import { applyEvolution, drawWithAssistant } from './reading-api';
	import ImpactReading from './ImpactReading.svelte';
	import {
		REQUEST_TABS,
		nothingWaitsOnPeople,
		tabLabel,
		tabLocks,
		tabOfStep,
		tabStates,
		type AnswerHold,
		type RequestTab
	} from './request-tabs';
	import { specificationHold, specificationLeft } from '$lib/domain/evolution';
	import { codeReadOnce } from './report-board';
	import CustomQuestions from './CustomQuestions.svelte';
	import { personName } from './people';
	import DataChanges from './DataChanges.svelte';
	import { mentionedRefs } from '$lib/domain/evolution';
	import { STEP_QUESTIONS } from '$lib/domain/evolution';
	import { FUNCTIONAL_DIAGRAM_KEY } from '$lib/domain/evolution';
	import { questionFrame, questionText } from '$lib/domain/evolution';
	import FunctionalDiagram from './uml/FunctionalDiagram.svelte';
	import TechnicalDiagram from './uml/TechnicalDiagram.svelte';
	import { DiagramLinkStatus } from './uml/link-status.svelte';
	import { page } from '$app/state';
	import BriefingTab, { BRIEFING_SECTIONS, briefingSectionAnswers } from './BriefingTab.svelte';
	import StepPrefillButton from './StepPrefillButton.svelte';
	import { stepPrefillSectionOf } from './prefill-target';
	import SolutionTab, { SOLUTION_SECTIONS, type ProseQuestion } from './SolutionTab.svelte';
	import SpecificationTab from './SpecificationTab.svelte';
	import EditorialNote from './EditorialNote.svelte';
	import { noteReadKey, proseNote, specificationNote, type EditorialNote as StepNote } from './editorial-note';
	import { markPlace, placeOnPage, scrollToBlock } from './evo-scroll';
	import type { ActionReading } from '$lib/server/evolution-spec-actions.server';
	import EvolutionCelebration from './EvolutionCelebration.svelte';
	import { liveCelebrationOf } from './live-celebration';
	import { mergePageChanges, pageChangeCount, type PageChanges, type PageEditor, type PageDiagramDraft } from './page-edit';
	import { TOOL, TOOL_ON, PRIMARY } from '$ui/spec360/page/tools';

	/**
	 * One request, read along the usual path of a specification (ac-evo-req-6):
	 * Need, Solution, Functional spec, Technical spec, Impact analysis, Build,
	 * Approval, Deployment. The four stages and their gates stay the engine underneath.
	 * The page reads them in six tabs (request-tabs.ts): Briefing, Solutioning,
	 * Specification, Impact, Development and Final report.
	 *
	 * Each step that asks for prose opens on one description in the person's own
	 * words, then the rest once it is written or the person chooses to fill it
	 * (ac-evo-form-step-description, -fill-myself). Anyone with access validates
	 * a step or a field, a viewer excepted (ac-evo-req-19, ac-evo-hist-field-validation),
	 * and comments on any field (ac-evo-fthread-anyone). The request's graph is still
	 * computed, but no step draws it since the EVO-042 design (ac-evo-graph-per-step).
	 * The Technical spec holds what people write of the technique, the Impact
	 * analysis what the platform reads of the change (ac-evo-form-impact-step).
	 *
	 * Every act on the page is optimistic (ac-evo-form-edit-optimistic): what it
	 * changes is laid over the request as the server last said it
	 * (`overlayDossier`), so the page reads the outcome the moment the person acts
	 * and every block below reads it alike; the save runs behind and a refusal
	 * takes the outcome off again, its reason said. Crossing a gate opens the
	 * next step at once; one the server refuses brings the person back.
	 */
	interface Props {
		projectId: string;
		dossier: DossierReading;
		proposals: readonly ProposalRow[];
		/** What became of every suggestion that no longer waits, so an old link opens on what took its place. */
		proposalFates?: Readonly<Record<string, ProposalFate>>;
		impacts: Record<ImpactHypothesis, ImpactPart['impact']>;
		/** The verb each touched feature carries, and what the request does overall. */
		proposes: { byLeaf: Record<string, ImpactHypothesis>; main: ImpactHypothesis };
		report: ReportPart['report'] | null;
		history: HistoryPart['history'];
		/** Every field's versions, newest first, keyed like the field. */
		fieldVersions?: HistoryPart['fieldVersions'];
		leaves: readonly { id: string; name: string }[];
		/** The roster, each with what they do on the project where the workspace says it. */
		members: readonly { id: string; name: string; jobs?: readonly string[] }[];
		actorId: string;
		canEdit: boolean;
		isAdmin: boolean;
		onBack: () => void;
		/** Deletes the request: the board shows without it at once, the request again if the deletion fails. */
		onDelete: () => Promise<boolean>;
		onFixNow: (target: string) => void;
		/** Every decision taken on the request, newest first (the design's decision log). */
		decisionLog?: readonly DecisionEntry[];
		/** What the closed request leaves behind; null while it is not closed. */
		closing?: ClosingReading | null;
	}
	let {
		projectId,
		dossier: saved,
		proposals: savedProposals,
		proposalFates = {},
		impacts,
		proposes,
		report: savedReport,
		history,
		fieldVersions = {},
		leaves,
		members,
		actorId,
		canEdit,
		isAdmin,
		onBack,
		onDelete,
		onFixNow,
		decisionLog = [],
		closing = null
	}: Props = $props();

	/** The acts sent from the page, read over the request as the server last said it until it says it again. */
	const writes = new EvolutionWrites(
		untrack(() => projectId),
		() => saved
	);
	provideEvolutionWrites(writes);
	const overlayContext = $derived({ actor: actorId, needed: saved.validationsPerAnswer });
	const dossier = $derived(overlayDossier(saved, writes.patches, overlayContext));
	const proposals = $derived(overlayProposals(savedProposals, writes.patches));
	const report = $derived(overlayReport(savedReport, writes.patches));
	/** Sends operations on this request, read at once through `patches`; true once saved. */
	const send = (patches: Patches, ops: Record<string, unknown>[], what: string) => writes.send(patches, ops.map((op) => ({ requestId: dossier.id, ...op })), what);

	/** The decision log's side panel, opened from its floating button or from the closing block. */
	let logOpen = $state(false);

	// ── Going live is celebrated once per request for each reader, on whichever step they open it (ac-evo-verd-live-celebration) ──
	const celebratedKey = $derived(`lyriks.evolution.celebrated:${projectId}:${dossier.id}`);
	let celebrated = $state(true);
	$effect(() => {
		const key = celebratedKey;
		untrack(() => {
			try {
				celebrated = localStorage.getItem(key) === '1';
			} catch {
				celebrated = true;
			}
		});
	});
	const celebration = $derived(
		closing && dossier.status === 'closed'
			? liveCelebrationOf({
					key: dossier.key ?? 'The evolution',
					title: dossier.title,
					changes: closing.changes,
					version: closing.version,
					check: closing.landed,
					merged: dossier.code?.mergedCommit ? { into: dossier.code.mergedInto ?? dossier.code.deploymentBranch, commit: dossier.code.mergedCommit } : null,
					branchLeft: !!dossier.code?.mergedCommit,
					heldEntries: dossier.heldEntries ?? 0
				})
			: null
	);
	const celebrating = $derived(!!celebration && !celebrated);
	function closeCelebration() {
		celebrated = true;
		try {
			localStorage.setItem(celebratedKey, '1');
		} catch {
			// A browser that keeps nothing shows it again next time; nothing else to do.
		}
	}

	/**
	 * The reader's live session with their own AI (feat-evo-live-session), given
	 * to every block of the page: their AI buttons and its state in the header.
	 * Another person's session never shows here.
	 */
	const liveSession = new LiveSession(
		untrack(() => projectId),
		() => dossier.id,
		() => dossier.title,
		() => dossier.live,
		() => canEdit && dossier.status === 'open'
	);
	provideLiveSession(liveSession);
	$effect(() => liveSession.listen());

	// The step whose diagram the built-in assistant is drawing, while it does (ac-evo-diagram-assistant).
	let drawing = $state<'functional_spec' | 'technical_spec' | null>(null);
	// Why the last drawing was not written, said on the card of its step.
	let drawFailure = $state<Partial<Record<'functional_spec' | 'technical_spec', string>>>({});
	async function drawDiagram(step: 'functional_spec' | 'technical_spec') {
		drawing = step;
		drawFailure = { ...drawFailure, [step]: undefined };
		try {
			const failure = await drawWithAssistant(projectId, dossier.id, step);
			if (failure) drawFailure = { ...drawFailure, [step]: failure };
		} finally {
			drawing = null;
		}
	}
	/** What the person gives their own AI to redraw a step's diagram through the MCP (ac-evo-func-uml-sync). */
	function redrawPrompt(step: 'functional_spec' | 'technical_spec'): string {
		const which = step === 'functional_spec' ? "the Functional spec's diagram from its texts" : "the Technical spec's diagram from its description";
		return [
			`With the Lyriks MCP, redraw ${which} in the evolution request "${dossier.title}" (project ${projectId}, request ${dossier.id.slice(0, 8)}).`,
			`Read the request with get_evolution, then write the diagram with redraw_diagram${step === 'technical_spec' ? ' (step technical_spec)' : ''}: it rewrites no text.`,
			'Then tell me it is your drawing of what I wrote, for me to correct on the page.'
		].join(' ');
	}

	/** A drawing made by hand while the diagram is behind its texts catches it up, like a redraw: no text falls behind (ac-evo-func-uml-sync). */
	const redrawByHand = (step: 'functional_spec' | 'technical_spec', diagram: string) => {
		if (pageEditing) {
			heldDiagrams = { ...heldDiagrams, [step]: { value: diagram, redraw: true, invalid: false } };
			return Promise.resolve(true);
		}
		return send({ [patchKey.text(`step.${step}.${FUNCTIONAL_DIAGRAM_KEY}`)]: { kind: 'text', value: diagram } }, [{ op: 'redraw_diagram', step, diagram }], 'your drawing');
	};
	// The text of a step the built-in assistant is rewriting from the diagram, and why the last one was not written.
	let rewriting = $state<string | null>(null);

	const stageIndex = (stage: RequestStage) => STAGE_ORDER.indexOf(stage);
	const reached = (stage: RequestStage) => stageIndex(dossier.stage) >= stageIndex(stage);
	const stepOf = (step: EvolutionStep) => dossier.path.find((s) => s.step === step)!;

	/**
	 * One tab open at a time: the one the request stands on, unless the reader
	 * opens another. The page reads like the path it follows instead of growing
	 * with every step the request already crossed.
	 */
	let chosenTab = $state<RequestTab | null>(null);
	const currentStep = $derived(dossier.path.find((s) => s.current)?.step ?? 'need');
	/** At the Impact analysis, the touched features come first while none is named or one still owes an answer. */
	const touchedOwe = $derived(dossier.leaves.length === 0 || dossier.leaves.some((l) => owedOn(l.id) > 0));
	/** An answer as the step lock reads it (ac-evo-form-step-lock). */
	const holdOf = (f: { filled: boolean; trail?: { validation?: string; humanValidated?: boolean } | null }): AnswerHold => ({
		filled: f.filled,
		validation: f.trail?.validation,
		humanValidated: f.trail?.humanValidated
	});
	/** A person stands behind the whole Specification (specificationHeld, below with the graph it reads). */
	const specificationValidated = $derived(specificationHeld());
	// Validating is optional until the build: the request reads at the step it stands on, validated or not.
	const currentTab = $derived(tabOfStep(currentStep, touchedOwe || !specificationValidated));
	// A tab chosen before it closed again (a validation withdrawn) gives way to the one the request stands on.
	const openTab = $derived.by(() => (chosenTab && !locks[chosenTab] ? chosenTab : currentTab));
	// The page stays on the step the person reads: the request moving on once an act is read back (the
	// last section validated, the AI's writes) never takes them off it; the step's call to action does
	// (ac-evo-form-validate-next).
	$effect(() => {
		if (chosenTab === null) chosenTab = untrack(() => openTab);
	});
	const states = $derived(tabStates(dossier.path, currentTab));
	const goToTab = (tab: RequestTab) => selectTab(tab);
	/** Nothing written before the freeze can change once the spec is frozen: the steps of specification read, they no longer edit. */
	const specEditable = $derived(canEdit && !dossier.frozen && dossier.status === 'open');
	/** The answers of the steps of prose edit while the request stands at one of them (ac-evo-form-edit-anytime). */
	const answersEditable = $derived(specEditable && answersEditableAt(currentStep));
	const nameOf = (id: string) => personName(id, members);
	/** The frame of the use cases is named after the product (ac-evo-func-uml). */
	const productName = $derived((page.data as { projectName?: string }).projectName ?? 'The product');

	// A question skipped on purpose is settled, never owed (ac-evo-form-question-skip).
	const isOwed = (field: { path: string; filled: boolean; openQuestion: boolean; skipped?: unknown }, leafId: string | null) =>
		(!field.filled && !field.skipped) || field.openQuestion || proposalFor(field.path, leafId) !== null;
	const fieldsOf = (leafId: string) => dossier.fields.filter((f) => f.leafId === leafId);
	const owedOn = (leafId: string) => fieldsOf(leafId).filter((f) => isOwed(f, leafId)).length;

	const inlineFields = ALL_BLOCK_FIELDS.filter((f) => f.editor === 'inline');
	/** The questions of the steps of prose read in the spec's language (ac-evo-form-spec-language). */
	const lang = $derived(dossier.language ?? 'en');
	// The thread's suggestion names its places in the words of the Solution tab (ac-evo-live-comment-suggests).
	provideRequestLanguage(() => lang);
	const frame = $derived(questionFrame(lang));
	const localized = <T extends { path: string }>(meta: T): T => {
		const said = questionText(lang, meta.path);
		return said ? { ...meta, label: said.label, question: said.question, example: said.example, whyItMatters: said.why } : meta;
	};
	const labelOf = (path: string, english: string) => questionText(lang, path)?.label ?? english;
	const metaOf = (path: string) => localized(blockFieldByPath(path) ?? NEED_FIELDS.find((f) => f.path === path) ?? inlineFields[0]);
	const proposalFor = (path: string, leafId: string | null) =>
		proposals.find((p) => p.targetField === path && p.leafId === leafId) ?? null;

	const undecided = $derived(report ? report.lines.filter((l) => l.decision === 'undecided') : []);

	/**
	 * Opening the page on a place: the address names a field, a proposal, the
	 * next gate, a report line or an observation, and the page unfolds what
	 * hides it, scrolls to it and marks it for a moment. A place that no longer
	 * exists is said, never silently ignored.
	 */
	let highlighted = $state<string | null>(null);
	/**
	 * Where an address opened the page and what it says there, until the person
	 * moves on: then the note goes and the address stops naming the place, so a
	 * reload opens where they are (ac-evo-link-arrival-only).
	 */
	const arrival = new Arrival(() => {
		if (!page.url.searchParams.has(PLACE_PARAM)) return;
		const url = new URL(page.url);
		url.searchParams.delete(PLACE_PARAM);
		replaceState(url, page.state);
	});
	provideArrival(arrival);
	// Another step is moving on: the note of the arrival does not follow the person there.
	$effect(() => {
		const tab = openTab;
		untrack(() => {
			if (arrival.place && arrival.place.tab !== tab) arrival.leave();
		});
	});
	// A text or a diagram of the Solution's steps is always on the request: its section reads it (ac-evo-sol-diagram-alone).
	const fieldExists = (leafId: string | null, path: string) =>
		dossier.fields.some((f) => f.leafId === leafId && f.path === path) ||
		(leafId === null && (dossier.need.fields.some((f) => f.path === path) || /^step\.(solution|functional_spec|technical_spec)\./.test(path)));

	/**
	 * Where an answer is read in the design: the Need's answers in the three
	 * sections of the Briefing, the texts of the prose steps in the Solution's
	 * two sections, the journey's diagram in Specification, a feature's answers
	 * on its row.
	 */
	const NEED_SECTION: Record<string, string> = { description: 'need-origin', situation: 'need-current', symptoms: 'need-current', cost: 'need-current', objectives: 'need-target', measures: 'need-target' };
	function sectionOf(path: string, leafId: string | null): { elementId: string; tab: RequestTab } {
		if (leafId) return { elementId: `sg-feature-${leafId}`, tab: 'specification' };
		const need = /^00-need\.([a-z_]+)$/.exec(path)?.[1];
		if (need) return { elementId: NEED_SECTION[need] ?? 'need-origin', tab: 'briefing' };
		// Who asked and where it comes from are answers of 1.1 Request origin (ac-evo-form-origin-validated).
		if (path.startsWith('request.')) return { elementId: 'need-origin', tab: 'briefing' };
		// A diagram is read in its section of the Solution, shown in place of its list (ac-evo-sol-diagram-alone).
		if (path.startsWith('step.technical_spec.')) return { elementId: 'sol-technical', tab: 'solutioning' };
		return { elementId: 'sol-functional', tab: 'solutioning' };
	}
	/** The element a note about an answer sits beside: the answer itself on the Briefing, its feature's row on the Specification; null when the page draws no such place. */
	function besideOf(path: string, leafId: string | null): string | null {
		if (leafId) return `sg-feature-${leafId}`;
		if (/^00-need\.[a-z_]+$/.test(path)) return placeElementId({ kind: 'field', leafId: null, path });
		if (path.startsWith('request.')) return 'need-origin';
		return null;
	}
	type PlaceTarget = { elementId: string; tab: RequestTab; placeId?: string; note?: { anchor: string | null; text: string } };
	function resolvePlace(place: PagePlace): PlaceTarget | { gone: string } {
		switch (place.kind) {
			case 'proposal': {
				// A suggestion rewritten since leads to the one that replaced it, a decided one to the answer it was on (ac-leaf-6709493f).
				const landed = proposalArrival(place.id, (id) => proposals.some((x) => x.id === id), proposalFates);
				if (landed.kind === 'waiting') {
					const p = proposals.find((x) => x.id === landed.id);
					if (p) return { ...sectionOf(p.targetField, p.leafId), placeId: placeElementId({ kind: 'proposal', id: p.id }) };
					return { gone: goneSuggestionNote('unknown') };
				}
				if (landed.kind === 'decided') {
					const anchor = besideOf(landed.targetField, landed.leafId);
					return { ...sectionOf(landed.targetField, landed.leafId), ...(anchor ? { placeId: anchor } : {}), note: { anchor, text: decidedNote(landed, nameOf) } };
				}
				return { gone: goneSuggestionNote(landed.kind) };
			}
			case 'field':
				if (!fieldExists(place.leafId, place.path)) {
					const label = blockFieldByPath(place.path)?.label;
					return { gone: label ? `Your link pointed to “${label}” on a feature this request no longer touches.` : 'Your link pointed to an answer of a feature this request no longer touches.' };
				}
				return sectionOf(place.path, place.leafId);
			case 'line':
				if (!report?.lines.some((l) => l.id === place.id)) return { gone: 'Your link pointed to a report line that no longer exists: the report was rebuilt since.' };
				return { elementId: placeElementId(place), tab: 'final_report' };
			case 'observation':
				return { gone: 'Remarks logged while walking the change are read through the MCP: the page no longer shows them.' };
			case 'next-step':
				return { elementId: 'request-tabs', tab: currentTab };
		}
	}

	async function openPlace(key: string | null) {
		// A new address replaces what the last one said.
		arrival.place = null;
		const place = parsePlace(key);
		if (!place) return;
		const target = resolvePlace(place);
		if ('gone' in target) {
			arrival.land({ tab: openTab, anchor: null, text: target.gone });
			return;
		}
		// An address into a step not open yet says what that step waits for (ac-evo-form-step-lock).
		const waits = locks[target.tab];
		if (waits) {
			arrival.land({ tab: openTab, anchor: null, text: waits });
			return;
		}
		chosenTab = target.tab;
		arrival.land({ tab: target.tab, anchor: target.note?.anchor ?? null, text: target.note?.text ?? null });
		// What hides the place unfolds: a drawing shows in place of its section's list, a text in its list.
		if (target.tab === 'solutioning') solutionDiagrams = { ...solutionDiagrams, [target.elementId]: place.kind === 'field' && place.path.endsWith(`.${FUNCTIONAL_DIAGRAM_KEY}`) };
		highlighted = target.elementId;
		setTimeout(() => {
			if (highlighted === target.elementId) highlighted = null;
		}, 2400);
		await tick();
		// The place itself when the page draws it (the suggestion, the answer, the line), else the section around it (ac-evo-live-guide).
		const element = await placeOnPage([target.placeId ?? placeElementId(place), target.elementId]);
		if (!element) {
			arrival.land({ tab: target.tab, anchor: null, text: 'This place is not on the page any more.' });
			return;
		}
		markPlace(element);
	}
	afterNavigate(({ to }) => openPlace(to?.url.searchParams.get(PLACE_PARAM) ?? null));

	/** A subject leaves the request at once: its draft goes, or the feature is no longer named. */
	async function dropSubject(leaf: DossierReading['leaves'][number]) {
		const ok = await confirmDialog({
			title: `Take "${leaf.name}" out of the request?`,
			message: 'Nothing is written in the features before the freeze, so nothing there changes.',
			confirmLabel: 'Take it out'
		});
		if (!ok) return;
		const op = leaf.draftId ? { op: 'remove_draft_leaf', draftId: leaf.draftId } : { op: 'set_leaves', leafIds: dossier.leafIds.filter((id) => id !== leaf.id) };
		await send({ [patchKey.out(leaf.id)]: { kind: 'out' } }, [op], `taking “${leaf.name}” out of the request`);
	}

	const go = (target: string) => {
		const el = document.getElementById(target);
		if (!el) return;
		el.scrollIntoView({ behavior: scrollMotion(), block: 'center' });
		highlighted = target;
		setTimeout(() => {
			if (highlighted === target) highlighted = null;
		}, 2000);
	};

	/** Leaving the Impact freezes the version and opens the development at once, while the version is written. */
	async function startImplementation() {
		const frozen = dossier.specVersion + 1;
		if (await cross('implementation', 'development')) pushToast({ level: 'success', message: `Version ${frozen} frozen: the evolution moves into development` });
	}


	const keyOf = (path: string, leafId: string | null) => (leafId ? `${path}@${leafId}` : path);
	const versionsOf = (path: string, leafId: string | null) => fieldVersions[keyOf(path, leafId)] ?? [];
	const descriptionOf = (step: string) => dossier.stepDescriptions.find((d) => d.step === step);
	const descriptionField = (step: string) => {
		const d = descriptionOf(step)!;
		return {
			path: `step.${step}.description`,
			block: 'step',
			label: labelOf(`step.${step}.description`, 'In your own words'),
			critical: step === 'solution' || step === 'functional_spec',
			leafId: null,
			value: d.value,
			filled: d.value.trim() !== '',
			openQuestion: 'openQuestion' in d ? !!d.openQuestion : false,
			skipped: 'skipped' in d ? d.skipped : undefined,
			trail: d.trail,
			pendingProposalId: null,
			thread: 'thread' in d ? (d.thread ?? null) : null,
			href: ''
		} as unknown as DossierReading['fields'][number];
	};
	/** A question the step asks after its description, read like a field (ac-evo-func-prose). */
	/** The questions each step of prose asks after its description, with their answers (ac-evo-sol-prose, -func-prose, -tech-prose). */
	const stepAnswers = $derived(
		STEP_QUESTIONS.map((asked) => {
			const answer = dossier.stepAnswers.find((a) => a.step === asked.step && a.key === asked.key);
			return {
				...asked,
				value: answer?.value ?? '',
				trail: answer?.trail,
				thread: answer && 'thread' in answer ? (answer.thread ?? null) : null,
				openQuestion: answer && 'openQuestion' in answer ? !!answer.openQuestion : false,
				skipped: answer && 'skipped' in answer ? answer.skipped : undefined
			};
		})
	);
	type StepAnswerRow = (typeof stepAnswers)[number];
	const answersOf = (step: string) => stepAnswers.filter((a) => a.step === step);
	const stepAnswerField = (asked: StepAnswerRow) =>
		({
			path: `step.${asked.step}.${asked.key}`,
			block: 'step',
			label: labelOf(`step.${asked.step}.${asked.key}`, asked.label),
			critical: asked.required,
			leafId: null,
			value: asked.value,
			filled: asked.value.trim() !== '',
			openQuestion: asked.openQuestion,
			skipped: asked.skipped,
			trail: asked.trail,
			pendingProposalId: null,
			thread: asked.thread,
			href: ''
		}) as unknown as DossierReading['fields'][number];
	/** The elements the Functional spec cites that still exist, resolved once per set of citations (ac-evo-func-mention). */
	let mentionLinks = $state<Record<string, { href: string | null }>>({});
	const citedRefs = $derived(
		[
			...new Set(
				[...dossier.stepDescriptions.map((d) => d.value), ...dossier.stepAnswers.map((a) => a.value)].flatMap((text) => mentionedRefs(text))
			)
		].join(',')
	);
	$effect(() => {
		const refs = citedRefs;
		if (refs === '') return;
		void fetch(`/api/evolution/mentions?projectId=${encodeURIComponent(projectId)}&refs=${encodeURIComponent(refs)}`)
			.then((res) => (res.ok ? (res.json() as Promise<{ candidates: { ref: string; href: string | null }[] }>) : null))
			.then((body) => {
				if (body) mentionLinks = Object.fromEntries(body.candidates.map((c) => [c.ref, { href: c.href }]));
			});
	});
	/** The step's own description, as the person wrote it. */
	const descriptionText = (step: string) =>
		step === 'need' ? (dossier.need.fields.find((f) => f.path.endsWith('description'))?.value ?? '') : (descriptionOf(step)?.value ?? '');

	/** The graph of the request, drawn on demand and redrawn when the request moves. */
	let graph = $state<LocalGraph | null>(null);
	/** Where each action of the specification stands, read with the graph (spec-actions.ts). */
	let actionReadings = $state<Record<string, ActionReading>>({});
	let graphLoading = $state(false);
	/** Where each link of the two diagrams opens, and whether it still points at something (ac-evo-func-uml-link). */
	const diagramLinks = $derived(new DiagramLinkStatus(projectId));
	// The decision card reads the graph for its size rank (ac-evo-form-decision-size-rank), so it loads with the page.
	$effect(() => {
		// The newest entry of the history moves with every act, an action validated included: the graph and its readings follow.
		const stamp = `${saved.id}:${saved.leafIds.join(',')}:${saved.drafts.total}:${history[0]?.recordedAt ?? ''}:${history.length}`;
		void loadGraph(stamp);
	});
	/** The actions with the verdicts just sent on them. */
	const shownActions = $derived(overlayActions(actionReadings, writes.patches, overlayContext));
	/**
	 * A person stands behind the Specification as the page asks it (ac-evo-form-step-lock): each answer of the
	 * touched features, the values an AI typed on a draft included, each action it offers, each path of the
	 * journey and each change to the data. The actions come with the graph: until it is read, they are not known to be validated.
	 */
	function specificationHeld(): boolean {
		if (graph === null) return false;
		const hold = specificationHold([
			...dossier.fields.filter((f) => f.leafId !== null && f.filled).map((f) => f.trail ?? {}),
			...Object.values(shownActions).map((a) => a.trail),
			...Object.values(dossier.journeyPaths).map((t) => t ?? {}),
			...(dossier.data.changes ?? []).map((c) => c.trail ?? {})
		]);
		return specificationLeft(hold) === 0;
	}
	let graphStamp = '';
	async function loadGraph(stamp: string) {
		if (stamp === graphStamp) return;
		graphStamp = stamp;
		graphLoading = true;
		try {
			const res = await fetch(`/api/evolution?projectId=${encodeURIComponent(projectId)}&requestId=${encodeURIComponent(dossier.id)}&part=graph`);
			if (res.ok) {
				const body = (await res.json()) as { graph: LocalGraph; actions?: Record<string, ActionReading> };
				graph = body.graph;
				actionReadings = body.actions ?? {};
			}
		} finally {
			graphLoading = false;
		}
	}

	const dataLanded = $derived(dossier.data.drafts.length > 0 && dossier.data.drafts.every((d) => d.materialisedAt !== null));
	/**
	 * A reading due and missing is asked for once when the page opens
	 * (ac-evo-imp-7, ac-evo-impl-9): the platform computes it on its own after
	 * every act, but a request that already sat at the Impact analysis or at Build
	 * before that rule had none. Only someone who can edit triggers it.
	 */
	// Read on what the server said, never on a crossing still saving: that one computes its own readings.
	let catchUp = '';
	$effect(() => {
		const key = `${saved.id}:${saved.stage}:${saved.specVersion}`;
		if (!canEdit || saved.status !== 'open' || catchUp === key) return;
		const walks = [...new Set<ImpactHypothesis>([...Object.values(proposes.byLeaf), proposes.main])];
		const ops: Record<string, unknown>[] =
			saved.stage === 'coherence' && saved.impact.status !== 'ready'
				? [...walks.map((hypothesis) => ({ op: 'run_impact', hypothesis, depth: 2 })), { op: 'run_coherence' }]
				: saved.stage === 'implementation' && savedReport && savedReport.lines.length === 0 && savedReport.status !== 'closed'
					? [{ op: 'build_implementation_report' }]
					: [];
		if (ops.length === 0) return;
		catchUp = key;
		void applyEvolution(projectId, ops.map((op) => ({ requestId: saved.id, ...op })));
	});

	/**
	 * Every change of tab lands at the top of the request, the way the design
	 * scrolls (smoothly) to it. A tab not open yet opens nothing and says what it
	 * waits for (ac-evo-form-step-lock).
	 */
	function selectTab(tab: RequestTab): boolean {
		if (pageSaving || heldPageChanges > 0) {
			pushToast({ level: 'info', message: 'Save or cancel your page edits before changing steps.' });
			return false;
		}
		const waits = locks[tab];
		if (waits) {
			pushToast({ level: 'info', message: waits });
			return false;
		}
		if (editingSection === 'all') editingSection = null;
		chosenTab = tab;
		void tick().then(() => document.getElementById('request-top')?.scrollIntoView({ behavior: scrollMotion(), block: 'start' }));
		return true;
	}
	/** The tab after this one, offered at its foot. */
	const nextTab = (tab: RequestTab) => REQUEST_TABS[REQUEST_TABS.findIndex((t) => t.id === tab) + 1]?.id ?? null;

	/**
	 * A step opens its first section still owing an answer by itself (189c4d88), unless the page was opened at an
	 * address, which wins, or a person already validated the step: a validated step opens as it reads.
	 */
	const openOwed = untrack(() => !page.url.searchParams.has(PLACE_PARAM));
	const settledStep = (step: EvolutionStep) => !!stepOf(step).validation?.validated || !!stepOf(step).skip;
	/** A tab of prose a person validated: it opens as it reads and offers no prefill of the whole step (ac-evo-live-prefill-step). */
	const tabValidated = (tab: RequestTab) =>
		tab === 'briefing' ? settledStep('need') : tab === 'solutioning' ? (['solution', 'functional_spec', 'technical_spec'] as const).every(settledStep) : false;
	const openOwedNeed = $derived(openOwed && !tabValidated('briefing'));
	const openOwedSolution = $derived(openOwed && !tabValidated('solutioning'));
	/** The section opened to edit, one at a time on the page; opening one brings it just under the header. */
	let editingSection = $state<string | null>(null);
	let briefingEditor = $state<PageEditor>();
	let solutionEditor = $state<PageEditor>();
	let specificationEditor = $state<PageEditor>();
	let questionEditors = $state<Record<string, PageEditor | undefined>>({});
	let heldDiagrams = $state<Record<string, PageDiagramDraft>>({});
	const diagramSaveBlocked = $derived(Object.values(heldDiagrams).some((draft) => draft.invalid));
	let pageSaving = $state(false);
	const pageEditing = $derived(editingSection === 'all');
	const pageEditReason = $derived(
		!canEdit ? 'You do not have permission to edit this request.'
			: !specEditable ? 'This request is not editable at its current stage.'
				: openTab === 'specification' ? null
					: !['briefing', 'solutioning'].includes(openTab) ? 'This page is generated from the request and its implementation.'
						: !answersEditable ? 'The answers are not editable at this stage.' : null
	);
	const pageEdits = $derived.by((): PageChanges => {
		if (!pageEditing) return { operations: [], patches: {} };
		const editor = openTab === 'briefing' ? briefingEditor : openTab === 'solutioning' ? solutionEditor : specificationEditor;
		const diagrams: PageChanges = {
			operations: Object.entries(heldDiagrams).map(([step, draft]) => draft.redraw
				? { requestId: dossier.id, op: 'redraw_diagram', step, diagram: draft.value }
				: { requestId: dossier.id, op: 'answer_step', step, question: FUNCTIONAL_DIAGRAM_KEY, answer: draft.value }),
			patches: Object.fromEntries(Object.entries(heldDiagrams).map(([step, draft]) => [patchKey.text(`step.${step}.${FUNCTIONAL_DIAGRAM_KEY}`), { kind: 'text' as const, value: draft.value }]))
		};
		const questionSteps = openTab === 'briefing' ? ['need'] : openTab === 'solutioning' ? [...SOLUTIONING_STEPS] : [];
		return mergePageChanges([
			editor?.pageChanges() ?? { operations: [], patches: {} },
			...questionSteps.map((step) => questionEditors[step]?.pageChanges() ?? { operations: [], patches: {} }),
			diagrams
		]);
	});
	const heldPageChanges = $derived(pageChangeCount(pageEdits));

	async function savePage() {
		if (pageSaving || pageEditReason || diagramSaveBlocked) return;
		pageSaving = true;
		try {
			const changes = pageEdits;
			if (changes.operations.length > 0 && !(await writes.send(changes.patches, changes.operations, 'your page edit'))) return;
			heldDiagrams = {};
			editingSection = null;
			pushToast({ level: 'success', message: 'Page changes saved' });
		} finally { pageSaving = false; }
	}
	async function cancelPage() {
		if (pageSaving) return;
		if (heldPageChanges > 0 && !(await confirmDialog({ title: 'Cancel editing?', message: 'Your unsaved page edits will be dropped.', confirmLabel: 'Cancel editing', cancelLabel: 'Keep editing' }))) return;
		heldDiagrams = {};
		editingSection = null;
	}
	function startPageEdit() {
		if (pageEditReason || pageSaving) return;
		heldDiagrams = {};
		editingSection = 'all';
		void tick().then(() => document.querySelector<HTMLElement>('#request-top textarea, #request-top input:not([type="hidden"]), #request-top select')?.focus({ preventScroll: true }));
	}
	function pageKey(event: KeyboardEvent) {
		if (event.key.toLowerCase() === 'e' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
			event.preventDefault();
			if (pageEditing) void cancelPage();
			else startPageEdit();
		} else if (event.key === 'Escape' && pageEditing && !(event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) {
			event.preventDefault();
			void cancelPage();
		}
	}
	function holdDiagram(step: string, draft: PageDiagramDraft | null) {
		const prior = heldDiagrams[step];
		if (!draft) {
			if (prior) heldDiagrams = Object.fromEntries(Object.entries(heldDiagrams).filter(([key]) => key !== step));
		} else if (!prior || prior.value !== draft.value || prior.redraw !== draft.redraw || prior.invalid !== draft.invalid) {
			heldDiagrams = { ...heldDiagrams, [step]: draft };
		}
	}
	beforeNavigate((navigation) => {
		if ((heldPageChanges === 0 && !pageSaving) || navigation.type === 'leave') return;
		navigation.cancel();
		pushToast({ level: 'info', message: 'Save or cancel your page edits before leaving.' });
	});
	function editSection(id: string | null) {
		if (pageEditing) return;
		const previous = editingSection;
		editingSection = id;
		if (id) void tick().then(() => scrollToBlock(id, previous));
	}

	/** What crossing each gate is, named in the toast when the server refuses it. */
	const CROSSING: Record<RequestStage, string> = {
		draft: 'the move back to the draft',
		specification: 'the opening of the specification',
		coherence: 'the move to the Simulation',
		implementation: 'the freeze of the version and the move to Implementation',
		acceptance: 'the move to acceptance testing',
		delivered: 'the approval of the evolution'
	};
	/**
	 * Crosses the next gate and opens the step it leads to at once, the request
	 * read there while the crossing saves (a computed reading, the Simulation's,
	 * shows its own progress there). A gate the server refuses takes the request
	 * back where it stood and brings the person back to the step they left, the
	 * reason said in the toast.
	 */
	async function cross(next: RequestStage, to: RequestTab): Promise<boolean> {
		if (pageSaving || heldPageChanges > 0) {
			pushToast({ level: 'info', message: 'Save or cancel your page edits before changing steps.' });
			return false;
		}
		const back = openTab;
		const crossing = send({ [patchKey.stage]: { kind: 'stage', stage: next } }, [{ op: 'cross_stage' }], CROSSING[next]);
		selectTab(to);
		if (await crossing) return true;
		chosenTab = back;
		void tick().then(() => document.getElementById('request-top')?.scrollIntoView({ behavior: scrollMotion(), block: 'start' }));
		return false;
	}
	/**
	 * The call to action at the foot of a step opens the next one, the way the
	 * design reads. Where the request stands at the stage that step leaves, the
	 * gate is crossed first; a gate that holds says why, and the next step still
	 * opens to be read.
	 */
	async function advance(from: readonly RequestStage[], to: RequestTab) {
		// What people still owe the steps before is never crossed past (ac-evo-form-step-lock): no gate moves first.
		const owed = to === 'solutioning' || to === 'specification' ? locks[to] : null;
		if (owed) return void pushToast({ level: 'info', message: owed });
		if (canEdit && dossier.status === 'open' && from.includes(dossier.stage) && dossier.gate.next) {
			if (dossier.gate.ok) return void (await cross(dossier.gate.next, to));
			pushToast({ level: 'info', message: dossier.gate.reason ?? 'Not ready yet' });
		}
		selectTab(to);
	}

	/** The texts the Solution reads as requirements, step by step; each section offers its drawing among its controls. */
	const proseQuestionsOf = (step: 'solution' | 'functional_spec' | 'technical_spec'): ProseQuestion[] => {
		if (stepOf(step).skip) return [];
		const description = descriptionOf(step) ? [{ step, key: 'description', label: descriptionTitle(step) ?? labelOf(`step.${step}.description`, 'In your own words'), field: descriptionField(step) }] : [];
		const asked = answersOf(step)
			.filter((a) => a.key !== FUNCTIONAL_DIAGRAM_KEY)
			.map((a) => ({ step, key: a.key, label: labelOf(`step.${step}.${a.key}`, a.label), field: stepAnswerField(a) }));
		return [...description, ...asked];
	};
	// 2.1 reads its kinds in one order across the two steps it shows (ac-evo-sol-diagram-alone).
	const functionalQuestions = $derived(
		[...proseQuestionsOf('solution'), ...proseQuestionsOf('functional_spec')].sort((a, b) => requirementOrder(a.step, a.key) - requirementOrder(b.step, b.key))
	);
	const technicalQuestions = $derived(proseQuestionsOf('technical_spec'));

	/**
	 * The sections a prefill of the whole step walks, in the order each step
	 * shows them (ac-evo-live-prefill-step); a step made of no section offers none.
	 */
	const stepPrefillSections = $derived.by((): Partial<Record<RequestTab, StepPrefillSection[]>> => {
		const walked = (rows: (StepPrefillSection | null)[]) => rows.filter((r): r is StepPrefillSection => r !== null);
		return {
			...(stepOf('need').skip ? {} : { briefing: walked(BRIEFING_SECTIONS.map((s) => stepPrefillSectionOf(s.id, briefingSectionAnswers(dossier, s)))) }),
			solutioning: walked([
				stepPrefillSectionOf(SOLUTION_SECTIONS[0].id, functionalQuestions.map((q) => q.field)),
				stepPrefillSectionOf(SOLUTION_SECTIONS[1].id, technicalQuestions.map((q) => q.field))
			])
		};
	});
	/** A step's diagram as an answer: what is validated as the user journey, and the Technical spec's drawing. */
	const diagramField = (step: 'functional_spec' | 'technical_spec') => {
		const asked = stepOf(step).skip ? undefined : answersOf(step).find((a) => a.key === FUNCTIONAL_DIAGRAM_KEY);
		return asked ? stepAnswerField(asked) : null;
	};
	/**
	 * Why a step's section cannot be validated as it stands: its texts and its diagram say two things, which the
	 * platform refuses to stand behind (ac-evo-func-uml-sync, ac-evo-tech-uml-sync); the diagram's card catches up.
	 */
	const outOfStep = (step: 'functional_spec' | 'technical_spec'): string | null => {
		const sync = step === 'functional_spec' ? dossier.functionalDiagram : dossier.technicalDiagram;
		if (sync.behind) return 'Its diagram is behind its texts: bring the diagram in step with them before validating';
		if (sync.textsBehind.length > 0) return 'A text is behind its diagram: rewrite it from the diagram before validating';
		return null;
	};

	/** What opens each tab: the request itself reaching it; no tab waits for a validation. */
	const locks = $derived(
		tabLocks({
			current: currentTab,
			atImpactAnalysis: reached('coherence'),
			versionFrozen: reached('implementation'),
			codeRead: codeReadOnce(dossier.stage, report?.lines ?? [])
		})
	);
	const saveDiagram = (step: 'functional_spec' | 'technical_spec') => (value: string) => {
		if (pageEditing) {
			heldDiagrams = value === diagramField(step)?.value
				? Object.fromEntries(Object.entries(heldDiagrams).filter(([key]) => key !== step))
				: { ...heldDiagrams, [step]: { value, redraw: false, invalid: false } };
			return Promise.resolve(true);
		}
		return send(
			{ [patchKey.text(`step.${step}.${FUNCTIONAL_DIAGRAM_KEY}`)]: { kind: 'text', value } },
			[{ op: 'answer_step', step, question: FUNCTIONAL_DIAGRAM_KEY, answer: value }],
			'your diagram'
		);
	};
	/** The sections of the Solution showing their drawing in place of their list, kept for the visit (ac-evo-sol-diagram-alone). */
	let solutionDiagrams = $state<Record<string, boolean>>({});
	/** A step shows the questions an AI asked on it only while one still waits for an answer. */
	const openQuestionsOn = (step: string) => dossier.customQuestions.entries.some((q) => q.step === step && q.status === 'open');

	/**
	 * What the person's AI wrote or suggests on a step, summed up at its top
	 * (ac-evo-form-step-note); it took the place of the welcome a request opened
	 * by an AI used to show. An answer stands as the AI wrote it when its current
	 * version came through the MCP, from the built-in assistant or from a
	 * suggestion the person accepted.
	 */
	const AI_SOURCES: readonly string[] = ['ai_client', 'assistant', 'proposal'];
	const writtenByAi = (path: string) => {
		const current = versionsOf(path, null)[0];
		return !!current && AI_SOURCES.includes(current.source) && current.value.trim() !== '';
	};
	/** Every answer of the Briefing and the Solution by its path, as the step lock reads it: what a step of the note waits on. */
	const proseAnswers = $derived(
		new Map(
			[...dossier.need.fields, ...dossier.originAnswers, ...functionalQuestions.map((q) => q.field), ...technicalQuestions.map((q) => q.field)]
				.concat([diagramField('functional_spec'), diagramField('technical_spec')].filter((f) => f !== null))
				.map((f) => [f.path, holdOf(f)])
		)
	);
	const waitsOnPeople = (path: string) => {
		const answer = proseAnswers.get(path);
		return !!answer && !nothingWaitsOnPeople([answer]);
	};
	const proseSection = (s: { id: string; number: string; title: string }, paths: readonly string[]) => ({
		number: s.number,
		title: s.title,
		target: s.id,
		aiWritten: paths.filter(writtenByAi).length,
		suggestions: paths.filter((p) => proposalFor(p, null)).length,
		accepted: paths.filter((p) => versionsOf(p, null)[0]?.source === 'proposal').length,
		waiting: paths.filter(waitsOnPeople).length
	});
	const JOURNEY_PATH = `step.functional_spec.${FUNCTIONAL_DIAGRAM_KEY}`;
	const briefingNote = $derived(proseNote('briefing', BRIEFING_SECTIONS.map((s) => proseSection(s, s.keys.map((k) => `00-need.${k}`)))));
	const solutionNote = $derived(
		proseNote('solution', [
			proseSection(SOLUTION_SECTIONS[0], [...functionalQuestions.map((q) => q.field.path), ...(diagramField('functional_spec') ? [JOURNEY_PATH] : [])]),
			proseSection(SOLUTION_SECTIONS[1], [...technicalQuestions.map((q) => q.field.path), ...(diagramField('technical_spec') ? [`step.technical_spec.${FUNCTIONAL_DIAGRAM_KEY}`] : [])])
		])
	);
	const specNote = $derived.by(() => {
		const journey = diagramField('functional_spec');
		return specificationNote({
			byAi: history.some((h) => h.type === 'draft_change' && h.channel === 'ai_client'),
			features: dossier.leaves.length,
			actions: Object.keys(actionReadings).length,
			dataChanges: dossier.data.drafts.length,
			removals: dossier.leaves.filter((l) => l.change === 'remove').map((l) => l.name),
			featureSuggestions: proposals.filter((p) => p.leafId !== null).length,
			journeyByAi: !!journey && writtenByAi(JOURNEY_PATH) && journey.trail?.validation !== 'validated',
			journey: !!journey && journey.value.trim() !== '',
			waiting: {
				features: specificationLeft(specificationHold(dossier.fields.filter((f) => f.leafId !== null && f.filled).map((f) => f.trail ?? {}))),
				// The actions come with the graph: until it is read, none is known to be validated.
				actions: graph === null ? Object.keys(actionReadings).length : specificationLeft(specificationHold(Object.values(shownActions).map((a) => a.trail))),
				// Each path of the journey is validated on its own; a journey with no path yet, as its drawing.
				journey: Object.keys(dossier.journeyPaths).length > 0
					? specificationLeft(specificationHold(Object.values(dossier.journeyPaths).map((t) => t ?? {}))) > 0
					: !!journey && !nothingWaitsOnPeople([holdOf(journey)])
			}
		});
	});

	/**
	 * The descriptions read side by side in one section are titled by what they
	 * say, never all "In your own words", in the language of the spec.
	 */
	const DESCRIPTION_TITLE: Record<'en' | 'fr', Record<string, string>> = {
		en: { solution: 'What changes in the product', functional_spec: 'How it goes for the person using it', technical_spec: 'Technical constraints and risks' },
		fr: { solution: 'Ce qui change dans le produit', functional_spec: 'Comment ça se passe pour la personne', technical_spec: 'Contraintes et risques techniques' }
	};
	const descriptionTitle = (step: string) => DESCRIPTION_TITLE[lang === 'fr' ? 'fr' : 'en'][step] ?? null;

	/**
	 * Save, then edit the next card: the card that saves names the one after it
	 * in its tab, and the page opens that one's editor (a new stamp each time).
	 */
	let editAsked = $state<{ path: string; at: number } | null>(null);
	const needPaths = $derived(dossier.need.fields.map((f) => f.path));

	/** The prompt that hands the writing of the specification to the person's own AI, through the MCP. */
	const specPrompt = $derived(
		[
			`With the Lyriks MCP, write the specification of evolution ${dossier.key ?? ''} "${dossier.title}" (project ${projectId}, request ${dossier.id.slice(0, 8)}).`,
			'Read it with get_evolution. From its Briefing and its Solutioning, name the features it touches (add_draft_leaf), model their actions and rules (apply_behavior_batch on draft:<id>), declare the tables it changes (add_data_draft), and ask me what you cannot tell (ask_question).',
			'Follow the lyriks-evolution skill; never decide in my place.',
			'Review only features, actions and rules actually changed by this request. Keep unchanged inherited elements as context, preserve stable identities and every human rejection, and never recreate rejected proposals or validate in my place.'
		].join(' ')
	);
	/** The flows the Functional spec's diagram walks: the user journey of the change. */
	const functionalFlows = $derived(readFunctionalDiagram(answersOf('functional_spec').find((a) => a.key === FUNCTIONAL_DIAGRAM_KEY)?.value ?? '').diagram.flows.length);
	/**
	 * The person's AI at work on this request, followed live through the MCP:
	 * each read or write it makes reaches the page as an activity, which shows
	 * it connected for a while after and ticks the reading the moment it reads.
	 */
	let aiRead = $state(false);
	let aiAct = $state<AiActivity['act'] | null>(null);
	let aiSignals = $state(0);
	// Provisional: how long the AI counts as connected after its last call, to be measured on real runs.
	const AI_PRESENCE_MS = 30_000;
	$effect(() => {
		const requestId = dossier.id;
		let gone: ReturnType<typeof setTimeout> | undefined;
		const onActivity = (event: Event) => {
			const { detail } = event as CustomEvent<AiActivity>;
			if (detail.requestId !== requestId) return;
			if (detail.act === 'read') aiRead = true;
			aiAct = detail.act;
			aiSignals++;
			clearTimeout(gone);
			gone = setTimeout(() => (aiAct = null), AI_PRESENCE_MS);
		};
		window.addEventListener(AI_ACTIVITY_EVENT, onActivity);
		return () => {
			window.removeEventListener(AI_ACTIVITY_EVENT, onActivity);
			clearTimeout(gone);
		};
	});
	/** What the specification holds so far, line by line, read from the request as the AI writes it. */
	const specFacts = $derived({
		descriptionsWritten: (['solution', 'functional_spec', 'technical_spec'] as const).filter((step) => descriptionText(step).trim() !== '').length,
		questionsAsked: dossier.customQuestions.entries.length,
		questionsOpen: dossier.customQuestions.entries.filter((q) => q.status === 'open').length,
		features: dossier.leaves.length,
		featuresAdded: dossier.leaves.filter((l) => l.change === 'add').length,
		featuresAddedModelled: dossier.leaves.filter((l) => l.change === 'add' && (l.behaviour ?? 0) > 0).length,
		flows: functionalFlows,
		functionalNotApplicable: !!stepOf('functional_spec').skip,
		dataChanges: dossier.data.drafts.length,
		pageChanges: dossier.sectionChanges.total + dossier.ruleChanges.total,
		// Validating is optional until the build: a Technical spec written says what it moves of the data, even when nothing.
		technicalSettled: stepOf('technical_spec').progress === 'done' || !!stepOf('technical_spec').skip,
		aiRead
	});
	const specLines = $derived(specChecklist(specFacts));
	const specComplete = $derived(specLines.every((l) => l.done));
	const specPercent = $derived(Math.round((specLines.filter((l) => l.done).length / specLines.length) * 100));
	/**
	 * The loader shows only while the specification is not written yet. When this
	 * page saw the AI start, it stays as long as the AI keeps calling, so the
	 * lines tick in front of the person, and gives way once it pauses or every
	 * line is done. A later visit to a written specification never sees it.
	 */
	const specIsWritten = $derived(specWritten(specFacts));
	// Provisional: the longest silence between two MCP writes of one pass, to be measured on real runs.
	const SPEC_WRITES_PAUSE_MS = 20_000;
	const SPEC_DONE_SETTLE_MS = 900;
	let specWatched = $state(false);
	const specTrace = $derived(specLines.map((l) => `${l.done}:${l.note}`).join('|'));
	$effect(() => {
		void specTrace;
		void aiSignals;
		if (aiSignals === 0) return;
		specWatched = true;
		const timer = setTimeout(() => (specWatched = false), specComplete ? SPEC_DONE_SETTLE_MS : SPEC_WRITES_PAUSE_MS);
		return () => clearTimeout(timer);
	});
	const aiWorking = $derived(aiAct !== null);
	// Only while the page hears the person's AI: an AI nobody asked is never said to be writing (criterion cc371da2).
	// A specification whose every line is done gives way, whatever the AI keeps doing on the request.
	const specLoading = $derived(!specComplete && (aiWorking || (specWatched && specIsWritten)));
	// Said once, when the AI finishes the specification while the page is open.
	let specWasComplete = untrack(() => specComplete);
	$effect(() => {
		if (specComplete && !specWasComplete)
			pushToast({ level: 'success', message: `Lyriks finished the specification: ${dossier.leaves.length} ${dossier.leaves.length === 1 ? 'feature' : 'features'} to review` });
		specWasComplete = specComplete;
	});

	// A request just created from scratch opens on its first question, its editor open, and says so once.
	$effect(() => {
		if (page.url.searchParams.get('start') !== '1') return;
		untrack(() => {
			editAsked = { path: needPaths[0], at: Date.now() };
			pushToast({ level: 'success', message: `${dossier.key ?? 'The evolution'} created: start with the request origin` });
			const url = new URL(page.url);
			url.searchParams.delete('start');
			void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
		});
	});

	const SOLUTIONING_STEPS = ['solution', 'functional_spec', 'technical_spec'] as const;

	/** The steps as the bar shows them: a step reads ticked when it is done, or when a later one is (ac-evo-form-tab-ticked). */
	const barTabs = $derived.by(() => {
		const done = REQUEST_TABS.map((tab) => states[tab.id] === 'done');
		return REQUEST_TABS.map((tab, i) => ({ id: tab.id, label: tab.label, ticked: done.slice(i).some(Boolean), waits: locks[tab.id] ?? null }));
	});
	const barStatus = $derived(dossier.status === 'open' ? 'In progress' : dossier.status === 'cancelled' ? 'Cancelled' : 'Closed');
	const barStanding = $derived(`Stands at ${tabLabel(currentTab)} · ${barTabs.filter((t) => t.ticked).length} of ${barTabs.length} steps done`);
	/** The step on screen offers to prefill all of it, while something is left to prefill (ac-evo-live-prefill-step). */
	const barPrefill = $derived.by(() => {
		const sections = answersEditable && dossier.status === 'open' && !tabValidated(openTab) ? stepPrefillSections[openTab] : undefined;
		return sections && sections.length > 0 ? { step: openTab, label: tabLabel(openTab), sections } : null;
	});
	/** The prompt that hands the whole request to the person's own AI (criterion 34d8397e): it writes, the gates stay a person's. */
	const fillPrompt = $derived(fillEvolutionPrompt(dossier, projectId));

</script>

{#snippet tabFoot(tab: RequestTab, extra?: Snippet)}
	{@const next = nextTab(tab)}
	<div class="flex flex-wrap items-center justify-end gap-2 pt-2">
		{@render extra?.()}
		{#if next}
			<Button onclick={() => goToTab(next)}>
				Go to {tabLabel(next)}
				<Icon name="arrow-right" size={14} />
			</Button>
		{/if}
	</div>
{/snippet}

{#snippet waitingCard(eyebrow: string, title: string, text: string, back: RequestTab | null)}
	<!-- A tab the request has not reached yet: said in one dashed card, with the way back to where it stands. -->
	<div class="rounded-card border-[1.5px] border-dashed border-ink-3 bg-surface px-6 py-12 text-center">
		<p class="font-mono text-xs uppercase tracking-[0.08em] text-ink-500">{eyebrow}</p>
		<h2 class="mt-2 text-xl font-bold tracking-[-0.02em] text-ink-900">{title}</h2>
		<p class="mx-auto mt-2 max-w-lg text-sm text-ink-700">{text}</p>
		{#if back}
			<div class="mt-5 flex justify-center">
				<Button variant="outline" onclick={() => selectTab(back)}>Go to {tabLabel(back)}</Button>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet needBody()}
	<!-- The questions an AI asked the person, while one waits: answered here, the design having no other place for them. -->
	{#if briefingNote}{@render stepNote('briefing', briefingNote)}{/if}
	{#if openQuestionsOn('need') || (pageEditing && saved.customQuestions.entries.some((question) => question.step === 'need' && question.status === 'open'))}<CustomQuestions bind:this={questionEditors.need} {projectId} requestId={dossier.id} step="need" questions={pageEditing ? saved.customQuestions : dossier.customQuestions} {members} {actorId} {pageEditing} canEdit={canEdit && dossier.status === 'open'} />{/if}
	{#if !stepOf('need').skip}
		<BriefingTab
			bind:this={briefingEditor}
			{projectId}
			{dossier}
			{proposals}
			{members}
			{actorId}
			canEdit={answersEditable}
			canValidate={canEdit && dossier.status === 'open' && !pageEditing}
			canComment={dossier.status === 'open'}
			{lang}
			versionsOf={(path) => versionsOf(path, null)}
			{nameOf}
			editing={editingSection}
			onEdit={editSection}
			openOwed={openOwedNeed}
			nextStep={{ label: 'Functional requirements', go: () => void (selectTab('solutioning') && editSection('sol-functional')) }}
			onGoSolution={() => selectTab('solutioning')}
		/>
	{/if}
{/snippet}

{#snippet stepNote(step: RequestTab, note: StepNote)}
	<!-- What the person's AI or Lyriks produced or suggested on the step, first under the step bar (ac-evo-form-step-note). -->
	<EditorialNote {note} readKey={noteReadKey(dossier.id, step, note)} onGo={(target) => scrollToBlock(target)} />
{/snippet}

{#snippet solutioningBody()}
	{#if solutionNote}{@render stepNote('solutioning', solutionNote)}{/if}
	<!-- The questions an AI asked the person on the Solution and the two specs. -->
	{#each SOLUTIONING_STEPS.filter((step) => openQuestionsOn(step) || (pageEditing && saved.customQuestions.entries.some((question) => question.step === step && question.status === 'open'))) as step (step)}
		<CustomQuestions bind:this={questionEditors[step]} {projectId} requestId={dossier.id} {step} questions={pageEditing ? saved.customQuestions : dossier.customQuestions} {members} {actorId} {pageEditing} canEdit={canEdit && dossier.status === 'open'} />
	{/each}
	<SolutionTab
		bind:this={solutionEditor}
		{projectId}
		requestId={dossier.id}
		functional={functionalQuestions}
		technical={technicalQuestions}
		stepOf={(step) => stepOf(step)}
		{members}
		{actorId}
		canEdit={answersEditable}
		canValidate={canEdit && dossier.status === 'open' && !pageEditing}
		canComment={dossier.status === 'open'}
		{lang}
		{mentionLinks}
		versionsOf={(path) => versionsOf(path, null)}
		{nameOf}
		editing={editingSection}
		onEdit={editSection}
		openOwed={openOwedSolution}
		diagramShown={(id) => !!solutionDiagrams[id]}
		onDiagram={(id, shown) => (solutionDiagrams = { ...solutionDiagrams, [id]: shown })}
		diagramOwed={dossier.functionalDiagram.owed}
		drawings={{ functional_spec: diagramField('functional_spec'), technical_spec: diagramField('technical_spec') }}
		{outOfStep}
		onGoSpecification={() => advance(['draft'], 'specification')}
	>
		{#snippet useCaseDiagram()}{@render umlDiagram('functional_spec', 'use_cases')}{/snippet}
		{#snippet technicalDiagram()}{@render umlDiagram('technical_spec', 'use_cases')}{/snippet}
	</SolutionTab>
{/snippet}

{#snippet umlDiagram(step: 'functional_spec' | 'technical_spec', initialView: 'use_cases' | 'flows', editing: boolean | null = null)}
	<!--
		A step drawn in UML by the app's own editor (ac-evo-func-uml, ac-evo-tech-uml),
		an answer like the others, edited on the drawing alone while it is not validated.
	-->
	{@const field = diagramField(step)}
	{@const sync = step === 'functional_spec' ? dossier.functionalDiagram : dossier.technicalDiagram}
	{#if field}
		{@const editable = (editing ?? true) && answersEditable && field.trail?.validation !== 'validated'}
		{@const behind = sync.behind ? { prompt: redrawPrompt(step), step } : null}
		{@const assist = dossier.assistant.available && sync.behind ? { run: () => drawDiagram(step), drawing: drawing === step, failure: drawFailure[step] ?? null } : null}
		{#if editable && !behind && !pageEditing}
			<!-- Draw with my AI (ac-evo-live-draw): the reader's own AI redraws it from the step's texts. Behind them, the card offers that same click instead (ac-evo-func-uml-sync). -->
			<div class="flex justify-end"><LiveAiButton kind="draw" target={{ fieldPath: `step.${step}.${FUNCTIONAL_DIAGRAM_KEY}`, leafId: null, step }} /></div>
		{/if}
		{#if step === 'functional_spec'}
			<FunctionalDiagram value={field.value} {editable} {pageEditing} onDraft={(draft) => holdDiagram(step, draft)} save={saveDiagram(step)} redraw={(v) => redrawByHand(step, v)} {productName} {lang} {behind} assist={pageEditing ? null : assist} links={diagramLinks} {initialView} />
		{:else}
			<TechnicalDiagram value={field.value} {editable} {pageEditing} onDraft={(draft) => holdDiagram(step, draft)} save={saveDiagram(step)} redraw={(v) => redrawByHand(step, v)} {productName} {lang} {behind} assist={pageEditing ? null : assist} links={diagramLinks} />
		{/if}
	{:else}
		<p class="text-[0.8125rem] text-evo-muted italic">Marked not applicable: there is nothing to draw.</p>
	{/if}
{/snippet}

{#snippet specificationBody()}
	<!--
		What the change touches (ac-evo-form-impact-step), written by the person's
		AI through the MCP, then read and validated here, one page: the features,
		their actions, the journey and the data. Nothing reaches a section before
		the change is declared live.
	-->
	{#if specLoading}
		<!-- Ticked as the AI writes through the MCP: the page re-reads the request as it lands; only the motion runs on its own, never the progress. -->
		<div class="animate-lk-fade flex flex-col items-center gap-[22px] rounded-2xl border border-transparent bg-surface px-6 pb-10 pt-11" aria-busy="true">
			<span aria-hidden="true" class="relative size-14 flex-none">
				<span class="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--color-orange)_0_70%,var(--color-toner-2)_70%)] {aiWorking ? 'animate-[lk-spin_1.1s_linear_infinite]' : ''}"></span>
				<span class="absolute inset-1 rounded-full bg-surface"></span>
				<span class="animate-lk-pulse absolute inset-[9px] grid place-items-center bg-violet-ink text-paper [animation-duration:1.6s]"><Icon name="sparkles" size={18} /></span>
			</span>
			<div class="flex flex-col items-center gap-1.5 text-center">
				<h2 class="text-[1.375rem] font-bold leading-tight tracking-[-0.02em]">Your LLM is writing the specification</h2>
				<span class="text-sm text-ink-2">You can leave this page, you’ll be notified when it’s ready</span>
				<!-- Live through the MCP: each call the AI makes on this request reaches the page. -->
				<span class="mt-1 inline-flex items-center gap-2 px-3 py-1 font-evo-mono text-xs {aiWorking ? 'bg-green-tint text-green-ink' : 'bg-evo-page text-ink-3'}" role="status">
					<span class="size-2 {aiWorking ? 'animate-lk-pulse bg-green' : 'animate-[lk-ai_1.2s_steps(2)_infinite] bg-orange'}" aria-hidden="true"></span>
					{#if aiAct === 'read'}Your AI is connected · Lyriks is reading the request
					{:else}Your AI is connected · Lyriks is writing the specification{/if}
				</span>
			</div>
			<span class="relative block w-full max-w-[520px]">
				<Gauge parts={[{ value: specPercent, tone: 'bg-blue' }]} total={100} progress={specPercent} />
				{#if aiWorking}<i class="animate-lk-sweep absolute inset-y-0 left-0 w-1/3 bg-paper/40" style:clip-path={slantedOutline(8)}></i>{/if}
			</span>
			<ol class="flex w-full max-w-[520px] flex-col gap-2">
				{#each specLines as line, i (line.label)}
					{@const current = !line.done && specLines.findIndex((l) => !l.done) === i}
					<li class="flex items-center gap-3 text-sm {line.done || current ? 'text-evo-ink' : 'text-ink-3'} {current ? 'font-bold' : ''}">
						{#if line.done}
							<span class="animate-lk-pop flex size-[22px] flex-none items-center justify-center bg-green text-xs font-bold text-ink">✓</span>
						{:else if current && aiWorking}
							<span class="animate-lk-spin size-[22px] flex-none rounded-full border-2 border-toner-2 border-t-orange"></span>
						{:else}
							<span class="flex size-[22px] flex-none items-center justify-center font-evo-mono text-xs font-bold {current ? 'animate-lk-pulse bg-orange text-ink' : 'bg-toner-2 text-ink-3'}">{i + 1}</span>
						{/if}
						<span class="flex-1">{line.label}</span>
						{#if line.note}<span class="font-evo-mono text-xs text-ink-3">{line.note}</span>{/if}
					</li>
				{/each}
			</ol>
		</div>
	{:else}
		{#if !specIsWritten}
			<!-- Nobody is writing it: said as it stands, with what starts it (criterion cc371da2). -->
			<div class="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-5 py-4">
				<p class="m-0 text-sm text-ink-2">Nothing is written yet. Your AI writes it when you ask it to from Ask my AI in the left navigation.</p>
			</div>
		{/if}
		{#if specNote}{@render stepNote('specification', specNote)}{/if}
		<SpecificationTab
			bind:this={specificationEditor}
			{projectId}
			{dossier}
			{members}
			{actorId}
			canEdit={specEditable}
			{pageEditing}
			canValidate={canEdit && dossier.status === 'open' && !pageEditing}
			canComment={dossier.status === 'open'}
			{graph}
			actionReadings={shownActions}
			actionsRead={() => actionReadings}
			fieldsOf={(leafId) => fieldsOf(leafId)}
			labelOf={(path) => metaOf(path).label}
			journeyField={diagramField('functional_spec')}
			onDropSubject={dropSubject}
			onGoSimulation={() => advance(['draft', 'specification'], 'impact')}
		>
			{#snippet journey(editing)}{@render umlDiagram('functional_spec', 'flows', editing)}{/snippet}
			{#snippet datamap()}
				{#if dossier.data.view.tables.length > 0}
					<DataChanges {projectId} requestId={dossier.id} drafts={dossier.data.drafts} view={dossier.data.view} canEdit={false} landed={dataLanded} bare />
				<div class="flex flex-wrap gap-3.5 font-evo-mono text-xs text-ink-2">
					<span><span class="inline-block size-2.5 border border-evo-violet-edge bg-evo-violet-wash align-[-1px]"></span> Added by this evolution</span>
					<span><span class="inline-block size-2.5 border border-evo-erd-changed-edge bg-evo-erd-changed align-[-1px]"></span> Changed</span>
					<span><span class="inline-block size-2.5 border border-evo-erd-removed-edge bg-evo-erd-removed align-[-1px]"></span> Removed</span>
					<span><b class="text-orange-ink">PK</b> primary key</span>
					<span><b class="text-blue-ink">FK</b> foreign key</span>
				</div>
				{/if}
			{/snippet}
		</SpecificationTab>
	{/if}
{/snippet}

{#snippet impactTabBody()}
	<!-- What the change does to the product, read by the platform: nobody validates it, leaving it freezes a version (ac-evo-form-impact-step). -->
	{#if dossier.leafIds.length > 0 || dossier.used.length > 0}
		<ImpactReading
			{projectId}
			{dossier}
			{impacts}
			{proposes}
			canEdit={canEdit && !dossier.frozen && dossier.status === 'open'}
			{onFixNow}
			{members}
			{actorId}
			onStart={startImplementation}
			onNext={() => goToTab('development')}
		/>
	{:else}
		{@render waitingCard(
			'Step 4 · Simulation',
			'Read once the change names what it touches',
			'The impact is computed on its own from the features the change touches. Name them in Specification, or let your AI do it.',
			'specification'
		)}
		{@render tabFoot('impact')}
	{/if}
{/snippet}

{#snippet developmentBody()}
	<!-- Step 5: who develops the frozen version, then the code read against it as it is synced (ac-evo-impl-9). -->
	<DevelopmentBoard {projectId} {dossier} {report} {history} {canEdit} onReport={() => goToTab('final_report')} onImpact={() => goToTab('impact')} />
{/snippet}

{#snippet finalReportBody()}
	<!-- Step 6: the report, then how the request finishes: acceptance testing, its approval, closing it (declared live). -->
	<FinalReport
		{projectId}
		{dossier}
		{report}
		canEdit={canEdit && dossier.status === 'open'}
		{highlighted}
		{actorId}
		{members}
		{closing}
		mayEdit={canEdit}
		onDecisionLog={() => (logOpen = true)}
		onDevelopment={() => goToTab('development')}
	/>
{/snippet}

<svelte:window onkeydown={pageKey} onbeforeunload={(event) => { if (heldPageChanges > 0 || pageSaving) event.preventDefault(); }} />

<RequestBar
	title={dossier.title || 'Untitled request'}
	requestKey={dossier.key ?? null}
	tabs={barTabs}
	{openTab}
	onSelect={(id) => selectTab(id as RequestTab)}
	onBack={() => {
		if (heldPageChanges > 0 || pageSaving) pushToast({ level: 'info', message: 'Save or cancel your page edits before leaving.' });
		else onBack();
	}}
	status={barStatus}
	inProgress={dossier.status === 'open'}
	standing={barStanding}
>
	{#snippet tools()}
		<button type="button" class="{TOOL} {pageEditing ? TOOL_ON : ''}" aria-pressed={pageEditing} disabled={pageSaving || (!pageEditing && !!pageEditReason)} title={pageEditing ? 'Leave the page edit mode' : (pageEditReason ?? 'Edit every editable field on this page (Ctrl+E)')} onclick={() => pageEditing ? void cancelPage() : startPageEdit()}>
			<Icon name="pencil" size={13} />{pageEditing ? (heldPageChanges > 0 ? 'Cancel editing' : 'Stop editing') : 'Edit'}
		</button>
		{#if pageEditing && (heldPageChanges > 0 || pageSaving)}<button type="button" class="{PRIMARY} h-[30px] px-3" disabled={pageSaving || diagramSaveBlocked} title={diagramSaveBlocked ? 'Correct the diagram errors before saving the page.' : undefined} onclick={() => void savePage()}>{pageSaving ? 'Saving…' : `Save${heldPageChanges > 1 ? ` (${heldPageChanges})` : ''}`}</button>{/if}
		{#if dossier.aiDelegation.request || dossier.aiDelegation.project}
			<!-- The reader's AI validates in their name here (ac-evo-llm-delegation): a small mark, the detail on hover. -->
			<span
				class="inline-flex items-center gap-1.5 border-[1.5px] border-violet px-2.5 py-1 font-evo-mono text-xs font-bold tracking-[0.06em] text-violet-ink uppercase"
				title={`You delegated validation to your AI ${dossier.aiDelegation.request ? 'on this evolution' : 'on every evolution of the project'}${dossier.aiDelegation.since ? `, ${relativeWhen(dossier.aiDelegation.since)}` : ''}. Take it back from the settings.`}
				><Icon name="sparkles" size={12} />Your AI validates</span
			>
		{/if}
		{#if canEdit && !pageEditing}
			<!-- Cancel, reopen or delete, kept out of the way (ac-evo-req-settings). -->
			<RequestSettings requestId={dossier.id} status={dossier.status} frozen={dossier.frozen} {onDelete} aiDelegation={dossier.aiDelegation} {actorId} {isAdmin} />
		{/if}
	{/snippet}
</RequestBar>

{#if canEdit && dossier.status === 'open' && !dossier.frozen}
<EvolutionAiTool
	{fillPrompt}
	specPrompt={!specIsWritten ? specPrompt : null}
	showStep={!!barPrefill && !pageEditing}
	blocked={pageEditing ? 'Save or cancel your page edits first.' : null}
>
	{#snippet step()}
		{#if barPrefill && !pageEditing}<StepPrefillButton step={barPrefill.step} label={barPrefill.label} sections={barPrefill.sections} />{/if}
	{/snippet}
</EvolutionAiTool>
{/if}

<div id="request-top" inert={pageSaving} aria-busy={pageSaving} class="evo-motion mx-auto flex max-w-6xl scroll-mt-24 flex-col gap-8 font-evo text-[0.9375rem] leading-normal text-evo-ink">
	<!-- What an address that left nothing to open says, until the person moves on (ac-evo-link-arrival-only). -->
	<ArrivalNote top />
	{#if dossier.status === 'cancelled' && dossier.cancellation}
		<!-- A cancelled request says why, who and when; it stays readable (ac-evo-req-cancel). -->
		<p class="m-0 flex flex-wrap items-center gap-1.5 rounded-lg border-l-[6px] border-ink-3 bg-toner-2 px-3 py-2 text-[0.8125rem] text-ink-2" role="status">
			<b class="font-bold text-evo-ink">Cancelled</b>
			by {nameOf(dossier.cancellation.by)} · <time datetime={dossier.cancellation.at}>{relativeWhen(dossier.cancellation.at)}</time> · {dossier.cancellation.reason}
		</p>
	{/if}

	<!-- A step rises in as it opens, like every step of the design. -->
	{#key openTab}
		<section class="animate-lk-in flex flex-col gap-5" aria-label={tabLabel(openTab)}>
			{#if openTab === 'briefing'}{@render needBody()}
			{:else if openTab === 'solutioning'}{@render solutioningBody()}
			{:else if openTab === 'specification'}{@render specificationBody()}
			{:else if openTab === 'impact'}{@render impactTabBody()}
			{:else if openTab === 'development'}{@render developmentBody()}
			{:else}{@render finalReportBody()}{/if}
		</section>
	{/key}

	<DecisionLog
		title={`${dossier.key ?? 'EVO'} · ${dossier.title || 'Untitled request'}`}
		entries={decisionLog}
		{members}
		open={logOpen}
		onOpen={() => (logOpen = true)}
		onClose={() => (logOpen = false)}
	/>
</div>

{#if celebrating && celebration}
	<EvolutionCelebration {celebration} onClose={closeCelebration} onOpenSpec={() => closing && void goto(closing.specHref)} />
{/if}
