import type { FlagDefault, MigrationStrategy, UiStateKey } from './operations-enums';

/* ── Entities — mirror of Unspaghettit feature aae37f44 ─────────────── */

/** One locale the product must serve. */
export interface SupportedLocale {
	code: string;
	label: string;
	rtl: boolean;
}

/**
 * Localization contract: how downstream generation formats language, dates,
 * numbers and money, plus every locale the product must serve. Numeric-looking
 * fields stay strings so the author can type freely.
 */
export interface OperationsI18n {
	primaryLocale: string;
	timezone: string;
	dateFormat: string;
	numberFormat: string;
	currency: string;
	locales: SupportedLocale[];
	notes: string;
}

/** Non-functional budgets an LLM (or a new dev) must respect. */
export interface OperationsQuality {
	latencyP95Ms: string;
	latencyP99Ms: string;
	errorBudgetPct: string;
	availabilityPct: string;
	bundleSizeKb: string;
	ttiMs: string;
	a11yLevel: string;
	browsers: string;
	perfNotes: string;
}

/** A feature flag the LLM must plumb into the code. */
export interface FeatureFlag {
	readonly id: string;
	flag: string;
	default: FlagDefault;
	owner: string;
	killCriteria: string;
}

/** How the change ships: roll-out, backfill, rollback and the flags to plumb. */
export interface OperationsMigration {
	strategy: MigrationStrategy | '';
	backwardCompatWindow: string;
	dataBackfill: string;
	rollbackPlan: string;
	notes: string;
	flagsExpected: FeatureFlag[];
}

/** A realistic sample data set per critical entity that the LLM imitates. */
export interface TestFixture {
	readonly id: string;
	name: string;
	scope: string;
	description: string;
	dataJson: string;
}

/** The five UI states an LLM must always handle for one screen. */
export type ScreenStates = Record<UiStateKey, string>;

/**
 * The persisted content of the Foundation operations slice — the operational
 * rails hosted as the "Ops" tab of the capability. `screenStates` is keyed
 * by the screen's full name (drawn from Experience's screen library on the
 * client). The selected sub-section / screen are per-user view state and live on
 * the store (local `$state`), never in this persisted+broadcast draft.
 */
export interface FoundationOperationsDraft {
	projectId: string;
	i18n: OperationsI18n;
	quality: OperationsQuality;
	migration: OperationsMigration;
	testFixtures: TestFixture[];
	screenStates: Record<string, ScreenStates>;
	lastSavedAt: string | null;
}

export function createEmptyI18n(): OperationsI18n {
	return {
		primaryLocale: '',
		timezone: '',
		dateFormat: '',
		numberFormat: '',
		currency: '',
		locales: [],
		notes: ''
	};
}

export function createEmptyQuality(): OperationsQuality {
	return {
		latencyP95Ms: '',
		latencyP99Ms: '',
		errorBudgetPct: '',
		availabilityPct: '',
		bundleSizeKb: '',
		ttiMs: '',
		a11yLevel: '',
		browsers: '',
		perfNotes: ''
	};
}

export function createEmptyMigration(): OperationsMigration {
	return {
		strategy: '',
		backwardCompatWindow: '',
		dataBackfill: '',
		rollbackPlan: '',
		notes: '',
		flagsExpected: []
	};
}

export function createEmptyScreenStates(): ScreenStates {
	return { empty: '', loading: '', error: '', success: '', partialData: '' };
}

export function createEmptyOperationsDraft(projectId: string): FoundationOperationsDraft {
	return {
		projectId,
		i18n: createEmptyI18n(),
		quality: createEmptyQuality(),
		migration: createEmptyMigration(),
		testFixtures: [],
		screenStates: {},
		lastSavedAt: null
	};
}

function newId(): string {
	return crypto.randomUUID();
}

export function createSupportedLocale(overrides: Partial<SupportedLocale> = {}): SupportedLocale {
	return { code: '', label: '', rtl: false, ...overrides };
}

// `id` is spread last in the factories below so a caller can never blank it: an
// absent/empty id in the overrides falls back to a fresh one, keeping the
// `readonly id: string` invariant that the keyed `{#each}` in the UI relies on.
export function createFeatureFlag({ id, ...rest }: Partial<FeatureFlag> = {}): FeatureFlag {
	return { id: id || newId(), flag: '', default: 'off', owner: '', killCriteria: '', ...rest };
}

export function createTestFixture({ id, ...rest }: Partial<TestFixture> = {}): TestFixture {
	return { id: id || newId(), name: '', scope: '', description: '', dataJson: '', ...rest };
}
