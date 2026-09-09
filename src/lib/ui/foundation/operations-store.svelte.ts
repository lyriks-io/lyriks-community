import {
	computeOperationsCoherence,
	createEmptyScreenStates,
	createFeatureFlag,
	createSupportedLocale,
	createTestFixture,
	type FeatureFlag,
	type OperationsI18n,
	type OperationsMigration,
	type OperationsQuality,
	type OperationsSection,
	type FoundationOperationsDraft,
	type SupportedLocale,
	type TestFixture,
	type UiStateKey
} from '$domain/foundation';
import type { CoherenceResult } from '$domain/foundation';
import type { Session, ToastNotifierPort } from '$application/ports';
import { SectionAutosave, type SaveStatus } from '$ui/shell/section-autosave.svelte';

export type { SaveStatus };

/**
 * Operations store — orchestrator for the Ops tab. Mirror of the other
 * section stores: every mutator goes through `#touch` so the auth guard +
 * debounced autosave of feature `aae37f44` is honored uniformly. `screens` is
 * the screen library from Experience (empty when none authored yet), used by
 * the UI-states sub-section.
 */
export class OperationsStore {
	draft = $state<FoundationOperationsDraft>(null as unknown as FoundationOperationsDraft);
	// Which sub-section / screen is open is per-user view state: local `$state`,
	// never part of the persisted+broadcast draft (otherwise one user's click
	// moves everyone else's menu via the SSE live-sync). Mirrors the definition store.
	activeSection = $state<OperationsSection>('i18n');
	selectedScreen = $state<string>('');
	readonly screens: readonly string[];

	// Roll-out planning only applies when the project replaces an existing
	// system — the host page syncs this from Step 01's source mode, and both the
	// Migration section and the coherence rail follow it.
	migrationExpected = $state(true);

	coherence = $derived.by<CoherenceResult>(() =>
		computeOperationsCoherence(this.draft, this.migrationExpected)
	);

	readonly session: Session;
	readonly notifier: ToastNotifierPort;
	readonly #autosave: SectionAutosave<FoundationOperationsDraft>;

	constructor(
		initial: FoundationOperationsDraft,
		screens: readonly string[],
		session: Session,
		notifier: ToastNotifierPort,
		revision = 0
	) {
		this.draft = initial;
		this.screens = screens;
		this.session = session;
		this.notifier = notifier;
		this.#autosave = new SectionAutosave({
			endpoint: '/api/draft/foundation/operations',
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

	hydrate = (incoming: FoundationOperationsDraft, revision = 0) =>
		this.#autosave.hydrate(incoming, revision);

	#touch = () => this.#autosave.touch();

	flushNow = () => this.#autosave.flushNow();

	/* ─────────────────────────────── NAV ───────────────────────────────── */
	setActiveSection = (section: OperationsSection) => {
		this.activeSection = section;
	};

	/* ─────────────────────────────── i18n ──────────────────────────────── */
	setI18nField = <K extends keyof OperationsI18n>(field: K, value: OperationsI18n[K]) => {
		this.draft.i18n[field] = value;
		this.#touch();
	};

	addLocale = () => {
		this.draft.i18n.locales.push(createSupportedLocale());
		this.#touch();
	};

	updateLocale = <K extends keyof SupportedLocale>(
		index: number,
		field: K,
		value: SupportedLocale[K]
	) => {
		const l = this.draft.i18n.locales[index];
		if (!l) return;
		l[field] = value;
		this.#touch();
	};

	removeLocale = (index: number) => {
		this.draft.i18n.locales.splice(index, 1);
		this.#touch();
	};

	/* ────────────────────────────── QUALITY ────────────────────────────── */
	setQualityField = <K extends keyof OperationsQuality>(
		field: K,
		value: OperationsQuality[K]
	) => {
		this.draft.quality[field] = value;
		this.#touch();
	};

	/* ───────────────────────────── MIGRATION ───────────────────────────── */
	setMigrationField = <K extends keyof OperationsMigration>(
		field: K,
		value: OperationsMigration[K]
	) => {
		this.draft.migration[field] = value;
		this.#touch();
	};

	addFlag = () => {
		this.draft.migration.flagsExpected.push(createFeatureFlag());
		this.#touch();
	};

	updateFlag = <K extends keyof FeatureFlag>(id: string, field: K, value: FeatureFlag[K]) => {
		const f = this.draft.migration.flagsExpected.find((x) => x.id === id);
		if (!f) return;
		(f as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch();
	};

	removeFlag = (id: string) => {
		this.draft.migration.flagsExpected = this.draft.migration.flagsExpected.filter(
			(f) => f.id !== id
		);
		this.#touch();
	};

	/* ────────────────────────────── FIXTURES ───────────────────────────── */
	addFixture = () => {
		this.draft.testFixtures.push(createTestFixture());
		this.#touch();
	};

	updateFixture = <K extends keyof TestFixture>(id: string, field: K, value: TestFixture[K]) => {
		const f = this.draft.testFixtures.find((x) => x.id === id);
		if (!f) return;
		(f as unknown as Record<string, unknown>)[field as string] = value;
		this.#touch();
	};

	removeFixture = (id: string) => {
		this.draft.testFixtures = this.draft.testFixtures.filter((f) => f.id !== id);
		this.#touch();
	};

	/* ────────────────────────────── UI STATES ──────────────────────────── */
	selectScreen = (screen: string) => {
		this.selectedScreen = screen;
	};

	setScreenState = (screen: string, key: UiStateKey, value: string) => {
		if (!this.draft.screenStates[screen]) this.draft.screenStates[screen] = createEmptyScreenStates();
		this.draft.screenStates[screen][key] = value;
		this.#touch();
	};

	/** How many of the five states are described for a given screen. */
	screenStateCount = (screen: string): number => {
		const s = this.draft.screenStates[screen];
		if (!s) return 0;
		return Object.values(s).filter((v) => v.trim()).length;
	};
}
