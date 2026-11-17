<script lang="ts">
	import PageFoot from '$ui/shell/PageFoot.svelte';
	import GlossaryText from '$ui/glossary/GlossaryText.svelte';
	import EarsText from '$ui/glossary/EarsText.svelte';
	import { untrack, type Snippet } from 'svelte';
	import { Icon, pushToast } from '$ui/design-system';
	import { DATAMAP_THREAD_KEY, elementPath, reviewActions, journeyPaths, personKey, readFunctionalDiagram, type JourneyPath, type LocalGraph, type LocalNode } from '$domain/evolution';
	import type { DossierFieldRow, DossierReading } from '$lib/server/evolution-view.server';
	import type { ActionReading } from '$lib/server/evolution-spec-actions.server';
	import { initials } from '$ui/team/team-style';
	import BlockControls, { type Stamp, type ValidateLook } from './BlockControls.svelte';
	import FieldThread from './FieldThread.svelte';
	import { useLiveSession } from './live-session.svelte';
	import SectionCard from './SectionCard.svelte';
	import { personName } from './people';
	import { STEP_FOOT_ID, bringNextToValidate, scrollToBlock } from './evo-scroll';
	import ArrivalNote from './ArrivalNote.svelte';
	import type { PendingVerdict } from './optimistic-verdict';
	import { OptimisticActs } from './optimistic-acts.svelte';
	import { useEvolutionWrites } from './evolution-writes.svelte';
	import { patchKey, type Patch, type Patches } from './dossier-overlay';
	import type { PageChanges } from './page-edit';
	import JourneyPathCard from './JourneyPathCard.svelte';
	import SectionChangeCard from './SectionChangeCard.svelte';
	import FindingLineCard from './FindingLineCard.svelte';
	import type { SectionDraftReading } from '$lib/server/evolution-section-drafts.server';
	import type { RuleDraftReading } from '$lib/server/evolution-rule-drafts.server';
	import { FINDINGS_BLOCK_NAME, RULES_PAGE_NAME, type FindingOutcome } from '$domain/evolution';
	import ValidateAllButton from './ValidateAllButton.svelte';
	import StepValidateAll from './StepValidateAll.svelte';
	import {
		CARD,
		CHANGE_CHIP,
		FOOT_BAR,
		GUIDE_BAND,
		GUIDE_DOT,
		KICKER,
		NEXT_BAND,
		NEXT_BAND_TEXT,
		PRIMARY_44,
		REST,
		SECONDARY_44,
		SECTION_TITLE,
		TAG,
		TAG_TONE,
		TEXTAREA,
		cardBorder,
		numberPill,
		primary48
	} from './evo-look';

	/**
	 * The Specification of the Evolution design, one page: 3.1 the features the
	 * request touches, 3.2 the actions of each validated feature with their
	 * rules, 3.3 the user journey, 3.4 the data. A feature is validated through
	 * its answers, an action on its own (spec-actions.ts), the journey through
	 * the Functional spec's diagram; only the next thing to validate is violet.
	 * "Validate all" at the foot signs everything of the step still waiting on
	 * the reader in one save. Every act reads at once, the request and the
	 * action readings it is given carrying what was just sent
	 * (ac-evo-form-edit-optimistic).
	 */
	type Leaf = DossierReading['leaves'][number];
	interface Props {
		projectId: string;
		dossier: DossierReading;
		members: readonly { id: string; name: string; role?: string; jobs?: readonly string[] }[];
		actorId: string;
		canEdit: boolean;
		pageEditing?: boolean;
		canValidate: boolean;
		canComment: boolean;
		graph: LocalGraph | null;
		actionReadings: Readonly<Record<string, ActionReading>>;
		/** The action readings as the server last said, which change once a verdict on an action is read back. */
		actionsRead?: () => unknown;
		fieldsOf: (leafId: string) => readonly DossierFieldRow[];
		labelOf: (path: string) => string;
		/** The Functional spec's diagram answer, validated as the journey. */
		journeyField: DossierFieldRow | null;
		/** The diagram drawn as the user journey, editable or not. */
		journey: Snippet<[boolean]>;
		/** The data the request adds, changes or removes, drawn by the app's data model. */
		datamap: Snippet;
		onDropSubject: (leaf: Leaf) => Promise<void>;
		onGoSimulation: () => void;
	}
	let { projectId, dossier, members, actorId, canEdit, pageEditing = false, canValidate, canComment, graph, actionReadings, actionsRead = () => actionReadings, fieldsOf, labelOf, journeyField, journey, datamap, onDropSubject, onGoSimulation }: Props = $props();
	const writes = useEvolutionWrites(untrack(() => projectId));
	/** Make it a comment, on an exchange of the reader with their AI (ac-evo-live-ask). */
	const live = useLiveSession();
	const publishExchange = live ? (messageId: string) => live.publish(messageId) : null;

	const nameOf = (id: string) => personName(id, members);
	const same = (a: string, b: string) => personKey(a) === personKey(b);
	const has = (list: readonly string[], id: string) => list.some((x) => same(x, id));
	const verdict = (act: PendingVerdict): Patch => ({ kind: 'verdict', verdict: act });
	/**
	 * Sends operations on the request, read at once through `patches`; true once
	 * saved. A verdict on an action reads back with the action readings, loaded
	 * after the request.
	 */
	function send(ops: Record<string, unknown>[], what: string, patches: Patches = {}, onActions = false): Promise<boolean> {
		if (ops.length === 0) return Promise.resolve(true);
		return writes.send(patches, ops.map((op) => ({ requestId: dossier.id, ...op })), what, onActions ? actionsRead : undefined);
	}

	// ---- 3.1 Features ---------------------------------------------------------
	const filledOf = (leaf: Leaf) => fieldsOf(leaf.id).filter((f) => f.filled);
	const validatorsOf = (f: DossierFieldRow) => (f.trail?.validation === 'refused' ? [] : (f.trail?.validatedBy ?? []));
	/** A feature is validated once the reader stands behind every answer it holds. */
	const featureMine = (leaf: Leaf) => filledOf(leaf).length > 0 && filledOf(leaf).every((f) => has(validatorsOf(f), actorId));
	const featureSettled = (leaf: Leaf) => filledOf(leaf).length > 0 && filledOf(leaf).every((f) => f.trail?.validation === 'validated');
	const target = (f: DossierFieldRow) => ({ fieldPath: f.path, ...(f.leafId ? { leafId: f.leafId } : {}) });
	const featureDomId = (leaf: Leaf) => `sg-feature-${leaf.id}`;
	/** Whether a block's Validate still waits on the reader: it is one a validation brings into view next (ac-evo-form-validate-next). */
	const waits = (runnable: boolean, mine: boolean, settled: boolean) => canValidate && runnable && !mine && !settled;
	/** Validating a feature signs every written answer it holds the reader is not behind yet. */
	const featureValidation = (leaf: Leaf) => {
		const waiting = filledOf(leaf).filter((f) => !has(validatorsOf(f), actorId));
		return {
			ops: waiting.map((f) => ({ op: 'validate_field', ...target(f) })),
			patches: Object.fromEntries(waiting.map((f) => [patchKey.verdict(f.path, f.leafId), verdict({ act: 'validate' })]))
		};
	};
	async function toggleFeature(leaf: Leaf) {
		if (featureMine(leaf)) {
			const given = filledOf(leaf).filter((f) => has(validatorsOf(f), actorId));
			const patches = Object.fromEntries(given.map((f) => [patchKey.verdict(f.path, f.leafId), verdict({ act: 'withdraw' })]));
			// A verdict shows on its own row, so it raises no message (criterion 8b431894).
			await send(given.map((f) => ({ op: 'withdraw_field_verdict', ...target(f) })), `the withdrawal of your validation of “${leaf.name}”`, patches);
			return;
		}
		const act = featureValidation(leaf);
		const sent = send(act.ops, `your validation of “${leaf.name}”`, act.patches);
		bringNextToValidate(featureDomId(leaf));
		await sent;
	}
	// The avatars only say who validated: only Validate validates (ac-evo-form-validators).
	function stampsOf(validators: readonly string[][], expected: readonly string[], byAi: readonly string[] = []): Stamp[] {
		const people: string[] = [];
		for (const id of [...expected, ...validators.flat()]) if (!has(people, id)) people.push(id);
		// Nobody named and nobody behind it yet: the reader is the one it waits on.
		if (people.length === 0 && canValidate) people.push(actorId);
		return people.map((id) => {
			const ok = validators.length > 0 && validators.every((list) => has(list, id));
			const name = nameOf(id);
			// Validated by the person's AI under their delegation (ac-evo-llm-delegation-marks).
			const ai = ok && has(byAi, id);
			return {
				id,
				initials: initials(name),
				ok,
				ai,
				title: `${ai ? `${name}'s AI` : name}${ok ? ' · validated' : ' · to validate'}`
			};
		});
	}
	const featureStamps = (leaf: Leaf) =>
		stampsOf(
			filledOf(leaf).map(validatorsOf),
			filledOf(leaf).flatMap((f) => f.trail?.expected ?? []),
			filledOf(leaf).flatMap((f) => f.trail?.validatedByAi ?? [])
		);

	// ---- 3.2 Actions ----------------------------------------------------------
	const featureNode = (leaf: Leaf) => `feature:${leaf.id}`;
	const actionsOf = (leaf: Leaf) => (graph ? reviewActions(graph, featureNode(leaf), (id) => actionReadings[`${elementPath(id)}@${featureNode(leaf)}`]?.trail.validation === 'refused') : []);
	const keyOf = (leaf: Leaf, action: LocalNode) => `${elementPath(action.id)}@${featureNode(leaf)}`;
	const actionDomId = (leaf: Leaf, action: LocalNode) => `sg-action-${keyOf(leaf, action)}`;
	const readingOf = (leaf: Leaf, action: LocalNode) => actionReadings[keyOf(leaf, action)] ?? null;
	const actionAct = (leaf: Leaf, action: LocalNode, act: PendingVerdict): Patches => ({ [patchKey.action(keyOf(leaf, action))]: verdict(act) });
	const actionRejected = (leaf: Leaf, action: LocalNode) => readingOf(leaf, action)?.trail.validation === 'refused';
	const actionMine = (leaf: Leaf, action: LocalNode) => {
		const r = readingOf(leaf, action);
		return !!r && r.trail.validation !== 'refused' && has(r.trail.validatedBy ?? [], actorId);
	};
	const liveActions = (leaf: Leaf) => actionsOf(leaf).filter((a) => !actionRejected(leaf, a.action));
	const actionsDone = (leaf: Leaf) => liveActions(leaf).every((a) => actionMine(leaf, a.action));
	const elementTarget = (leaf: Leaf, action: LocalNode) => ({ fieldPath: elementPath(action.id), leafId: featureNode(leaf) });
	async function toggleAction(leaf: Leaf, action: LocalNode, fingerprint: string) {
		if (!featureMine(leaf)) return pushToast({ level: 'info', message: 'Validate the feature first' });
		if (actionMine(leaf, action)) {
			await send([{ op: 'withdraw_field_verdict', ...elementTarget(leaf, action) }], `the withdrawal of your validation of “${action.label}”`, actionAct(leaf, action, { act: 'withdraw' }), true);
			return;
		}
		if (openActions === undefined) openActions = leaf.id;
		const sent = send([{ op: 'validate_field', ...elementTarget(leaf, action), value: fingerprint }], `your validation of “${action.label}”`, actionAct(leaf, action, { act: 'validate' }), true);
		bringNextToValidate(actionDomId(leaf, action));
		await sent;
	}
	/** Not wanted: the action is refused, struck through, and can be restored. */
	async function toggleReject(leaf: Leaf, action: LocalNode, fingerprint: string) {
		if (actionRejected(leaf, action)) {
			if (await send([{ op: 'withdraw_field_verdict', ...elementTarget(leaf, action) }], `the restoring of “${action.label}”`, actionAct(leaf, action, { act: 'withdraw' }), true))
				pushToast({ level: 'success', message: 'Element restored' });
			return;
		}
		const reason = 'Not wanted in the specification';
		if (await send([{ op: 'refuse_field', ...elementTarget(leaf, action), value: fingerprint, reason }], `the rejection of “${action.label}”`, actionAct(leaf, action, { act: 'refuse', reason }), true))
			pushToast({ level: 'info', message: 'Marked as not wanted: Lyriks removes it when it rewrites the specification' });
	}

	const validatedLeaves = $derived(dossier.leaves.filter(featureMine));
	/** The next best action: the first feature to validate, then the first action, then the journey. */
	const journeyMine = $derived(!!journeyField && journeyField.trail?.validation !== 'refused' && has(journeyField.trail?.validatedBy ?? [], actorId));
	const nextBest = $derived.by(() => {
		const f0 = dossier.leaves.find((l) => !featureMine(l));
		if (f0) return `f:${f0.id}`;
		for (const leaf of validatedLeaves) for (const a of liveActions(leaf)) if (!actionMine(leaf, a.action)) return `a:${a.action.id}`;
		if (journeyField?.filled && !(journeyMine && pathsMine)) return 'journey';
		if (dataChanges.length > 0 && !dataMine) return 'data';
		// A finding waits on the reader until they chose what becomes of it and validated it (ac-evo-draft-findings-read).
		return findingEntries.some((e) => !findingMine(e)) ? 'findings' : null;
	});
	const featuresDone = $derived(dossier.leaves.length > 0 && dossier.leaves.every(featureMine));
	const allActionsDone = $derived(validatedLeaves.every(actionsDone));
	const actionCount = $derived(validatedLeaves.reduce((n, l) => n + liveActions(l).length, 0));
	const actionsLeft = $derived(validatedLeaves.reduce((n, l) => n + liveActions(l).filter((a) => !actionMine(l, a.action)).length, 0));

	/** The feature whose actions are unfolded: the first with an action still to validate, until the reader picks one. */
	let openActions = $state<string | null | undefined>(undefined);
	const openFeature = $derived(
		openActions !== undefined ? openActions : (validatedLeaves.find((l) => !actionsDone(l)) ?? validatedLeaves[0])?.id ?? null
	);

	const CHIP_OF: Record<string, keyof typeof CHANGE_CHIP | 'unchanged'> = { add: 'add', amend: 'amend', remove: 'remove', added: 'add', changed: 'amend', removed: 'remove', existing: 'unchanged' };
	const chipFor = (change: string | null | undefined) => {
		const k = CHIP_OF[change ?? 'amend'] ?? 'amend';
		return k === 'unchanged' ? { word: 'UNCHANGED', look: `${TAG} ${TAG_TONE.neutral}` } : CHANGE_CHIP[k];
	};

	// The feature whose details and comments are open under its row.
	let detailOf = $state<string | null>(null);
	let threadOf = $state<string | null>(null);

	// ---- Add a feature ----------------------------------------------------------
	let adding = $state(false);
	let described = $state('');
	let wasPageEditing = $state(false);
	$effect(() => {
		const active = pageEditing;
		untrack(() => {
			if (wasPageEditing && !active) { described = ''; adding = false; journeyEditing = false; }
			wasPageEditing = active;
		});
	});
	export function pageChanges(): PageChanges {
		const text = described.trim();
		return pageEditing && text
			? { operations: [{ requestId: dossier.id, op: 'add_draft_leaf', kind: 'add', name: text.split(/[\n.]/)[0].trim().slice(0, 80), description: text }], patches: {} }
			: { operations: [], patches: {} };
	}
	/**
	 * Features added from here, shown in the list at once while the server
	 * writes their draft (its id is the server's): a row without its controls
	 * until the request is read back.
	 */
	const added = new OptimisticActs<{ name: string; description: string }>();
	let addedCount = 0;
	async function addFeature() {
		const text = described.trim();
		if (!text) return pushToast({ level: 'info', message: 'Describe the missing feature' });
		const name = text.split(/[\n.]/)[0].trim().slice(0, 80);
		described = '';
		adding = false;
		const saved = await added.run(`added:${++addedCount}`, { name, description: text }, () => send([{ op: 'add_draft_leaf', kind: 'add', name, description: text }], `the feature “${name}”`), () => dossier.leaves);
		if (saved) return void pushToast({ level: 'success', message: 'Feature added: describe its actions, or ask your AI to complete them' });
		// Not saved: the box opens again on what was written.
		described = described.trim() === '' ? text : described;
		adding = true;
	}

	// ---- 3.3 Journey --------------------------------------------------------------
	let journeyEditing = $state(false);
	/** Each path of the drawing, read and validated on its own under it (ac-evo-spec-journey-paths). */
	const paths = $derived(journeyField?.filled ? journeyPaths(readFunctionalDiagram(journeyField.value).diagram) : []);
	const pathTrail = (path: JourneyPath) => dossier.journeyPaths[path.key];
	const pathMine = (path: JourneyPath) => {
		const trail = pathTrail(path);
		return !!trail && trail.validation !== 'refused' && has(trail.validatedBy ?? [], actorId);
	};
	const pathsMine = $derived(paths.every(pathMine));
	const pathDomId = (path: JourneyPath) => `sg-path-${path.key}`;
	async function togglePath(path: JourneyPath) {
		const act = (given: PendingVerdict): Patches => ({ [patchKey.journeyPath(path.key)]: verdict(given) });
		if (pathMine(path)) {
			await send([{ op: 'withdraw_field_verdict', fieldPath: path.key }], 'the withdrawal of your validation of the path', act({ act: 'withdraw' }));
			return;
		}
		const sent = send([{ op: 'validate_field', fieldPath: path.key, value: path.fingerprint }], 'your validation of the path', act({ act: 'validate' }));
		bringNextToValidate(pathDomId(path));
		await sent;
	}

	// ---- 3.5 The other pages of the spec ----------------------------------------
	/** What the request changes on the other pages of the spec, the values before and after read live (ac-evo-draft-section-read). */
	type ChangeEntry = DossierReading['sectionChanges']['entries'][number];
	const changeEntries = $derived(dossier.sectionChanges.entries.filter((e) => e.landedAt === null));
	let changeReadings = $state<Record<string, SectionDraftReading>>({});
	let ruleReadings = $state<Record<string, RuleDraftReading>>({});
	type RuleEntry = DossierReading['ruleChanges']['entries'][number];
	const ruleEntries = $derived(dossier.ruleChanges.entries.filter((e) => e.landedAt === null));
	const changeStamp = $derived([...changeEntries, ...ruleEntries].map((e) => `${e.id}:${e.fingerprint}`).join('|'));
	$effect(() => {
		if (!changeStamp) return;
		const url = `/api/evolution?projectId=${encodeURIComponent(projectId)}&requestId=${encodeURIComponent(dossier.id)}&part=sections`;
		void fetch(url)
			.then((r) => (r.ok ? r.json() : null))
			.then((body: { sections?: SectionDraftReading[]; rules?: RuleDraftReading[] } | null) => {
				if (body?.sections) changeReadings = Object.fromEntries(body.sections.map((r) => [r.id, r]));
				if (body?.rules) ruleReadings = Object.fromEntries(body.rules.map((r) => [r.id, r]));
			})
			.catch(() => {});
	});
	type AnyChange = Pick<ChangeEntry | RuleEntry, 'id' | 'key' | 'summary' | 'trail'>;
	const changeMine = (e: AnyChange) => !!e.trail && e.trail.validation !== 'refused' && has(e.trail.validatedBy ?? [], actorId);
	const changeRejected = (e: AnyChange) => e.trail?.validation === 'refused';
	const changeDomId = (e: AnyChange) => `sg-change-${e.id.replace(/[^a-z0-9-]/gi, '')}`;
	/** A verdict on a change, read at once on its card (ac-evo-form-edit-optimistic). */
	const changePatch = (key: string, given: PendingVerdict): Patches => ({ [patchKey.verdict(key)]: verdict(given) });
	async function toggleChange(e: AnyChange) {
		if (changeMine(e) || changeRejected(e)) {
			await send([{ op: 'withdraw_field_verdict', fieldPath: e.key }], `the withdrawal of your verdict on “${e.summary}”`, changePatch(e.key, { act: 'withdraw' }));
			return;
		}
		const sent = send([{ op: 'validate_field', fieldPath: e.key }], `your validation of “${e.summary}”`, changePatch(e.key, { act: 'validate' }));
		bringNextToValidate(changeDomId(e));
		await sent;
	}
	async function rejectChange(e: AnyChange) {
		const reason = 'Not wanted in the specification';
		if (await send([{ op: 'refuse_field', fieldPath: e.key, reason }], `the rejection of “${e.summary}”`, changePatch(e.key, { act: 'refuse', reason })))
			pushToast({ level: 'info', message: 'Marked as not wanted: Lyriks takes it out when it rewrites the specification' });
	}
	const waitingChanges = $derived(canValidate ? [...changeEntries, ...ruleEntries].filter((e) => !changeMine(e) && !changeRejected(e)) : []);
	const waitingRules = $derived(waitingChanges.filter((e) => ruleEntries.some((r) => r.id === e.id)));
	/** A change to the rules read as a card: each rule before and after, one EARS sentence each. */
	const ruleCard = (r: RuleDraftReading) => ({ id: r.id, pageName: RULES_PAGE_NAME, summary: r.summary, noLongerApplies: null, changes: r.changes });
	// ---- 3.7 The findings of Project health the request settles (ac-evo-draft-findings-read) ----
	type FindingEntry = NonNullable<DossierReading['findingChanges']>['entries'][number];
	const findingEntries = $derived((dossier.findingChanges?.entries ?? []).filter((e) => e.landedAt === null));
	const findingMine = (e: FindingEntry) => !!e.trail && e.trail.validation !== 'refused' && has(e.trail.validatedBy ?? [], actorId);
	const findingDomId = (e: FindingEntry) => `sg-finding-${e.findingId.replace(/[^a-z0-9-]/gi, '')}`;
	/** Lines a person can validate now: what becomes of them is chosen and they have not validated it. */
	const waitingFindings = $derived(canValidate ? findingEntries.filter((e) => e.outcome !== 'undecided' && !findingMine(e)) : []);
	async function toggleFinding(e: FindingEntry) {
		if (findingMine(e)) {
			await send([{ op: 'withdraw_field_verdict', fieldPath: e.key }], `the withdrawal of your verdict on “${e.title}”`, changePatch(e.key, { act: 'withdraw' }));
			return;
		}
		const sent = send([{ op: 'validate_field', fieldPath: e.key }], `your validation of “${e.title}”`, changePatch(e.key, { act: 'validate' }));
		bringNextToValidate(findingDomId(e));
		await sent;
	}
	const chooseFinding = (e: FindingEntry) => (outcome: FindingOutcome, reason: string) =>
		void send([{ op: 'update_finding_draft', findingDraftId: e.id, outcome, ...(reason || outcome === 'kept' ? { reason } : {}) }], `what becomes of “${e.title}”`);
	const findingsAct = () => ({
		ops: waitingFindings.map((e) => ({ op: 'validate_field', fieldPath: e.key })),
		patches: Object.assign({}, ...waitingFindings.map((e) => changePatch(e.key, { act: 'validate' }))) as Patches
	});
	const changesAct = () => ({
		ops: waitingChanges.map((e) => ({ op: 'validate_field', fieldPath: e.key })),
		patches: Object.assign({}, ...waitingChanges.map((e) => changePatch(e.key, { act: 'validate' }))) as Patches
	});

	// ---- 3.4 Datamap -----------------------------------------------------------
	/** The data changes the request makes, validated as one section (criterion 3d4f23dd). */
	type DataChange = NonNullable<DossierReading['data']['changes']>[number];
	const dataChanges = $derived(dossier.data.changes ?? []);
	const hasDataDiagram = $derived(dossier.data.view.tables.length > 0);
	const dataWasApplied = $derived(dossier.data.drafts.some(d => d.materialisedAt !== null));
	const dataChangeMine = (c: DataChange) => !!c.trail && c.trail.validation !== 'refused' && has(c.trail.validatedBy ?? [], actorId);
	const dataMine = $derived(dataChanges.length > 0 && dataChanges.every(dataChangeMine));
	const dataSettled = $derived(dataChanges.length > 0 && dataChanges.every((c) => c.trail?.validation === 'validated'));
	const waitingData = $derived(canValidate ? dataChanges.filter((c) => !dataChangeMine(c)) : []);
	const dataAct = (list: readonly DataChange[], act: 'validate' | 'withdraw') => ({
		ops: list.map((c) => ({ op: act === 'validate' ? 'validate_field' : 'withdraw_field_verdict', fieldPath: c.key })),
		patches: Object.assign({}, ...list.map((c) => changePatch(c.key, { act }))) as Patches
	});
	async function toggleData() {
		if (dataMine) {
			const back = dataAct(dataChanges, 'withdraw');
			await send(back.ops, 'the withdrawal of your validation of the datamap', back.patches);
			return;
		}
		const given = dataAct(waitingData, 'validate');
		const sent = send(given.ops, 'your validation of the datamap', given.patches);
		bringNextToValidate('sg-data');
		await sent;
	}
	/** The datamap's one discussion (criterion 3d4f23dd). */
	const dataTarget = { fieldPath: DATAMAP_THREAD_KEY, leafId: null };
	const dataTopics = $derived((dossier.data.thread?.messages ?? []).filter((m) => !m.replyTo));
	const dataOpenTopics = $derived(dataTopics.filter((m) => m.ruling?.state !== 'resolved').length);
	const dataValidate = $derived(
		dataChanges.length === 0
			? null
			: {
					look: (dataSettled ? 'done' : dataMine ? 'mine' : 'grey') as ValidateLook,
					title: dataMine ? 'You validated the data changes · click to withdraw' : 'Validate the data changes',
					run: canValidate ? () => void toggleData() : null,
					withdraws: dataMine,
					stamps: stampsOf(
						dataChanges.map((c) => c.trail?.validatedBy ?? []),
						dataChanges.flatMap((c) => c.trail?.expected ?? []),
						dataChanges.flatMap((c) => c.trail?.validatedByAi ?? [])
					),
					settled: dataSettled
				}
	);

	// ---- Validate all, section by section --------------------------------------
	// What each section still waits on the reader for: an empty element and a rejected one are left out.
	const waitingFeatures = $derived(canValidate ? dossier.leaves.filter((l) => filledOf(l).length > 0 && !featureMine(l)) : []);
	const waitingActions = $derived(
		canValidate ? validatedLeaves.flatMap((leaf) => actionsOf(leaf).filter((a) => !actionRejected(leaf, a.action) && !actionMine(leaf, a.action)).map((spec) => ({ leaf, spec }))) : []
	);
	const journeyWaits = $derived(canValidate && !!journeyField?.filled && journeyField.trail?.validation !== 'refused' && !journeyMine);
	const waitingPaths = $derived(canValidate ? paths.filter((p) => !pathMine(p)) : []);
	const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

	/** What validating these elements sends and reads at once, section by section or the whole step. */
	const featuresAct = (leaves: readonly Leaf[]) => {
		const acts = leaves.map(featureValidation);
		return { ops: acts.flatMap((a) => a.ops), patches: Object.assign({}, ...acts.map((a) => a.patches)) as Patches };
	};
	const actionsAct = (waiting: readonly { leaf: Leaf; spec: ReturnType<typeof reviewActions>[number] }[]) => ({
		ops: waiting.map(({ leaf, spec }) => ({ op: 'validate_field', ...elementTarget(leaf, spec.action), value: spec.fingerprint })),
		patches: Object.assign({}, ...waiting.map(({ leaf, spec }) => actionAct(leaf, spec.action, { act: 'validate' }))) as Patches
	});
	const journeyAct = () => ({
		ops: [
			...(journeyWaits && journeyField ? [{ op: 'validate_field', ...target(journeyField) }] : []),
			...waitingPaths.map((path) => ({ op: 'validate_field', fieldPath: path.key, value: path.fingerprint }))
		],
		patches: {
			...(journeyWaits && journeyField ? { [patchKey.verdict(journeyField.path, journeyField.leafId)]: verdict({ act: 'validate' }) } : {}),
			...Object.fromEntries(waitingPaths.map((path) => [patchKey.journeyPath(path.key), verdict({ act: 'validate' })]))
		} as Patches
	});

	/** One save for every element of a section, read validated at once, then on to what waits after the section. */
	async function validateAll(fromId: string, act: { ops: Record<string, unknown>[]; patches: Patches }, what: string, said: string, onActions = false) {
		if (act.ops.length === 0) return;
		const sent = send(act.ops, what, act.patches, onActions);
		bringNextToValidate(fromId);
		if (await sent) pushToast({ level: 'success', message: said });
	}
	const validateAllFeatures = () =>
		validateAll('sg-features', featuresAct(waitingFeatures), 'your validation of the features', `You validated ${plural(waitingFeatures.length, 'feature')}`);
	const validateAllActions = () =>
		validateAll('sg-actions', actionsAct(waitingActions), 'your validation of the actions', `You validated ${plural(waitingActions.length, 'action')} and their rules`, true);
	const validateAllJourney = () =>
		validateAll(
			'sg-diagram',
			journeyAct(),
			'your validation of the journey',
			journeyWaits ? `You validated the journey and ${plural(waitingPaths.length, 'path')}` : `You validated ${plural(waitingPaths.length, 'path')}`
		);

	/**
	 * Validate all of the step: the features waiting on the reader, the actions
	 * of every feature the reader stands behind once they are, the journey and
	 * its paths, in one save; empty and rejected elements are left out.
	 */
	const stepActions = $derived(
		canValidate
			? dossier.leaves
					.filter((l) => featureMine(l) || waitingFeatures.includes(l))
					.flatMap((leaf) => actionsOf(leaf).filter((a) => !actionRejected(leaf, a.action) && !actionMine(leaf, a.action)).map((spec) => ({ leaf, spec })))
			: []
	);
	const stepParts = $derived([
		{ count: waitingFeatures.length, one: 'feature' },
		{ count: stepActions.length, one: 'action' },
		{ count: journeyWaits ? 1 : 0, one: 'journey', definite: true },
		{ count: waitingPaths.length, one: 'path' },
		{ count: waitingData.length > 0 ? 1 : 0, one: 'datamap', definite: true },
		{ count: waitingChanges.length, one: 'change' },
		{ count: waitingFindings.length, one: 'finding' }
	]);
	async function validateStep() {
		const parts = [featuresAct(waitingFeatures), actionsAct(stepActions), journeyAct(), dataAct(waitingData, 'validate'), changesAct(), findingsAct()];
		const ops = parts.flatMap((p) => p.ops);
		if (ops.length === 0) return;
		const sent = send(ops, 'your validation of the Specification', Object.assign({}, ...parts.map((p) => p.patches)), stepActions.length > 0);
		// Nothing of the step waits on the reader any more: on to the step's call to action, which pulses (ac-evo-form-validate-next).
		bringNextToValidate(STEP_FOOT_ID);
		if (await sent) pushToast({ level: 'success', message: 'You validated the Specification' });
	}

	const go = (id: string, previous: string | null = null) => scrollToBlock(id, previous);
	const allValidated = $derived(nextBest === null && featuresDone);
</script>

{#snippet actionRow(leaf: Leaf, spec: ReturnType<typeof reviewActions>[number])}
	{@const reading = readingOf(leaf, spec.action)}
	{@const rejected = actionRejected(leaf, spec.action)}
	{@const mine = actionMine(leaf, spec.action)}
	{@const settled = !!reading && reading.trail.validation === 'validated'}
	{@const chip = rejected ? CHANGE_CHIP.rejected : chipFor(spec.action.status)}
	{@const key = keyOf(leaf, spec.action)}
	{@const topics = (reading?.thread?.messages ?? []).filter((m) => !m.replyTo)}
	{@const open = topics.filter((m) => m.ruling?.state !== 'resolved').length}
	<div id={actionDomId(leaf, spec.action)} class="flex scroll-mt-36 flex-col gap-1.5 rounded-xl bg-evo-sunken px-4 py-3.5" data-evo-waits={waits(!rejected, mine, settled) || null}>
		<div class="flex flex-wrap items-center gap-2.5">
			<span class="flex-none font-evo-mono text-xs tracking-[0.08em] text-evo-muted">ACTION</span>
			<span class="flex-none px-[7px] py-0.5 text-[0.625rem] font-bold {chip.look}">{chip.word}</span>
			<span class="min-w-0 flex-[1_1_260px] text-[0.9375rem] font-bold leading-normal {rejected || spec.action.status === 'removed' ? 'text-evo-faint line-through' : ''}">{spec.action.label}</span>
			<BlockControls
				comments={canComment ? { count: open, resolvedOnly: open === 0 && topics.length > 0, open: threadOf === key, toggle: () => (threadOf = threadOf === key ? null : key) } : null}
				validate={rejected
					? null
					: {
							look: (settled ? 'done' : mine ? 'mine' : 'grey') as ValidateLook,
							title: mine ? 'You validated this action · click to withdraw' : 'Validate this action and its rules',
							run: canValidate ? () => void toggleAction(leaf, spec.action, spec.fingerprint) : null,
							withdraws: mine,
							stamps: stampsOf([reading?.trail.validatedBy ?? []], reading?.trail.expected ?? [], reading?.trail.validatedByAi ?? []),
							settled
						}}
			>
				{#snippet between()}
					{#if canValidate}
						<button
							type="button"
							class="quiet h-8 rounded-lg px-2.5 {rejected ? 'text-evo-ink' : 'text-red-ink'}"
							title={rejected ? 'Restore this element' : 'Not wanted: remove it from the specification'}
							onclick={() => void toggleReject(leaf, spec.action, spec.fingerprint)}>{rejected ? 'Restore' : 'Reject'}</button
						>
					{/if}
				{/snippet}
			</BlockControls>
		</div>
		{#if spec.rules.length > 0}
			<div class="mt-1 flex flex-col gap-1 border-l-2 border-line pl-3.5">
				{#each spec.rules as rule (rule.id)}
					{@const ruleChip = chipFor(rule.status)}
					<div class="flex flex-wrap items-center gap-2.5 py-1.5 text-sm">
						<span class="flex-none bg-toner-2 px-2 py-0.5 font-evo-mono text-[0.6875rem] font-bold tracking-[0.06em] text-ink-2 uppercase">Rule</span>
						<span class="flex-none px-[7px] py-0.5 text-[0.625rem] font-bold {ruleChip.look}">{ruleChip.word}</span>
						<span class="min-w-0 flex-[1_1_260px] leading-normal {rejected || rule.status === 'removed' ? 'text-evo-faint line-through' : ''}"><EarsText text={rule.label} /></span>
					</div>
				{/each}
			</div>
		{/if}
		{#if threadOf === key}
			<FieldThread
				label={spec.action.label}
				messages={reading?.thread?.messages ?? []}
				{members}
				{actorId}
				{canComment}
				focusOnOpen
				ask={live?.asker(() => elementTarget(leaf, spec.action)) ?? null}
				onpublish={publishExchange}
				onpost={(body, replyTo) => send([{ op: 'post_on_field', ...elementTarget(leaf, spec.action), body, ...(replyTo ? { replyTo } : {}) }], replyTo ? 'your reply' : 'your comment')}
				ondecide={canEdit ? (messageId, decision) => send([{ op: 'decide_thread_suggestion', ...elementTarget(leaf, spec.action), messageId, decision }], decision === 'accept' ? 'the suggestion accepted' : 'the suggestion refused') : null}
				onrule={(messageId, ruling) =>
					send(
						[{ op: ruling === 'validated' ? 'validate_topic' : ruling === 'resolved' ? 'resolve_topic' : 'reopen_topic', ...elementTarget(leaf, spec.action), messageId }],
						ruling === 'open' ? 'the reopening of the comment' : `the comment ${ruling}`
					)}
			/>
		{/if}
	</div>
{/snippet}

<!-- 3.1 Features -->
<div id="sg-features" class="{CARD} {REST} {cardBorder(false)} group/section scroll-mt-36 animate-lk-fade">
	<div class="flex flex-wrap items-center gap-3">
		<span class={numberPill(featuresDone)}>3.1</span><h3 class={SECTION_TITLE}>Features</h3>
		<ValidateAllButton count={waitingFeatures.length} what="features" onclick={() => void validateAllFeatures()} />
	</div>
	{#if dossier.leaves.some((l) => !featureMine(l))}
		{@const left = dossier.leaves.filter((l) => !featureMine(l)).length}
		<div class={GUIDE_BAND}>
			<span aria-hidden="true" class={GUIDE_DOT}></span>
			<span>{left === dossier.leaves.length ? `Lyriks created ${left} ${left === 1 ? 'feature' : 'features'} from the Solution. Review them and validate each one.` : `${left} of ${dossier.leaves.length} features still to validate.`}</span>
		</div>
	{/if}
	<div class="flex flex-col gap-2.5">
		{#each dossier.leaves as leaf (leaf.id)}
			{@const chip = chipFor(leaf.change)}
			{@const mine = featureMine(leaf)}
			{@const settled = featureSettled(leaf)}
			{@const fields = fieldsOf(leaf.id)}
			{@const topics = fields.flatMap((f) => f.thread?.messages ?? []).filter((m) => !m.replyTo)}
			{@const open = topics.filter((m) => m.ruling?.state !== 'resolved').length}
			<div id={featureDomId(leaf)} class="flex scroll-mt-36 flex-col gap-3" data-evo-waits={waits(filledOf(leaf).length > 0, mine, settled) || null}>
				<!-- What a link to a suggestion decided since on this feature says (ac-leaf-6709493f). -->
				<ArrivalNote anchor={featureDomId(leaf)} />
				<div class="flex flex-wrap items-center gap-4 rounded-evo-card border bg-paper px-[18px] py-3.5 {detailOf === leaf.id ? 'border-2 border-ink' : settled && actionsDone(leaf) ? 'border-line shadow-[inset_6px_0_0_var(--color-green)]' : 'border-line'}">
					<span class="w-[86px] flex-none justify-center px-[9px] py-[3px] text-center text-[0.6875rem] {chip.look}">{chip.word}</span>
					<span class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
						<span class="text-base font-bold {leaf.change === 'remove' ? 'text-evo-faint line-through' : ''}">{leaf.name}</span>
						{#if leaf.description}<span class="text-[0.8125rem] text-evo-muted"><GlossaryText text={leaf.description} /></span>{/if}
					</span>
					{#if settled && actionsDone(leaf)}<span class="font-evo-mono text-xs font-bold tracking-[0.06em] text-green-ink uppercase">✓ Fully validated</span>{/if}
					<BlockControls
						comments={canComment ? { count: open, resolvedOnly: open === 0 && topics.length > 0, open: detailOf === leaf.id, toggle: () => (detailOf = detailOf === leaf.id ? null : leaf.id) } : null}
						validate={{
							look: settled ? 'done' : mine ? 'mine' : 'grey',
							title: mine ? 'You validated this feature · click to withdraw' : 'Validate this feature',
							run: canValidate && filledOf(leaf).length > 0 ? () => void toggleFeature(leaf) : null,
							withdraws: mine,
							stamps: featureStamps(leaf),
							settled
						}}
					>
						{#snippet between()}
							{#if canEdit}
								<button type="button" class="quiet h-8 rounded-lg px-2.5 text-red-ink" title="Not wanted: take it out of the request" onclick={() => void onDropSubject(leaf)}>Reject</button>
							{/if}
						{/snippet}
					</BlockControls>
				</div>
				{#if detailOf === leaf.id}
					<!-- What the feature says, answer by answer, and what was said about it. -->
					<div id="sg-detail" class="{CARD} {REST} {cardBorder(false)} scroll-mt-36 animate-lk-in">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
								<span class="flex items-center gap-2"><span class="px-[9px] py-[3px] text-[0.6875rem] {chip.look}">{chip.word}</span></span>
								<h3 class={SECTION_TITLE}>{leaf.name}</h3>
								{#if leaf.description}<span class="text-sm text-evo-ink-3"><GlossaryText text={leaf.description} /></span>{/if}
							</div>
							<button type="button" class="size-9 rounded-lg border-[1.5px] border-line text-xl text-ink hover:border-ink" aria-label="Close" onclick={() => (detailOf = null)}>×</button>
						</div>
						{#if !mine}
							<div class="flex flex-wrap items-center justify-between gap-2.5 rounded-evo-btn border-l-[6px] border-orange bg-orange-tint px-3.5 py-2.5 text-sm text-orange-ink">
								<span>Validate the feature first, then each action with its rules.</span>
								{#if canValidate && filledOf(leaf).length > 0}<button type="button" class="pressable h-8 border-[1.5px] border-ink bg-evo-violet px-3.5 text-xs font-bold tracking-[0.07em] text-paper uppercase" onclick={() => void toggleFeature(leaf)}>Validate the feature</button>{/if}
							</div>
						{/if}
						{#each fields.filter((f) => f.filled) as field (field.path)}
							<div class="flex flex-col gap-1.5">
								<span class={KICKER}>{labelOf(field.path)}</span>
								<p class="whitespace-pre-line leading-relaxed">{'origin' in field && field.origin && field.origin.request.length > 0 ? field.origin.request.join('\n') : field.value}</p>
							</div>
						{/each}
						{#if canComment}
							<FieldThread
								label={leaf.name}
								messages={[...fields.flatMap((f) => f.thread?.messages ?? [])].sort((x, y) => x.postedAt.localeCompare(y.postedAt))}
								{members}
								{actorId}
								{canComment}
								ask={live?.asker((replyTo) => {
									const owner = (replyTo && fields.find((f) => f.thread?.messages.some((m) => m.id === replyTo))) || fields[0];
									return { fieldPath: owner.path, leafId: owner.leafId ?? null };
								}) ?? null}
								onpublish={publishExchange}
								onpost={(body, replyTo) => {
									const owner = (replyTo && fields.find((f) => f.thread?.messages.some((m) => m.id === replyTo))) || fields[0];
									return send([{ op: 'post_on_field', ...target(owner), body, ...(replyTo ? { replyTo } : {}) }], replyTo ? 'your reply' : 'your comment');
								}}
								ondecide={canEdit ? (messageId, decision) => send([{ op: 'decide_thread_suggestion', ...target(fields[0]), messageId, decision }], decision === 'accept' ? 'the suggestion accepted' : 'the suggestion refused') : null}
								onrule={(messageId, ruling) =>
									send([
										{
											op: ruling === 'validated' ? 'validate_topic' : ruling === 'resolved' ? 'resolve_topic' : 'reopen_topic',
											...target(fields.find((f) => f.thread?.messages.some((m) => m.id === messageId)) ?? fields[0]),
											messageId
										}
									], ruling === 'open' ? 'the reopening of the comment' : `the comment ${ruling}`)}
							/>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		{#each Object.entries(added.all) as [key, feature] (key)}
			<!-- Added a moment ago: read at once while the server writes its draft, its controls once it is read back (ac-evo-form-edit-optimistic). -->
			<div class="flex flex-wrap items-center gap-4 rounded-evo-card border border-line bg-paper px-[18px] py-3.5" aria-busy="true">
				<span class="w-[86px] flex-none justify-center px-[9px] py-[3px] text-center text-[0.6875rem] {CHANGE_CHIP.add.look}">{CHANGE_CHIP.add.word}</span>
				<span class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
					<span class="text-base font-bold">{feature.name}</span>
					{#if feature.description !== feature.name}<span class="text-[0.8125rem] text-evo-muted"><GlossaryText text={feature.description} /></span>{/if}
				</span>
			</div>
		{/each}
		{#each dossier.used as used (used.id)}
			<!-- What the diagrams use as it stands: read with the rest, asked nothing. -->
			<div class="flex flex-wrap items-center gap-4 rounded-evo-card border border-line bg-paper px-[18px] py-3.5">
				<span class="w-[86px] flex-none justify-center px-[9px] py-[3px] text-center text-[0.6875rem] {TAG} {TAG_TONE.neutral}">UNCHANGED</span>
				<span class="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
					<span class="text-base font-bold">{used.name ?? used.id}</span>
					<span class="text-[0.8125rem] text-evo-muted">{used.name === null ? 'No longer in the product: take the link off in the diagram.' : 'Used by the diagram as it stands.'}</span>
				</span>
			</div>
		{/each}
	</div>
	{#if canEdit}
		<div class="flex flex-col gap-2.5 rounded-xl {adding ? 'border-[1.5px] border-dashed border-ink-3 bg-paper px-4 py-3' : ''}">
			<button type="button" class="flex min-h-9 items-center gap-1.5 self-start px-1 text-sm font-semibold text-evo-violet-ink" aria-expanded={adding} onclick={() => (adding = !adding)}>
				<span aria-hidden="true" class="inline-block transition-transform duration-200 {adding ? 'rotate-90' : ''}">▸</span>Add a feature
			</button>
			{#if adding || pageEditing}
				<div class="animate-lk-in-fast flex flex-col gap-2">
					<textarea rows="2" class={TEXTAREA} aria-label="Add a feature" placeholder="Describe the missing feature" bind:value={described}></textarea>
					{#if !pageEditing}<div class="flex flex-wrap justify-end gap-2">
						<button type="button" class={SECONDARY_44} onclick={() => ((adding = false), (described = ''))}>Cancel</button>
						<button type="button" class={PRIMARY_44} onclick={() => void addFeature()}>Add the feature</button>
					</div>{/if}
				</div>
			{/if}
		</div>
	{/if}
	{#if featuresDone && !allActionsDone}
		<div class={NEXT_BAND}>
			<span class={NEXT_BAND_TEXT}>Section 3.1 validated.</span>
			<button type="button" class={PRIMARY_44} onclick={() => go('sg-actions')}>Next: 3.2 Actions →</button>
		</div>
	{/if}
</div>

<!-- 3.2 Actions: absent when the Features reading has no row. -->
{#if dossier.leaves.length > 0 || dossier.used.length > 0 || Object.keys(added.all).length > 0}
<div id="sg-actions" class="{CARD} {REST} {cardBorder(false)} group/section scroll-mt-36 animate-lk-fade">
	<div class="flex flex-wrap items-center gap-3">
		<span class={numberPill(validatedLeaves.length > 0 && allActionsDone && featuresDone)}>3.2</span><h3 class={SECTION_TITLE}>Actions</h3>
		<ValidateAllButton count={waitingActions.length} what="actions" onclick={() => void validateAllActions()} />
	</div>
	{#if validatedLeaves.length > 0 && actionsLeft > 0}
		<div class={GUIDE_BAND}>
			<span aria-hidden="true" class={GUIDE_DOT}></span>
			<span>{actionsLeft === actionCount ? `${actionCount} actions with their rules come from the validated features. Validate each action and its rules.` : `${actionsLeft} of ${actionCount} actions still to validate.`}</span>
		</div>
	{/if}
	{#if validatedLeaves.length === 0}
		<div class="flex flex-wrap items-center justify-between gap-3 rounded-evo-btn bg-evo-sunken px-3.5 py-3">
			<span class="text-sm text-evo-ink-3">Validate at least one feature to review its actions.</span>
			<button type="button" class="pressable min-h-10 rounded-evo-btn border-[1.5px] border-ink bg-transparent px-4 text-xs font-bold tracking-[0.07em] text-evo-ink uppercase" onclick={() => go('sg-features')}>← Back to features</button>
		</div>
	{/if}
	{#each validatedLeaves as leaf, i (leaf.id)}
		{@const chip = chipFor(leaf.change)}
		{@const open = openFeature === leaf.id}
		{@const live = liveActions(leaf)}
		{@const done = actionsDone(leaf)}
		{@const following = [...validatedLeaves.slice(i + 1), ...validatedLeaves.slice(0, i)].find((l) => !actionsDone(l))}
		<!-- Folded, a feature with actions still to validate waits as one block; unfolded, each of its actions does. -->
		<div
			id="sg-actions-{leaf.id}"
			class="scroll-mt-36 overflow-hidden rounded-evo-card bg-paper {open ? 'border-2 border-ink' : done ? 'border border-line shadow-[inset_6px_0_0_var(--color-green)]' : 'border border-line'}"
			data-evo-waits={waits(!open, done, false) || null}
		>
			<button type="button" class="flex min-h-15 w-full flex-wrap items-center gap-3.5 px-5 py-3.5 text-left" aria-expanded={open} onclick={() => (openActions = open ? null : leaf.id)}>
				<span class="w-[86px] flex-none justify-center px-[9px] py-[3px] text-center text-[0.6875rem] {chip.look}">{chip.word}</span>
				<span class="min-w-0 flex-[1_1_260px] text-base font-bold">{leaf.name}</span>
				<span class="font-evo-mono text-[0.8125rem] font-bold {done ? 'text-green-ink' : 'text-evo-muted'}">{done ? '✓ All actions validated' : `${live.filter((a) => actionMine(leaf, a.action)).length} / ${live.length} validated`}</span>
				<span aria-hidden="true" class="grid size-7 flex-none place-items-center text-evo-muted transition-transform duration-200 {open ? 'rotate-180' : ''}"><Icon name="chevron-down" size={18} /></span>
			</button>
			{#if open}
				<div class="animate-lk-in flex flex-col gap-3 border-t border-line px-5 pb-5 pt-4">
					{#each actionsOf(leaf) as spec (spec.action.id)}
						{@render actionRow(leaf, spec)}
					{:else}
						<p class="text-[0.8125rem] text-ink-3 italic">No action modelled yet: Lyriks writes the actions and rules of this feature from the Solution.</p>
					{/each}
					{#if done}
						<div class={NEXT_BAND}>
							<span class={NEXT_BAND_TEXT}>{following ? `All actions of “${leaf.name}” are validated.` : 'All actions are validated.'}</span>
							<button
								type="button"
								class={PRIMARY_44}
								onclick={() => {
									if (following) {
										openActions = following.id;
										go('sg-actions');
									} else go('sg-diagram');
								}}>{following ? `Next feature: ${following.name} →` : 'Discover the journey →'}</button
							>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/each}
	{#if validatedLeaves.length > 0 && featuresDone && allActionsDone && !(journeyMine && pathsMine)}
		<div class={NEXT_BAND}>
			<span class={NEXT_BAND_TEXT}>Section 3.2 validated.</span>
			<button type="button" class={PRIMARY_44} onclick={() => go('sg-diagram')}>Next: 3.3 Journey →</button>
		</div>
	{/if}
</div>
{/if}

<!-- 3.3 Journey -->
{#if journeyField}
	<SectionCard
		{projectId}
		requestId={dossier.id}
		domId="sg-diagram"
		number="3.3"
		title="Journey"
		answers={[journeyField]}
		{members}
		{actorId}
		canEdit={canEdit && journeyField.trail?.validation !== 'validated'}
		{canValidate}
		{canComment}
		editing={journeyEditing || (pageEditing && canEdit && journeyField.trail?.validation !== 'validated')}
		{pageEditing}
		onEdit={(on) => (journeyEditing = on)}
		onSave={async () => true}
		next={null}
	>
		{#snippet read()}
			<!-- What the section's own controls validate: their tab goes once it has scrolled past, the paths keeping theirs. -->
			<div class="rounded-xl p-[18px]" data-controls-cover>{@render journey(false)}</div>
			{#if paths.length > 0}
				<!-- The drawing explains the whole at once; each path is read and validated on its own under it (ac-evo-spec-journey-paths). -->
				<div class="flex flex-col gap-2.5">
					<div class="flex flex-wrap items-center gap-3">
						<span class={KICKER}>PATHS · {paths.length}</span>
						<ValidateAllButton count={waitingPaths.length + (journeyWaits ? 1 : 0)} what="elements" onclick={() => void validateAllJourney()} />
					</div>
					{#each paths as path, i (path.key)}
						{@const trail = pathTrail(path)}
						{@const mine = pathMine(path)}
						{@const settled = trail?.validation === 'validated'}
						<JourneyPathCard
							domId={pathDomId(path)}
							number={i + 1}
							{path}
							validate={{
								look: (settled ? 'done' : mine ? 'mine' : 'grey') as ValidateLook,
								title: mine ? 'You validated this path · click to withdraw' : 'Validate this path',
								run: canValidate ? () => void togglePath(path) : null,
								withdraws: mine,
								stamps: stampsOf([trail?.validatedBy ?? []], trail?.expected ?? [], trail?.validatedByAi ?? []),
								settled
							}}
						/>
					{/each}
				</div>
			{/if}
			{#if journeyMine && pathsMine}
				<div class={NEXT_BAND}>
					<span class={NEXT_BAND_TEXT}>Section 3.3 validated.</span>
					<button type="button" class={PRIMARY_44} onclick={() => go('sg-data')}>Next: 3.4 Datamap →</button>
				</div>
			{/if}
		{/snippet}
		{#snippet edit()}<div class="rounded-xl p-[18px]">{@render journey(true)}</div>{/snippet}
	</SectionCard>
{/if}

<!-- 3.4 Datamap -->
<div id="sg-data" class="scroll-mt-36 animate-lk-fade {hasDataDiagram ? `${CARD} ${REST} ${cardBorder(dataSettled)}` : 'flex flex-col gap-3'}" data-evo-waits={(hasDataDiagram && waitingData.length > 0) || null}>
	<div class="flex flex-wrap items-center justify-between gap-3">
		{#if hasDataDiagram}
			<div class="flex items-center gap-3"><span class={numberPill(dataSettled)}>{dataSettled ? '✓' : '3.4'}</span><h3 class={SECTION_TITLE}>Datamap</h3></div>
		{:else}<p class="m-0 text-[0.8125rem] text-ink-3 italic">{dataWasApplied ? 'Written into the Data model when the change went live.' : 'This evolution changes no data.'}</p>{/if}
		<!-- One validation stands behind every change the request makes to the data (criterion 3d4f23dd). -->
		<BlockControls
			comments={canComment
				? { count: dataOpenTopics, resolvedOnly: dataOpenTopics === 0 && dataTopics.length > 0, open: threadOf === DATAMAP_THREAD_KEY, toggle: () => (threadOf = threadOf === DATAMAP_THREAD_KEY ? null : DATAMAP_THREAD_KEY) }
				: null}
			validate={hasDataDiagram ? dataValidate : null}
		/>
	</div>
	{#if hasDataDiagram}{@render datamap()}{/if}
	{#if threadOf === DATAMAP_THREAD_KEY}
		<FieldThread
			label="Datamap"
			messages={dossier.data.thread?.messages ?? []}
			{members}
			{actorId}
			{canComment}
			focusOnOpen
			ask={live?.asker(() => dataTarget) ?? null}
			onpublish={publishExchange}
			onpost={(body, replyTo) => send([{ op: 'post_on_field', ...dataTarget, body, ...(replyTo ? { replyTo } : {}) }], replyTo ? 'your reply' : 'your comment')}
			ondecide={canEdit ? (messageId, decision) => send([{ op: 'decide_thread_suggestion', ...dataTarget, messageId, decision }], decision === 'accept' ? 'the suggestion accepted' : 'the suggestion refused') : null}
			onrule={(messageId, ruling) =>
				send(
					[{ op: ruling === 'validated' ? 'validate_topic' : ruling === 'resolved' ? 'resolve_topic' : 'reopen_topic', ...dataTarget, messageId }],
					ruling === 'open' ? 'the reopening of the comment' : `the comment ${ruling}`
				)}
		/>
	{/if}
</div>

{#snippet changeCard(entry: AnyChange, i: number, reading: Parameters<typeof ruleCard>[0] | SectionDraftReading | undefined, asCard: (() => ReturnType<typeof ruleCard> | SectionDraftReading) | null)}
	{@const mine = changeMine(entry)}
	{@const settled = entry.trail?.validation === 'validated'}
	{#if reading && asCard}
		<SectionChangeCard
			domId={changeDomId(entry)}
			number={i + 1}
			change={asCard()}
			validate={{
				look: (settled ? 'done' : mine ? 'mine' : 'grey') as ValidateLook,
				title: mine ? 'You validated this change · click to withdraw' : 'Validate this change',
				run: canValidate ? () => void toggleChange(entry) : null,
				withdraws: mine,
				stamps: stampsOf([entry.trail?.validatedBy ?? []], entry.trail?.expected ?? [], entry.trail?.validatedByAi ?? []),
				settled
			}}
		/>
		{#if canValidate && !mine && !settled}
			<button type="button" class="quiet self-end text-red-ink" onclick={() => void (changeRejected(entry) ? toggleChange(entry) : rejectChange(entry))}>
				{changeRejected(entry) ? 'Restore this change' : 'Reject this change'}
			</button>
		{/if}
	{:else}
		<div class="rounded-xl bg-evo-sunken px-4 py-3.5 text-sm text-evo-muted"><GlossaryText text={entry.summary} /></div>
	{/if}
{/snippet}

{#if changeEntries.length > 0}
	<!-- 3.5 The other pages of the spec: each change named by its page, its values before and after (ac-evo-draft-section-read). -->
	<div id="sg-pages" class="{CARD} {REST} {cardBorder(false)} scroll-mt-36 animate-lk-fade">
		<div class="flex flex-wrap items-center gap-3">
			<span class={numberPill(false)}>3.5</span>
			<h3 class={SECTION_TITLE}>Other pages of the spec</h3>
			<ValidateAllButton count={waitingChanges.length} what="changes" onclick={() => void send(changesAct().ops, 'your validation of the changes')} />
		</div>
		<div class="flex flex-col gap-2.5">
			{#each changeEntries as entry, i (entry.id)}
				{@const reading = changeReadings[entry.id]}
				{@const mine = changeMine(entry)}
				{@const settled = entry.trail?.validation === 'validated'}
				{#if reading}
					<SectionChangeCard
						domId={changeDomId(entry)}
						number={i + 1}
						change={reading}
						validate={{
							look: (settled ? 'done' : mine ? 'mine' : 'grey') as ValidateLook,
							title: mine ? 'You validated this change · click to withdraw' : 'Validate this change',
							run: canValidate ? () => void toggleChange(entry) : null,
							withdraws: mine,
							stamps: stampsOf([entry.trail?.validatedBy ?? []], entry.trail?.expected ?? [], entry.trail?.validatedByAi ?? []),
							settled
						}}
					/>
					{#if canValidate && !mine && !settled}
						<button type="button" class="quiet self-end text-red-ink" onclick={() => void (changeRejected(entry) ? toggleChange(entry) : rejectChange(entry))}>
							{changeRejected(entry) ? 'Restore this change' : 'Reject this change'}
						</button>
					{/if}
				{:else}
					<div class="rounded-xl bg-evo-sunken px-4 py-3.5 text-sm text-evo-muted">{entry.pageName} · <GlossaryText text={entry.summary} /></div>
				{/if}
			{/each}
		</div>
	</div>
{/if}

{#if ruleEntries.length > 0}
	<!-- 3.6 The rules the whole product keeps, each rule before and after as one EARS sentence (ac-evo-draft-rules). -->
	<div id="sg-rules" class="{CARD} {REST} {cardBorder(false)} scroll-mt-36 animate-lk-fade">
		<div class="flex flex-wrap items-center gap-3">
			<span class={numberPill(false)}>3.6</span>
			<h3 class={SECTION_TITLE}>{RULES_PAGE_NAME}</h3>
			<ValidateAllButton count={waitingRules.length} what="changes" onclick={() => void send(waitingRules.map((e) => ({ op: 'validate_field', fieldPath: e.key })), 'your validation of the changes to the rules')} />
		</div>
		<div class="flex flex-col gap-2.5">
			{#each ruleEntries as entry, i (entry.id)}
				{@const reading = ruleReadings[entry.id]}
				{@render changeCard(entry, i, reading, reading ? () => ruleCard(reading) : null)}
			{/each}
		</div>
	</div>
{/if}

{#if findingEntries.length > 0}
	<!-- 3.7 The findings of Project health the request settles, each fixed or kept, validated once chosen (ac-evo-draft-findings-read). -->
	<div id="sg-findings" class="{CARD} {REST} {cardBorder(false)} scroll-mt-36 animate-lk-fade">
		<div class="flex flex-wrap items-center gap-3">
			<span class={numberPill(false)}>3.7</span>
			<h3 class={SECTION_TITLE}>{FINDINGS_BLOCK_NAME}</h3>
			<ValidateAllButton count={waitingFindings.length} what="findings" onclick={() => void send(findingsAct().ops, 'your validation of the findings')} />
		</div>
		<p class="text-sm text-evo-muted">They leave Project health when the change lands: nobody settles them again by hand.</p>
		<div class="flex flex-col gap-2.5">
			{#each findingEntries as entry, i (entry.id)}
				{@const mine = findingMine(entry)}
				{@const settled = entry.trail?.validation === 'validated'}
				<FindingLineCard
					domId={findingDomId(entry)}
					number={i + 1}
					finding={entry}
					choose={canValidate && !dossier.frozen ? chooseFinding(entry) : null}
					validate={{
						look: (settled ? 'done' : mine ? 'mine' : 'grey') as ValidateLook,
						title: entry.outcome === 'undecided' ? 'Choose what becomes of this finding first' : mine ? 'You validated this finding · click to withdraw' : 'Validate this finding',
						run: canValidate && entry.outcome !== 'undecided' ? () => void toggleFinding(entry) : null,
						withdraws: mine,
						stamps: stampsOf([entry.trail?.validatedBy ?? []], entry.trail?.expected ?? [], entry.trail?.validatedByAi ?? []),
						settled
					}}
				/>
			{/each}
		</div>
	</div>
{/if}

<PageFoot id={STEP_FOOT_ID} class={FOOT_BAR}>
	<StepValidateAll step="Specification" parts={stepParts} onclick={() => void validateStep()} />
	<button type="button" class={primary48(allValidated)} onclick={onGoSimulation}>Go to Simulation →</button>
</PageFoot>
