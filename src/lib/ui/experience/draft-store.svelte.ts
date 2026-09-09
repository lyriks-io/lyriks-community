import {
	computeExperienceCoherence,
	createComponent,
	createDataRead,
	createElement,
	createJourney,
	createOperation,
	createScreen,
	createStep,
	createTemplate,
	createPrototypeScreen,
	createPrototypeElement,
	addNode as builderAddNode,
	createElementNode,
	createGroupNode,
	createAssertion,
	createScenario,
	createTransition,
	createValidation,
	createVisibilityCondition,
	defaultTriggerFor,
	ensureScreenRoot,
	ensureSurfaceRoot,
	HEADER_SURFACE_ID,
	FOOTER_SURFACE_ID,
	applyTemplateToScreen as builderApplyTemplate,
	cloneTreeOnto,
	duplicateNode as builderDuplicateNode,
	isSurfaceEmpty,
	defaultSimTheme,
	themePatchForMarker,
	themePatchFromMarkers,
	createBackendCollection,
	createBackendField,
	syncEntityIntoCollections,
	descendantIds as builderDescendantIds,
	moveNode as builderMoveNode,
	removeNode as builderRemoveNode,
	reorderChild as builderReorderChild,
	setFlexProps as builderSetFlexProps,
	elementsOfScreen,
	dataReadsOfStep,
	experienceCanAdvance,
	journeysUnderCore,
	missingExperienceRequirements,
	nextOrder,
	operationsOfStep,
	stepsOfJourney,
	validationDescription,
	type DataMode,
	type DerivedCore,
	type ExperienceTab,
	type Journey,
	type JourneyStep,
	type LibraryComponent,
	type LibraryElement,
	type LibraryScreen,
	type LibraryTemplate,
	type OperationKind,
	type ProjectExperienceDraft,
	type PrototypeElement,
	type PrototypeElementKind,
	type ReorderDirection,
	type StepDataRead,
	type StepOperation,
	type BuilderElementKind,
	type ElementBinding,
	type ElementAppearance,
	type ElementMedia,
	type ElementScenario,
	type ElementTransition,
	type ElementWiring,
	type FlexProps,
	type GroupPresentation,
	type InputType,
	type ListRowLayout,
	type PersonaGate,
	type SelectOptionSource,
	type VisibilityCondition,
	type ScenarioAssertion,
	type SimTheme,
	type BackendCollection,
	type BackendField,
	type FakeFieldKind,
	type ValidationKind,
	type ValidationRule,
	type ProjectBrand,
	type BrandMarkerKey
} from '$domain/experience';
import type { CoherenceResult } from '$domain/shared';
import type { DataEntity, EntityField } from '$domain/data';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };
export type DesignMode = 'brand' | 'experience';

/** Step-07 data model imported for the simulator's "import entity" action. */
export interface DataModel {
	entities: DataEntity[];
	fields: EntityField[];
}

/** A Step-03 capability + the roles granted it — used to prefill persona gates
 * and to gate screen-area access in the simulator. `coreId` groups feature /
 * journey capabilities by their Core (null for off-structure capabilities). */
export interface CapabilityAccess {
	id: string;
	label: string;
	source: string;
	roleIds: string[];
	coreId?: string | null;
}

/**
 * Step 05 store — orchestrator for the Experience screen. Mirror of the
 * Step 02/03/04 stores: every mutator goes through `#touch` so the auth guard +
 * debounced autosave of feature `1bf10f8f` is honored uniformly. The two main
 * navigation and selection state are local to each browser session.
 */
export class ExperienceStore {
	draft = $state<ProjectExperienceDraft>(null as unknown as ProjectExperienceDraft);
	activeDesignMode = $state<DesignMode>('experience');
	activeTab = $state<ExperienceTab>('screens');
	selectedJourneyId = $state<string | null>(null);
	selectedBuilderNodeId = $state<string | null>(null);
	/**
	 * A screen a deep link asked to open (`?screen=<id>` from the graph explorer,
	 * project search or the access matrix). The Screens panel owns which screen is
	 * being designed, so the link hands the id over here and the panel consumes it
	 * once — without it, every screen link landed on the entry screen instead.
	 */
	focusScreenId = $state<string | null>(null);
	/** Visible/Invisible toggle on the User Scenario tab — local UI only. */
	showInvisible = $state(false);

	coherence = $derived.by<CoherenceResult>(() => computeExperienceCoherence(this.draft));
	canAdvance = $derived.by<boolean>(() => experienceCanAdvance(this.draft));
	missing = $derived.by<string[]>(() => missingExperienceRequirements(this.draft));

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	/** Step-01 form-factor codes — drive the simulator's `auto` viewport. */
	formFactors = $state<string[]>([]);
	/** Step-01 product name — drives the simulator's app domain in the URL bar. */
	productName = $state<string>('');
	/** Step-07 data model — source for "Import from data model" in the fake backend. */
	dataModel = $state<DataModel>({ entities: [], fields: [] });
	/** Step-03 capabilities + granted roles — source for "Prefill from permission". */
	capabilityAccess = $state<CapabilityAccess[]>([]);
	readonly #autosave: SectionAutosave<ProjectExperienceDraft>;

	constructor(
		initial: ProjectExperienceDraft,
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/experience',
			session,
			notifier,
			getDraft: () => this.draft,
			applyRemote: (draft) => (this.draft = draft),
			onSaved: (savedAt) => (this.draft.lastSavedAt = savedAt),
			revision
		});
	}

	get saveStatus(): SaveStatus {
		return this.#autosave.status;
	}

	get lastError(): string | null {
		return this.#autosave.lastError;
	}

	hydrate = (incoming: ProjectExperienceDraft, revision = 0) => {
		this.#autosave.hydrate(incoming, revision);
		if (
			this.selectedJourneyId &&
			!incoming.journeys.some((journey) => journey.id === this.selectedJourneyId)
		) {
			this.selectedJourneyId = null;
		}
		if (
			this.selectedBuilderNodeId &&
			!incoming.builder.nodes[this.selectedBuilderNodeId]
		) {
			this.selectedBuilderNodeId = null;
		}
	};

	#touch = (_path: string) => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	/* ─────────────────────────── NAVIGATION ────────────────────────────── */
	/** Top-level page mode — Brand & Design vs the Experience workspace. */
	switchDesignMode = (mode: DesignMode) => {
		this.activeDesignMode = mode;
	};

	switchTab = (tab: ExperienceTab) => {
		this.activeTab = tab;
	};

	toggleInvisible = () => {
		this.showInvisible = !this.showInvisible;
	};

	/**
	 * Re-pull the read-only Cores from Step 04 (the spec's Refresh Derived Cores
	 * action). Patches `derivedCores` in place; the macro flow then mirrors the
	 * latest core set without losing in-memory journey edits.
	 */
	refreshCores = async () => {
		try {
			const res = await fetch(
				`/api/draft/experience?projectId=${encodeURIComponent(this.draft.projectId)}`
			);
			if (!res.ok) throw new Error(`refresh failed (${res.status})`);
			const { derivedCores } = (await res.json()) as { derivedCores: DerivedCore[] };
			this.draft.derivedCores = derivedCores;
			this.notifier.notify('info', `Cores refreshed from Features (${derivedCores.length}).`);
		} catch (e) {
			this.notifier.notify('error', e instanceof Error ? e.message : 'refresh failed');
		}
	};

	/* ───────────────────────────── JOURNEYS ────────────────────────────── */
	addJourney = (coreId: string, overrides: Partial<Journey> = {}): string => {
		const order = nextOrder(journeysUnderCore(this.draft, coreId));
		const journey = createJourney(coreId, order, overrides);
		this.draft.journeys.push(journey);
		this.selectedJourneyId = journey.id;
		this.#touch('experience.journeys');
		const core = this.draft.derivedCores.find((c) => c.id === coreId)?.name?.trim() || 'this core';
		this.notifier.notify(
			'info',
			journey.name.trim()
				? `Journey "${journey.name}" added to ${core}.`
				: `New journey added to ${core}.`
		);
		return journey.id;
	};

	updateJourney = <K extends keyof Journey>(journeyId: string, field: K, value: Journey[K]) => {
		const j = this.draft.journeys.find((j) => j.id === journeyId);
		if (!j) return;
		(j as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.journeys');
	};

	toggleActorRole = (journeyId: string, roleId: string) => {
		const j = this.draft.journeys.find((j) => j.id === journeyId);
		if (!j) return;
		j.actorRoleIds = j.actorRoleIds.includes(roleId)
			? j.actorRoleIds.filter((r) => r !== roleId)
			: [...j.actorRoleIds, roleId];
		this.#touch('experience.journeys');
	};

	removeJourney = (journeyId: string) => {
		const stepIds = new Set(this.draft.steps.filter((s) => s.journeyId === journeyId).map((s) => s.id));
		this.draft.journeys = this.draft.journeys.filter((j) => j.id !== journeyId);
		this.draft.steps = this.draft.steps.filter((s) => s.journeyId !== journeyId);
		this.draft.stepOperations = this.draft.stepOperations.filter((o) => !stepIds.has(o.stepId));
		this.draft.stepDataReads = this.draft.stepDataReads.filter((d) => !stepIds.has(d.stepId));
		if (this.selectedJourneyId === journeyId) this.selectedJourneyId = null;
		this.#touch('experience.journeys');
	};

	selectJourney = (journeyId: string | null) => {
		this.selectedJourneyId = this.selectedJourneyId === journeyId ? null : journeyId;
	};

	/* ────────────────────────────── STEPS ──────────────────────────────── */
	addStep = (journeyId: string, name = ''): string => {
		const order = nextOrder(stepsOfJourney(this.draft, journeyId));
		const step = createStep(journeyId, order, { name });
		this.draft.steps.push(step);
		this.#touch('experience.steps');
		const journey = this.draft.journeys.find((j) => j.id === journeyId)?.name?.trim() || 'the journey';
		this.notifier.notify(
			'info',
			name.trim() ? `Step "${name}" added to "${journey}".` : `New step added to "${journey}".`
		);
		return step.id;
	};

	updateStep = <K extends keyof JourneyStep>(stepId: string, field: K, value: JourneyStep[K]) => {
		const s = this.draft.steps.find((s) => s.id === stepId);
		if (!s) return;
		(s as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.steps');
	};

	removeStep = (stepId: string) => {
		this.draft.steps = this.draft.steps.filter((s) => s.id !== stepId);
		this.draft.stepOperations = this.draft.stepOperations.filter((o) => o.stepId !== stepId);
		this.draft.stepDataReads = this.draft.stepDataReads.filter((d) => d.stepId !== stepId);
		this.#touch('experience.steps');
	};

	reorderStep = (stepId: string, direction: ReorderDirection) => {
		const step = this.draft.steps.find((s) => s.id === stepId);
		if (!step) return;
		this.#swapOrder(stepsOfJourney(this.draft, step.journeyId), stepId, direction);
		this.#touch('experience.steps');
	};

	linkScreen = (stepId: string, screenId: string) => {
		const s = this.draft.steps.find((s) => s.id === stepId);
		if (!s) return;
		s.linkedScreenId = screenId;
		this.#touch('experience.steps');
		const screen = this.draft.screens.find((sc) => sc.id === screenId)?.name?.trim() || 'Untitled screen';
		this.notifier.notify(
			'info',
			`Screen "${screen}" linked to step "${s.name.trim() || 'Untitled step'}".`
		);
	};

	unlinkScreen = (stepId: string) => {
		const s = this.draft.steps.find((s) => s.id === stepId);
		if (!s) return;
		s.linkedScreenId = null;
		this.#touch('experience.steps');
	};

	/* ────────────────────── EVENTS FLOW (operations) ───────────────────── */
	addOperation = (stepId: string, overrides: Partial<StepOperation> = {}): string => {
		const order = nextOrder(operationsOfStep(this.draft, stepId));
		const op = createOperation(stepId, order, overrides);
		this.draft.stepOperations.push(op);
		this.#touch('experience.stepOperations');
		return op.id;
	};

	updateOperation = <K extends keyof StepOperation>(
		operationId: string,
		field: K,
		value: StepOperation[K]
	) => {
		const o = this.draft.stepOperations.find((o) => o.id === operationId);
		if (!o) return;
		(o as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.stepOperations');
	};

	removeOperation = (operationId: string) => {
		this.draft.stepOperations = this.draft.stepOperations.filter((o) => o.id !== operationId);
		this.#touch('experience.stepOperations');
	};

	reorderOperation = (operationId: string, direction: ReorderDirection) => {
		const op = this.draft.stepOperations.find((o) => o.id === operationId);
		if (!op) return;
		this.#swapOrder(operationsOfStep(this.draft, op.stepId), operationId, direction);
		this.#touch('experience.stepOperations');
	};

	/* ─────────────────────── DATA CONSUMED (reads) ─────────────────────── */
	addDataRead = (stepId: string, overrides: Partial<StepDataRead> = {}): string => {
		const order = nextOrder(dataReadsOfStep(this.draft, stepId));
		const read = createDataRead(stepId, order, overrides);
		this.draft.stepDataReads.push(read);
		this.#touch('experience.stepDataReads');
		return read.id;
	};

	updateDataRead = <K extends keyof StepDataRead>(
		dataReadId: string,
		field: K,
		value: StepDataRead[K]
	) => {
		const d = this.draft.stepDataReads.find((d) => d.id === dataReadId);
		if (!d) return;
		(d as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.stepDataReads');
	};

	setDataReadFields = (dataReadId: string, raw: string) => {
		const fields = raw
			.split(',')
			.map((f) => f.trim())
			.filter((f) => f.length > 0);
		this.updateDataRead(dataReadId, 'fields', fields);
	};

	setDataReadMode = (dataReadId: string, mode: DataMode) =>
		this.updateDataRead(dataReadId, 'mode', mode);

	removeDataRead = (dataReadId: string) => {
		this.draft.stepDataReads = this.draft.stepDataReads.filter((d) => d.id !== dataReadId);
		this.#touch('experience.stepDataReads');
	};

	/* ────────────────────────────── LIBRARY ────────────────────────────── */
	addTemplate = (overrides: Partial<LibraryTemplate> = {}): string => {
		const t = createTemplate(overrides);
		this.draft.templates.push(t);
		this.#touch('experience.templates');
		if (t.name.trim()) this.notifier.notify('info', `Template "${t.name}" added.`);
		return t.id;
	};

	updateTemplate = <K extends keyof LibraryTemplate>(
		templateId: string,
		field: K,
		value: LibraryTemplate[K]
	) => {
		const t = this.draft.templates.find((t) => t.id === templateId);
		if (!t) return;
		(t as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.templates');
	};

	removeTemplate = (templateId: string) => {
		this.draft.templates = this.draft.templates.filter((t) => t.id !== templateId);
		// Detach the template from any screen that inherited it.
		for (const s of this.draft.screens) if (s.templateId === templateId) s.templateId = null;
		// Tear down the template's own layout tree (its surface in the builder).
		this.#removeBuilderSurface(templateId);
		this.#touch('experience.templates');
		this.#touch('experience.builder');
	};

	/** Open a template's own layout surface for editing; ensures its root group. */
	openBuilderTemplate = (templateId: string): string => {
		const existed = Boolean(this.draft.builder.screenRoots[templateId]);
		const rootId = ensureSurfaceRoot(this.draft.builder, templateId, 'Template');
		if (!existed) this.#touch('experience.builder');
		return rootId;
	};

	/** Open a component's reusable tree for editing; ensures its root group. The
	 *  component's tree lives under screenRoots[componentId], referenced by groups
	 *  (componentId) and list row templates. */
	openBuilderComponent = (componentId: string): string => {
		const existed = Boolean(this.draft.builder.screenRoots[componentId]);
		const rootId = ensureSurfaceRoot(this.draft.builder, componentId, 'Component');
		if (!existed) this.#touch('experience.builder');
		return rootId;
	};

	/** Is this surface's (screen or template) layout tree empty? */
	isSurfaceEmpty = (surfaceId: string): boolean => isSurfaceEmpty(this.draft.builder, surfaceId);

	/**
	 * Apply a template's layout to a screen — deep-clones the template tree onto
	 * the screen, replacing whatever was there. Also records the inheritance link.
	 */
	applyTemplateToScreen = (screenId: string, templateId: string): boolean => {
		ensureScreenRoot(this.draft.builder, screenId);
		ensureSurfaceRoot(this.draft.builder, templateId, 'Template');
		const ok = builderApplyTemplate(this.draft.builder, templateId, screenId);
		if (!ok) {
			this.notifier.notify('error', 'That template has no layout to apply yet.');
			return false;
		}
		const s = this.draft.screens.find((s) => s.id === screenId);
		if (s) s.templateId = templateId;
		if (
			this.selectedBuilderNodeId &&
			!this.draft.builder.nodes[this.selectedBuilderNodeId]
		) {
			this.selectedBuilderNodeId = null;
		}
		this.#touch('experience.builder');
		this.#touch('experience.screens');
		const template = this.draft.templates.find((t) => t.id === templateId)?.name?.trim() || 'Untitled template';
		this.notifier.notify(
			'info',
			`Template "${template}" applied to "${s?.name?.trim() || 'Untitled screen'}"; its previous layout was replaced.`
		);
		return true;
	};

	/** Save a screen's current layout as a new reusable template; returns its id. */
	saveScreenAsTemplate = (screenId: string, name?: string): string | null => {
		const screenRoot = ensureScreenRoot(this.draft.builder, screenId);
		const screen = this.draft.screens.find((s) => s.id === screenId);
		const t = createTemplate({ name: name?.trim() || `${screen?.name || 'Screen'} template` });
		const newRoot = cloneTreeOnto(this.draft.builder, screenRoot, t.id);
		if (!newRoot) {
			this.notifier.notify('error', 'Nothing to save: the screen has no layout yet.');
			return null;
		}
		this.draft.builder.screenRoots[t.id] = newRoot;
		this.draft.templates.push(t);
		if (screen) screen.templateId = t.id;
		this.#touch('experience.templates');
		this.#touch('experience.builder');
		this.#touch('experience.screens');
		this.notifier.notify(
			'info',
			`Layout of "${screen?.name?.trim() || 'Untitled screen'}" saved as template "${t.name}".`
		);
		return t.id;
	};

	/* ──────────────────────── SIMULATOR DESIGN SYSTEM ──────────────────── */
	setSimTheme = (patch: Partial<SimTheme>) => {
		this.draft.builder.theme = { ...this.draft.builder.theme, ...patch };
		this.#touch('experience.builder');
	};

	resetSimTheme = () => {
		// Defaults, then re-apply the tokens the design markers own — a reset must not
		// silently contradict the corner style and density the brand already states.
		this.draft.builder.theme = {
			...defaultSimTheme(),
			...themePatchFromMarkers(this.draft.brand.markers)
		};
		this.#touch('experience.builder');
		this.notifier.notify('info', 'Design system reset to defaults.');
	};

	/* ──────────────────────────── BRAND & DESIGN ───────────────────────── */
	/**
	 * Immutable deep-set into `draft.brand` along a dotted path (e.g.
	 * `identity.name`, `colors.tokens`). Clones every object/array on the way
	 * down so Svelte's `$state` proxy sees a fresh reference — the single setter
	 * that powers every field/array edit in the Brand & Design tab.
	 */
	setBrand = (path: string, value: unknown) => {
		const keys = path.split('.');
		const root: Record<string, unknown> = { ...(this.draft.brand as unknown as Record<string, unknown>) };
		let cursor = root;
		for (let i = 0; i < keys.length - 1; i++) {
			const k = keys[i];
			const child = cursor[k];
			cursor[k] = Array.isArray(child) ? [...child] : { ...(child as Record<string, unknown>) };
			cursor = cursor[k] as Record<string, unknown>;
		}
		cursor[keys[keys.length - 1]] = value;
		this.draft.brand = root as unknown as ProjectBrand;
		this.#touch('experience.brand');
	};

	/**
	 * Pick a design marker. A marker is the coarse expression of a decision the
	 * simulator theme also holds concretely (corner style → radii, density →
	 * spacing), so it writes through — the trait is asked once, never twice.
	 */
	setMarker = (key: BrandMarkerKey, value: string) => {
		this.setBrand(`markers.${key}`, value);
		const patch = themePatchForMarker(key, value);
		if (Object.keys(patch).length) this.setSimTheme(patch);
	};

	/* ──────────────────────────── APP SHELL ────────────────────────────── */
	/** Toggle the shared header/footer chrome; ensures its layout surface exists. */
	setShellEnabled = (part: 'header' | 'footer', enabled: boolean) => {
		const surfaceId = part === 'header' ? HEADER_SURFACE_ID : FOOTER_SURFACE_ID;
		if (enabled) ensureSurfaceRoot(this.draft.builder, surfaceId, part === 'header' ? 'Header' : 'Footer');
		this.draft.builder.shell = {
			...this.draft.builder.shell,
			[`${part}Enabled`]: enabled
		};
		this.#touch('experience.builder');
	};

	/* ─────────────────────────── FAKE BACKEND ──────────────────────────── */
	addCollection = (overrides: Partial<BackendCollection> = {}): string => {
		const c = createBackendCollection(overrides);
		this.draft.builder.collections.push(c);
		this.#touch('experience.builder');
		if (c.name.trim()) this.notifier.notify('info', `Collection "${c.name}" added.`);
		return c.id;
	};

	/**
	 * Import or refresh the collection backing one Step-07 entity (provenance-first
	 * matching, author demo knobs kept; see `syncEntityIntoCollections`).
	 */
	#refreshCollectionFromEntity = (
		entity: DataEntity
	): { id: string; name: string; outcome: 'imported' | 'updated' | 'unchanged' } => {
		const r = syncEntityIntoCollections(
			this.draft.builder.collections,
			entity,
			this.dataModel.fields
		);
		if (r.changed) this.#touch('experience.builder');
		return { id: r.collection.id, name: r.collection.name, outcome: r.outcome };
	};

	/**
	 * Import a Step-07 entity as an editable fake-backend collection, or re-sync
	 * the collection it already backs. Returns the collection id, or null if the
	 * entity isn't in the data model.
	 */
	importEntityAsCollection = (entityId: string): string | null => {
		const entity = this.dataModel.entities.find((e) => e.id === entityId);
		if (!entity) return null;
		const r = this.#refreshCollectionFromEntity(entity);
		this.notifier.notify(
			'info',
			r.outcome === 'imported'
				? `Imported "${r.name}" from the data model.`
				: r.outcome === 'updated'
					? `Updated "${r.name}" from the data model.`
					: `"${r.name}" is already in sync with the data model.`
		);
		return r.id;
	};

	/** Import every Step-07 entity as a collection, refreshing drifted ones. */
	syncCollectionsFromModel = () => {
		let imported = 0;
		let updated = 0;
		for (const entity of this.dataModel.entities) {
			const r = this.#refreshCollectionFromEntity(entity);
			if (r.outcome === 'imported') imported++;
			else if (r.outcome === 'updated') updated++;
		}
		if (imported === 0 && updated === 0) {
			this.notifier.notify('info', 'Collections are already in sync with the data model.');
			return;
		}
		const parts = [
			...(imported > 0 ? [`${imported} imported`] : []),
			...(updated > 0 ? [`${updated} updated`] : [])
		];
		this.notifier.notify('info', `Data model sync: ${parts.join(', ')}.`);
	};

	updateCollection = <K extends keyof Omit<BackendCollection, 'id' | 'fields'>>(
		collectionId: string,
		field: K,
		value: BackendCollection[K]
	) => {
		const c = this.draft.builder.collections.find((c) => c.id === collectionId);
		if (!c) return;
		(c as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.builder');
	};

	removeCollection = (collectionId: string) => {
		this.draft.builder.collections = this.draft.builder.collections.filter((c) => c.id !== collectionId);
		this.#touch('experience.builder');
	};

	addCollectionField = (collectionId: string) => {
		const c = this.draft.builder.collections.find((c) => c.id === collectionId);
		if (!c) return;
		c.fields.push(createBackendField());
		this.#touch('experience.builder');
	};

	updateCollectionField = (
		collectionId: string,
		fieldId: string,
		patch: Partial<Pick<BackendField, 'name' | 'kind'>>
	) => {
		const c = this.draft.builder.collections.find((c) => c.id === collectionId);
		const f = c?.fields.find((f) => f.id === fieldId);
		if (!f) return;
		if (patch.name !== undefined) f.name = patch.name;
		if (patch.kind !== undefined) f.kind = patch.kind as FakeFieldKind;
		this.#touch('experience.builder');
	};

	removeCollectionField = (collectionId: string, fieldId: string) => {
		const c = this.draft.builder.collections.find((c) => c.id === collectionId);
		if (!c) return;
		c.fields = c.fields.filter((f) => f.id !== fieldId);
		this.#touch('experience.builder');
	};

	addScreen = (overrides: Partial<LibraryScreen> = {}): string => {
		const s = createScreen(overrides);
		this.draft.screens.push(s);
		this.#touch('experience.screens');
		if (s.name.trim()) this.notifier.notify('info', `Screen "${s.name}" added.`);
		return s.id;
	};

	updateScreen = <K extends keyof LibraryScreen>(
		screenId: string,
		field: K,
		value: LibraryScreen[K]
	) => {
		const s = this.draft.screens.find((s) => s.id === screenId);
		if (!s) return;
		(s as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.screens');
	};

	removeScreen = (screenId: string) => {
		this.draft.screens = this.draft.screens.filter((s) => s.id !== screenId);
		// Unlink the screen from any step that referenced it.
		for (const st of this.draft.steps) if (st.linkedScreenId === screenId) st.linkedScreenId = null;
		this.#removeBuilderSurface(screenId);
		if (this.draft.builder.entryScreenId === screenId) {
			this.draft.builder.entryScreenId = this.draft.screens[0]?.id ?? null;
		}
		this.#touch('experience.screens');
		this.#touch('experience.builder');
	};

	addComponent = (overrides: Partial<LibraryComponent> = {}): string => {
		const c = createComponent(overrides);
		this.draft.components.push(c);
		this.#touch('experience.components');
		return c.id;
	};

	updateComponent = <K extends keyof LibraryComponent>(
		componentId: string,
		field: K,
		value: LibraryComponent[K]
	) => {
		const c = this.draft.components.find((c) => c.id === componentId);
		if (!c) return;
		(c as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.components');
	};

	removeComponent = (componentId: string) => {
		this.draft.components = this.draft.components.filter((c) => c.id !== componentId);
		this.#removeBuilderSurface(componentId);
		for (const node of Object.values(this.draft.builder.nodes)) {
			if ('componentId' in node && node.componentId === componentId) node.componentId = null;
		}
		this.#touch('experience.components');
		this.#touch('experience.builder');
	};

	#removeBuilderSurface = (surfaceId: string) => {
		const root = this.draft.builder.screenRoots[surfaceId];
		if (!root) return;
		for (const id of builderDescendantIds(this.draft.builder, root)) {
			delete this.draft.builder.nodes[id];
		}
		delete this.draft.builder.nodes[root];
		delete this.draft.builder.screenRoots[surfaceId];
		if (
			this.selectedBuilderNodeId &&
			!this.draft.builder.nodes[this.selectedBuilderNodeId]
		) {
			this.selectedBuilderNodeId = null;
		}
	};

	addElement = (overrides: Partial<LibraryElement> = {}): string => {
		const e = createElement(overrides);
		this.draft.elements.push(e);
		this.#touch('experience.elements');
		return e.id;
	};

	updateElement = <K extends keyof LibraryElement>(
		elementId: string,
		field: K,
		value: LibraryElement[K]
	) => {
		const el = this.draft.elements.find((e) => e.id === elementId);
		if (!el) return;
		(el as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.elements');
	};

	removeElement = (elementId: string) => {
		this.draft.elements = this.draft.elements.filter((e) => e.id !== elementId);
		this.#touch('experience.elements');
	};

	/* ─────────────────────────────── RESET ─────────────────────────────── */
	reset = () => {
		// Clears journeys and their underlay; leaves the Library and the mirrored
		// cores intact, per the spec's Reset Step action.
		this.draft.journeys = [];
		this.draft.steps = [];
		this.draft.stepOperations = [];
		this.draft.stepDataReads = [];
		this.selectedJourneyId = null;
		this.#touch('experience.reset');
	};

	/* ─────────────────────────── PROTOTYPE ─────────────────────────────── */
	addPrototypeScreen = (name = 'New screen'): string => {
		const screen = createPrototypeScreen(nextOrder(this.draft.prototype.screens), name);
		this.draft.prototype.screens.push(screen);
		// First screen becomes the entry flow by default.
		if (this.draft.prototype.entryScreenId === null) this.draft.prototype.entryScreenId = screen.id;
		this.#touch('experience.prototype');
		this.notifier.notify(
			'info',
			this.draft.prototype.entryScreenId === screen.id
				? `Prototype screen "${name}" added; it is the entry screen.`
				: `Prototype screen "${name}" added.`
		);
		return screen.id;
	};

	renamePrototypeScreen = (screenId: string, name: string) => {
		const s = this.draft.prototype.screens.find((x) => x.id === screenId);
		if (!s) return;
		s.name = name;
		this.#touch('experience.prototype');
	};

	removePrototypeScreen = (screenId: string) => {
		const p = this.draft.prototype;
		p.screens = p.screens.filter((s) => s.id !== screenId);
		p.elements = p.elements.filter((e) => e.screenId !== screenId);
		if (p.entryScreenId === screenId) p.entryScreenId = p.screens[0]?.id ?? null;
		this.#touch('experience.prototype');
	};

	setEntryScreen = (screenId: string) => {
		this.draft.prototype.entryScreenId = screenId;
		this.#touch('experience.prototype');
	};

	addPrototypeElement = (screenId: string, kind: PrototypeElementKind): string => {
		const order = nextOrder(elementsOfScreen(this.draft.prototype, screenId));
		const el = createPrototypeElement(screenId, order, kind);
		this.draft.prototype.elements.push(el);
		this.#touch('experience.prototype');
		return el.id;
	};

	updatePrototypeElement = <K extends keyof PrototypeElement>(
		elementId: string,
		field: K,
		value: PrototypeElement[K]
	) => {
		const el = this.draft.prototype.elements.find((e) => e.id === elementId);
		if (!el) return;
		(el as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch('experience.prototype');
	};

	/** Set (or clear) a success/error handler on an element. */
	setPrototypeHandler = (
		elementId: string,
		which: 'onSuccess' | 'onError',
		handler: PrototypeElement['onSuccess']
	) => {
		const el = this.draft.prototype.elements.find((e) => e.id === elementId);
		if (!el) return;
		el[which] = handler;
		this.#touch('experience.prototype');
	};

	removePrototypeElement = (elementId: string) => {
		this.draft.prototype.elements = this.draft.prototype.elements.filter((e) => e.id !== elementId);
		this.#touch('experience.prototype');
	};

	/* ─────────────────────────────── BUILDER ───────────────────────────── */
	/** Open a screen in the builder: ensure its root group + select it. Returns root id. */
	openBuilderScreen = (screenId: string): string => {
		const existed = Boolean(this.draft.builder.screenRoots[screenId]);
		const rootId = ensureScreenRoot(this.draft.builder, screenId);
		if (!existed) this.#touch('experience.builder');
		return rootId;
	};

	selectBuilderNode = (nodeId: string | null) => {
		this.selectedBuilderNodeId = nodeId;
	};

	setBuilderEntryScreen = (screenId: string) => {
		this.draft.builder.entryScreenId = screenId;
		this.#touch('experience.builder');
	};

	addBuilderGroup = (parentId: string): string | null => {
		const parent = this.draft.builder.nodes[parentId];
		if (!parent || parent.kind !== 'group') return null;
		const node = createGroupNode(parent.surfaceId, parentId);
		builderAddNode(this.draft.builder, node);
		this.selectedBuilderNodeId = node.id;
		this.#touch('experience.builder');
		return node.id;
	};

	addBuilderElement = (parentId: string, kind: BuilderElementKind): string | null => {
		const parent = this.draft.builder.nodes[parentId];
		if (!parent || parent.kind !== 'group') return null;
		const node = createElementNode(parent.surfaceId, parentId, kind);
		builderAddNode(this.draft.builder, node);
		this.selectedBuilderNodeId = node.id;
		this.#touch('experience.builder');
		return node.id;
	};

	renameBuilderNode = (nodeId: string, label: string) => {
		const n = this.draft.builder.nodes[nodeId];
		if (!n) return;
		n.label = label;
		this.#touch('experience.builder');
	};

	setBuilderElementKind = (nodeId: string, kind: BuilderElementKind) => {
		const n = this.draft.builder.nodes[nodeId];
		if (!n || n.kind !== 'element') return;
		n.elementKind = kind;
		this.#touch('experience.builder');
	};

	removeBuilderNode = (nodeId: string) => {
		builderRemoveNode(this.draft.builder, nodeId);
		if (
			this.selectedBuilderNodeId &&
			!this.draft.builder.nodes[this.selectedBuilderNodeId]
		) {
			this.selectedBuilderNodeId = null;
		}
		this.#touch('experience.builder');
	};

	duplicateBuilderNode = (nodeId: string): string | null => {
		const duplicateId = builderDuplicateNode(this.draft.builder, nodeId);
		if (!duplicateId) return null;
		this.selectedBuilderNodeId = duplicateId;
		this.#touch('experience.builder');
		return duplicateId;
	};

	moveBuilderNode = (nodeId: string, newParentId: string, index: number) => {
		if (builderMoveNode(this.draft.builder, nodeId, newParentId, index))
			this.#touch('experience.builder');
	};

	reorderBuilderChild = (parentId: string, from: number, to: number) => {
		builderReorderChild(this.draft.builder, parentId, from, to);
		this.#touch('experience.builder');
	};

	setBuilderFlex = (groupId: string, patch: Partial<FlexProps>) => {
		builderSetFlexProps(this.draft.builder, groupId, patch);
		this.#touch('experience.builder');
	};

	/* ── group presentation / reuse ── */
	#groupNode = (groupId: string) => {
		const n = this.draft.builder.nodes[groupId];
		return n && n.kind === 'group' ? n : null;
	};

	/** Inline (normal flow), overlay/modal, or tabs. 'inline' clears the field. */
	setBuilderGroupPresentation = (groupId: string, presentation: GroupPresentation) => {
		const g = this.#groupNode(groupId);
		if (!g) return;
		if (presentation === 'inline') delete g.presentation;
		else g.presentation = presentation;
		this.#touch('experience.builder');
	};

	/** Tabs: the state path that tracks the active panel index. */
	setBuilderGroupTabsKey = (groupId: string, key: string) => {
		const g = this.#groupNode(groupId);
		if (!g) return;
		if (key.trim()) g.tabsKey = key.trim();
		else delete g.tabsKey;
		this.#touch('experience.builder');
	};

	/** Reuse another surface's tree (a LibraryComponent) in this group. */
	setBuilderGroupComponent = (groupId: string, componentId: string | null) => {
		const g = this.#groupNode(groupId);
		if (!g) return;
		if (componentId) g.componentId = componentId;
		else delete g.componentId;
		this.#touch('experience.builder');
	};

	/** Group-level state-driven visibility (what opens/closes an overlay). */
	setBuilderGroupVisibility = (groupId: string, condition: VisibilityCondition | null) => {
		const g = this.#groupNode(groupId);
		if (!g) return;
		if (condition) g.visibleWhen = condition;
		else delete g.visibleWhen;
		this.#touch('experience.builder');
	};

	/** Free-form element variant (e.g. a `status` element's loading/empty/error/success). */
	setBuilderElementVariant = (nodeId: string, variant: string) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		if (variant) n.variant = variant;
		else delete n.variant;
		this.#touch('experience.builder');
	};

	setBuilderElementAppearance = (nodeId: string, patch: Partial<ElementAppearance>) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const next = { ...(n.appearance ?? {}), ...patch };
		for (const key of Object.keys(next) as (keyof ElementAppearance)[]) {
			if (next[key] === undefined || next[key] === '') delete next[key];
		}
		if (Object.keys(next).length) n.appearance = next;
		else delete n.appearance;
		this.#touch('experience.builder');
	};

	setBuilderElementMedia = (nodeId: string, patch: Partial<ElementMedia> | null) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		if (!patch) delete n.media;
		else {
			const next: ElementMedia = {
				src: patch.src ?? n.media?.src ?? '',
				alt: patch.alt ?? n.media?.alt ?? '',
				fit: patch.fit ?? n.media?.fit ?? 'cover',
				...(patch.aspectRatio ?? n.media?.aspectRatio
					? { aspectRatio: patch.aspectRatio ?? n.media?.aspectRatio }
					: {})
			};
			if (next.src.trim()) n.media = next;
			else delete n.media;
		}
		this.#touch('experience.builder');
	};

	/** A list element's per-row template component (null clears → built-in row). */
	setBuilderListTemplate = (nodeId: string, componentId: string | null) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		if (componentId) n.componentId = componentId;
		else delete n.componentId;
		this.#touch('experience.builder');
	};

	/** A list element's search state path (empty clears → no filtering). */
	setBuilderListFilter = (nodeId: string, statePath: string) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		if (statePath.trim()) n.filterStatePath = statePath.trim();
		else delete n.filterStatePath;
		this.#touch('experience.builder');
	};

	/** How a bound list repeats its row template: stacked rows, grid or cards. */
	setBuilderListLayout = (nodeId: string, layout: ListRowLayout, columns?: number) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		if (layout === 'stack') delete n.rowLayout;
		else n.rowLayout = layout;
		if (columns === undefined) delete n.rowColumns;
		else n.rowColumns = Math.max(1, Math.min(4, Math.round(columns)));
		this.#touch('experience.builder');
	};

	/** A select's authored choices (one per line in the inspector; empty clears). */
	setBuilderSelectOptions = (nodeId: string, options: string[]) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const clean = options.map((o) => o.trim()).filter(Boolean);
		if (clean.length) n.options = clean;
		else delete n.options;
		this.#touch('experience.builder');
	};

	/** A select's live option source — a collection field, optionally dependent. */
	setBuilderSelectSource = (nodeId: string, src: Partial<SelectOptionSource> | null) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const next = { ...(n.optionsFrom ?? { collection: '', field: '' }), ...(src ?? {}) };
		if (!src || (!next.collection.trim() && !next.field.trim())) delete n.optionsFrom;
		else
			n.optionsFrom = {
				collection: next.collection.trim(),
				field: next.field.trim(),
				...(next.filterField?.trim() && next.filterPath?.trim()
					? { filterField: next.filterField.trim(), filterPath: next.filterPath.trim() }
					: {})
			};
		this.#touch('experience.builder');
	};

	/* ── element wiring ── */
	#elementNode = (nodeId: string) => {
		const n = this.draft.builder.nodes[nodeId];
		return n && n.kind === 'element' ? n : null;
	};

	setBuilderBinding = (nodeId: string, binding: ElementBinding | null) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		n.wiring.binding = binding;
		this.#touch('experience.builder');
	};

	setBuilderGate = (nodeId: string, gate: PersonaGate | null) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		n.wiring.gate = gate;
		this.#touch('experience.builder');
	};

	/**
	 * Prefill an element's persona gate from a Step-03 capability: visible only to
	 * the roles granted that capability. The result is a normal gate the author can
	 * then tweak with the persona chips (import-once-editable).
	 */
	applyCapabilityGate = (nodeId: string, capabilityId: string) => {
		const cap = this.capabilityAccess.find((c) => c.id === capabilityId);
		if (!cap) return;
		this.setBuilderGate(nodeId, { personaIds: [...cap.roleIds], mode: 'visible', allow: true });
		this.notifier.notify('info', `Gated to roles with "${cap.label}".`);
	};

	toggleBuilderGatePersona = (nodeId: string, personaId: string) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const gate: PersonaGate = n.wiring.gate ?? { personaIds: [], mode: 'visible', allow: true };
		gate.personaIds = gate.personaIds.includes(personaId)
			? gate.personaIds.filter((p) => p !== personaId)
			: [...gate.personaIds, personaId];
		n.wiring.gate = gate;
		this.#touch('experience.builder');
	};

	/** Run-mode state-driven visibility for an element (null clears it). */
	setBuilderVisibility = (nodeId: string, condition: VisibilityCondition | null) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		n.wiring.visibleWhen = condition;
		this.#touch('experience.builder');
	};

	addBuilderVisibility = (nodeId: string) => {
		this.setBuilderVisibility(nodeId, createVisibilityCondition());
	};

	updateBuilderWiring = <K extends keyof ElementWiring>(
		nodeId: string,
		field: K,
		value: ElementWiring[K]
	) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		n.wiring[field] = value;
		this.#touch('experience.builder');
	};

	addBuilderTransition = (nodeId: string): string | null => {
		const n = this.#elementNode(nodeId);
		if (!n) return null;
		const t = createTransition(defaultTriggerFor(n.elementKind));
		n.wiring.transitions.push(t);
		this.#touch('experience.builder');
		return t.id;
	};

	updateBuilderTransition = (nodeId: string, transitionId: string, patch: Partial<ElementTransition>) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const t = n.wiring.transitions.find((x) => x.id === transitionId);
		if (!t) return;
		Object.assign(t, patch);
		this.#touch('experience.builder');
	};

	removeBuilderTransition = (nodeId: string, transitionId: string) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		n.wiring.transitions = n.wiring.transitions.filter((x) => x.id !== transitionId);
		this.#touch('experience.builder');
	};

	addBuilderScenario = (nodeId: string): string | null => {
		const n = this.#elementNode(nodeId);
		if (!n) return null;
		const s = createScenario();
		n.wiring.scenarios.push(s);
		this.#touch('experience.builder');
		return s.id;
	};

	updateBuilderScenario = (nodeId: string, scenarioId: string, patch: Partial<ElementScenario>) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const s = n.wiring.scenarios.find((x) => x.id === scenarioId);
		if (!s) return;
		Object.assign(s, patch);
		this.#touch('experience.builder');
	};

	removeBuilderScenario = (nodeId: string, scenarioId: string) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		n.wiring.scenarios = n.wiring.scenarios.filter((x) => x.id !== scenarioId);
		this.#touch('experience.builder');
	};

	addScenarioAssertion = (nodeId: string, scenarioId: string, side: 'given' | 'then') => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const s = n.wiring.scenarios.find((x) => x.id === scenarioId);
		if (!s) return;
		s[side].push(createAssertion());
		this.#touch('experience.builder');
	};

	updateScenarioAssertion = (
		nodeId: string,
		scenarioId: string,
		side: 'given' | 'then',
		assertionId: string,
		patch: Partial<ScenarioAssertion>
	) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const s = n.wiring.scenarios.find((x) => x.id === scenarioId);
		const a = s?.[side].find((x) => x.id === assertionId);
		if (!a) return;
		Object.assign(a, patch);
		this.#touch('experience.builder');
	};

	removeScenarioAssertion = (
		nodeId: string,
		scenarioId: string,
		side: 'given' | 'then',
		assertionId: string
	) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const s = n.wiring.scenarios.find((x) => x.id === scenarioId);
		if (!s) return;
		s[side] = s[side].filter((x) => x.id !== assertionId);
		this.#touch('experience.builder');
	};

	/* ── input type + validation ── */
	setBuilderInputType = (nodeId: string, inputType: InputType) =>
		this.updateBuilderWiring(nodeId, 'inputType', inputType);

	setBuilderRequireValid = (nodeId: string, requireValid: boolean) =>
		this.updateBuilderWiring(nodeId, 'requireValid', requireValid);

	addBuilderValidation = (nodeId: string, kind: ValidationKind = 'required'): string | null => {
		const n = this.#elementNode(nodeId);
		if (!n) return null;
		const rule = createValidation(kind);
		n.wiring.validations.push(rule);
		this.#touch('experience.builder');
		return rule.id;
	};

	updateBuilderValidation = (nodeId: string, validationId: string, patch: Partial<ValidationRule>) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		const r = n.wiring.validations.find((x) => x.id === validationId);
		if (!r) return;
		const previousAutoDescription = validationDescription(r.kind, r.param, n.label);
		Object.assign(r, patch);
		const nextAutoDescription = validationDescription(r.kind, r.param, n.label);
		const legacyAutoDescription = validationDescription(r.kind, r.param);
		if (
			(patch.kind || patch.param) &&
			(!r.description.trim() ||
				r.description === previousAutoDescription ||
				r.description === legacyAutoDescription)
		) {
			r.description = nextAutoDescription;
		}
		this.#touch('experience.builder');
	};

	removeBuilderValidation = (nodeId: string, validationId: string) => {
		const n = this.#elementNode(nodeId);
		if (!n) return;
		n.wiring.validations = n.wiring.validations.filter((x) => x.id !== validationId);
		this.#touch('experience.builder');
	};

	/* ── state seeds ── */
	addStateSeed = () => {
		this.draft.builder.stateSeeds.push({ path: '', value: '' });
		this.#touch('experience.builder');
	};

	updateStateSeed = (index: number, patch: Partial<{ path: string; value: string }>) => {
		const seed = this.draft.builder.stateSeeds[index];
		if (!seed) return;
		Object.assign(seed, patch);
		this.#touch('experience.builder');
	};

	removeStateSeed = (index: number) => {
		this.draft.builder.stateSeeds = this.draft.builder.stateSeeds.filter((_, i) => i !== index);
		this.#touch('experience.builder');
	};

	/* ───────────────────────────── helpers ─────────────────────────────── */
	/** Swap the `order` field of an item with its up/down neighbour in a sorted list. */
	#swapOrder = <T extends { id: string; order: number }>(
		sorted: T[],
		id: string,
		direction: ReorderDirection
	) => {
		const idx = sorted.findIndex((x) => x.id === id);
		if (idx < 0) return;
		const swapWith = direction === 'up' ? idx - 1 : idx + 1;
		if (swapWith < 0 || swapWith >= sorted.length) return;
		const a = sorted[idx];
		const b = sorted[swapWith];
		const tmp = a.order;
		a.order = b.order;
		b.order = tmp;
	};
}
