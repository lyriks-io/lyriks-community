import {
	createEmptyOperationsDraft,
	createEmptyI18n,
	createEmptyMigration,
	createEmptyQuality,
	createEmptyScreenStates,
	createFeatureFlag,
	createSupportedLocale,
	createTestFixture,
	isFlagDefault,
	isMigrationStrategy,
	UI_STATE_KEYS,
	type FeatureFlag,
	type FoundationOperationsDraft,
	type ScreenStates,
	type SupportedLocale,
	type TestFixture
} from '$domain/foundation';
import { parseStableRecords } from './parse-stable-records';

/**
 * Anti-corruption guard for untrusted Operations payloads. Same shape as the
 * sibling parsers: merge over defaults, pin projectId, and rebuild each nested
 * record through its factory so ids, enum fields and array fields are always
 * present regardless of what the client sent.
 */
export function parseOperationsDraft(input: unknown, projectId: string): FoundationOperationsDraft {
	const base = createEmptyOperationsDraft(projectId);
	if (input === null || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;

	const str = (v: unknown): string => (typeof v === 'string' ? v : '');
	const obj = (v: unknown): Record<string, unknown> =>
		v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

	const i18nSrc = obj(src.i18n);
	const localesSrc = Array.isArray(i18nSrc.locales) ? i18nSrc.locales : [];
	const locales: SupportedLocale[] = localesSrc.map((raw) => {
		const l = obj(raw);
		return createSupportedLocale({ code: str(l.code), label: str(l.label), rtl: l.rtl === true });
	}).filter(
		(locale, index, all) =>
			!locale.code ||
			all.findIndex((candidate) => candidate.code.toLowerCase() === locale.code.toLowerCase()) ===
				index
	);
	const i18n = {
		...createEmptyI18n(),
		primaryLocale: str(i18nSrc.primaryLocale),
		timezone: str(i18nSrc.timezone),
		dateFormat: str(i18nSrc.dateFormat),
		numberFormat: str(i18nSrc.numberFormat),
		currency: str(i18nSrc.currency),
		locales,
		notes: str(i18nSrc.notes)
	};

	const qSrc = obj(src.quality);
	const quality = {
		...createEmptyQuality(),
		latencyP95Ms: str(qSrc.latencyP95Ms),
		latencyP99Ms: str(qSrc.latencyP99Ms),
		errorBudgetPct: str(qSrc.errorBudgetPct),
		availabilityPct: str(qSrc.availabilityPct),
		bundleSizeKb: str(qSrc.bundleSizeKb),
		ttiMs: str(qSrc.ttiMs),
		a11yLevel: str(qSrc.a11yLevel),
		browsers: str(qSrc.browsers),
		perfNotes: str(qSrc.perfNotes)
	};

	const mSrc = obj(src.migration);
	const flagsExpected: FeatureFlag[] = parseStableRecords(
		mSrc.flagsExpected,
		'feature-flag',
		(f, id) =>
			createFeatureFlag({
					id,
					flag: str(f.flag),
					default: isFlagDefault(f.default) ? f.default : 'off',
					owner: str(f.owner),
					killCriteria: str(f.killCriteria)
				})
	);
	const migration = {
		...createEmptyMigration(),
		strategy: isMigrationStrategy(mSrc.strategy) ? mSrc.strategy : ('' as const),
		backwardCompatWindow: str(mSrc.backwardCompatWindow),
		dataBackfill: str(mSrc.dataBackfill),
		rollbackPlan: str(mSrc.rollbackPlan),
		notes: str(mSrc.notes),
		flagsExpected
	};

	const testFixtures: TestFixture[] = parseStableRecords(
		src.testFixtures,
		'test-fixture',
		(f, id) =>
			createTestFixture({
					id,
					name: str(f.name),
					scope: str(f.scope),
					description: str(f.description),
					dataJson: str(f.dataJson)
				})
	);

	const screenStatesSrc = obj(src.screenStates);
	const screenStates: Record<string, ScreenStates> = {};
	for (const [screen, raw] of Object.entries(screenStatesSrc)) {
		const s = obj(raw);
		const states = createEmptyScreenStates();
		for (const key of UI_STATE_KEYS) states[key] = str(s[key]);
		screenStates[screen] = states;
	}

	return {
		...base,
		projectId,
		i18n,
		quality,
		migration,
		testFixtures,
		screenStates,
		lastSavedAt: typeof src.lastSavedAt === 'string' ? src.lastSavedAt : null
	};
}
