import { ARCH_LAYERS, type ProjectArchitectureDraft } from '$domain/architecture';
import { DB_ENGINES, HOST_KINDS, type ProjectDataDraft } from '$domain/data';
import {
	ALL_FORM_FACTORS,
	AUDIT_LOG_LEVELS,
	AUTHORIZATION_MODELS,
	AUTH_MECHANISMS,
	CERTIFICATIONS,
	ENCRYPTION_SCOPES,
	catalogFormFactor,
	LANGUAGES,
	REGULATIONS,
	RETENTION_ACTIONS,
	type FormFactorCode,
	type FoundationDefinitionDraft,
	type FoundationIdentityDraft,
	type FoundationOperationsDraft
} from '$domain/foundation';
import { languageOwnName } from '$domain/language';
import { compareNames, sortByName } from '$domain/shared';
import type { FeatureImplementationCoverage } from '../analysis/load-implementation-coverage';
import { counted, labelOf, labelsOf, list, text, withUnit } from './labels';
import { AUDIT_LOG_MEANING, operationsTargets } from './operations-targets';

/**
 * Tech and data as the Specification 360° reads it: the stack by layer, the
 * facts the spec holds about running the product (Health), the requirements
 * and the technical constraints, and the facts written about the data. Each
 * item is built only from what the spec says; an item with nothing to say is
 * not produced, and a requirement left unanswered reads as such.
 */

/** Values of a list of names from A to Z (criterion 4b3d2b4d); a sorted copy. */
const aToZ = (values: readonly string[]): string[] => [...values].sort(compareNames);

/** One titled fact with its chips, the row shape Health and the data facts share. */
export interface FactItem {
	/** The stable key the item is discussed under. */
	readonly key: string;
	readonly title: string;
	readonly description: string;
	readonly chips: readonly string[];
	/** What each chip names, in the chips' order, for the page to open it there: a database's id (criterion e8a213be). */
	readonly chipRefs?: readonly string[];
}

/* ── Architecture ─────────────────────────────────────────────────────── */

export interface StackComponent {
	readonly id: string;
	readonly name: string;
	/** What it is for. */
	readonly role: string;
	/** "Version 19.2.7", '' when unknown. */
	readonly version: string;
	readonly repository: string;
}

export interface StackLayer {
	readonly code: string;
	readonly label: string;
	readonly components: readonly StackComponent[];
}

/**
 * The technologies on the architecture board, by layer. The upstream
 * technologies the board has not taken in (`derivedTech`) are suggestions to
 * the author, not part of the stack, so they are not shown.
 */
export function stackLayers(architecture: ProjectArchitectureDraft): StackLayer[] {
	return ARCH_LAYERS.map((layer) => ({
		code: layer.code,
		label: layer.label.toUpperCase(),
		// The layers keep the catalog's order; the technologies of a layer read from A to Z (criterion 4b3d2b4d).
		components: sortByName(
			list(architecture.techChoices)
				.filter((t) => t.layer === layer.code && text(t.name))
				.map((t) => ({
					id: t.id,
					name: text(t.name),
					role: text(t.role) || text(t.description),
					version: text(t.version) ? `Version ${text(t.version)}` : '',
					repository: t.repository?.trim() ?? ''
				}))
		)
	})).filter((l) => l.components.length > 0);
}

/* ── Health ───────────────────────────────────────────────────────────── */

/** How much of the spec the code holds, read from the implementation coverage. */
export interface ImplementationReading {
	/** Spec elements located in the code, out of `expected`. */
	readonly found: number;
	readonly expected: number;
	/** "99.7 %": one decimal at most, rounded down so it never reads 100 % before every element is found. */
	readonly share: string;
	/** found / expected, 0 to 1, for the bar. */
	readonly ratio: number;
	/** The features with something to find, then those with all of it found, and those with none of it. */
	readonly measured: number;
	readonly complete: number;
	readonly none: number;
}

/** The implementation coverage summed over the features it measures; null when the code was never located. Pure. */
export function implementationReading(coverage: readonly FeatureImplementationCoverage[]): ImplementationReading | null {
	const measured = coverage.filter((c) => c.expected > 0);
	if (measured.length === 0) return null;
	const found = measured.reduce((n, c) => n + Math.min(c.found, c.expected), 0);
	const expected = measured.reduce((n, c) => n + c.expected, 0);
	const tenths = Math.floor((found / expected) * 1000);
	return {
		found,
		expected,
		share: `${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)} %`,
		ratio: found / expected,
		measured: measured.length,
		complete: measured.filter((c) => c.found >= c.expected).length,
		none: measured.filter((c) => c.found === 0).length
	};
}

/** The outline a form factor is drawn as (criterion 4af7cac8): every form factor of the catalog has one. */
export type DeviceShape =
	| 'phone'
	| 'tablet'
	| 'desktop'
	| 'browser'
	| 'terminal'
	| 'terminal-panel'
	| 'chat'
	| 'microphone'
	| 'hand'
	| 'eye'
	| 'headset'
	| 'braces'
	| 'bolt'
	| 'robot'
	| 'sparkles'
	| 'prompt'
	| 'blocks'
	| 'window-in-window'
	| 'sensor'
	| 'face-scan'
	| 'ambient';

// Total over the catalog, so a form factor added to it cannot ship without its drawing.
const DEVICE_SHAPE: Readonly<Record<FormFactorCode, DeviceShape>> = {
	mobile_touch: 'phone',
	tablet_kiosk: 'tablet',
	desktop_gui: 'desktop',
	web_interface: 'browser',
	cli: 'terminal',
	tui: 'terminal-panel',
	text_chatbot: 'chat',
	voice_assistant: 'microphone',
	gesture_ui: 'hand',
	eye_tracking: 'eye',
	vr_ar_mr: 'headset',
	api: 'braces',
	webhooks_events: 'bolt',
	rpa: 'robot',
	ai_agent: 'sparkles',
	prompt_interface: 'prompt',
	nocode_lowcode: 'blocks',
	embedded_ui: 'window-in-window',
	iot_sensors: 'sensor',
	biometric: 'face-scan',
	ambient_invisible: 'ambient'
};

/** Null only for a code the catalog does not know (written by an older version): it reads as a chip. */
const shapeOf = (code: string): DeviceShape | null => (DEVICE_SHAPE as Readonly<Partial<Record<string, DeviceShape>>>)[code] ?? null;

export interface DeviceReading {
	readonly code: string;
	readonly label: string;
	readonly shape: DeviceShape | null;
}

/** The form factors the product runs on, each with the outline it is drawn as; a short name reads as the catalog's own. Pure. */
export function formFactorDevices(codes: readonly string[]): DeviceReading[] {
	// A short name and the catalog's code it stands for are one form factor; they read from A to Z (criterion 4b3d2b4d).
	return sortByName(
		[...new Set(codes.map(catalogFormFactor))].map((code) => ({ code, label: labelOf(ALL_FORM_FACTORS, code), shape: shapeOf(code) })),
		(d) => d.label
	);
}

export interface MachineReading {
	readonly id: string;
	readonly name: string;
	/** "On-prem", "Cloud"... */
	readonly kind: string;
	/** "eu-west-3 · Scaleway": where it is, when the spec says. */
	readonly place: string;
	readonly description: string;
}

/** Where the product runs: the devices of its form factors, then the machines of the infrastructure map. Pure. */
export function environmentsReading(input: { data: ProjectDataDraft; identity: Pick<FoundationIdentityDraft, 'formFactors'> }): {
	readonly devices: readonly DeviceReading[];
	readonly machines: readonly MachineReading[];
} {
	return {
		devices: formFactorDevices(list(input.identity.formFactors)),
		machines: sortByName(
			list(input.data.hosts)
				.filter((h) => text(h.name))
				.map((h) => ({
					id: h.id,
					name: text(h.name),
					kind: labelOf(HOST_KINDS, h.kind),
					place: [text(h.region), text(h.provider)].filter(Boolean).join(' · '),
					description: text(h.description)
				}))
		)
	};
}

// Each target of Operations says what it means in words (criterion 8a696e52).
const PERFORMANCE_MEANING = 'How fast the product must answer.';
const AVAILABILITY_MEANING = 'How much of the time the product must be up.';

export function healthItems(input: {
	data: ProjectDataDraft;
	definition: FoundationDefinitionDraft;
	operations: FoundationOperationsDraft;
	coverage: readonly FeatureImplementationCoverage[];
}): FactItem[] {
	const { data, definition, operations, coverage } = input;
	const items: FactItem[] = [];

	const implementation = implementationReading(coverage);
	if (implementation) {
		const { found, expected, measured, complete, none } = implementation;
		items.push({
			key: 'implementation',
			title: 'Implementation',
			description: `${found} of ${expected} spec elements are located in the code.`,
			chips: [
				counted(measured, 'feature') + ' measured',
				`${complete} fully implemented`,
				...(none ? [`${none} with no code found`] : [])
			]
		});
	}

	const hosts = list(data.hosts).filter((h) => text(h.name));
	if (hosts.length > 0) {
		items.push({
			key: 'environments',
			title: 'Environments',
			description:
				hosts.length === 1 && text(hosts[0].description)
					? text(hosts[0].description)
					: `${counted(hosts.length, 'machine')} declared.`,
			chips: hosts.map((h) =>
				[text(h.name), labelOf(HOST_KINDS, h.kind), text(h.region)].filter(Boolean).join(' · ')
			)
		});
	}

	const q = operations.quality;
	const perf = [
		...list(definition.technical.performance)
			.filter((p) => text(p.action))
			.map((p) => `${text(p.action)} · ${withUnit(p.target, p.unit)}`),
		...(text(q.latencyP95Ms) ? [`p95 · ${text(q.latencyP95Ms)} ms`] : []),
		...(text(q.latencyP99Ms) ? [`p99 · ${text(q.latencyP99Ms)} ms`] : []),
		...(text(q.ttiMs) ? [`Time to interactive · ${text(q.ttiMs)} ms`] : []),
		...(text(q.bundleSizeKb) ? [`Bundle · ${text(q.bundleSizeKb)} kB`] : [])
	];
	if (perf.length > 0) {
		items.push({
			key: 'performance',
			title: 'Performance targets',
			description: text(q.perfNotes) || PERFORMANCE_MEANING,
			chips: perf
		});
	}

	const availability = [
		...(text(definition.technical.availability) ? [text(definition.technical.availability)] : []),
		...(text(q.availabilityPct) ? [`Availability · ${text(q.availabilityPct)} %`] : []),
		...(text(q.errorBudgetPct) ? [`Error budget · ${text(q.errorBudgetPct)} %`] : [])
	];
	if (availability.length > 0) {
		items.push({ key: 'availability', title: 'Availability', description: AVAILABILITY_MEANING, chips: availability });
	}

	// A definition never saved holds the form's defaults ('partial' audit logs), not answers; None is an answer (criterion 970aca7c).
	const audit = operationsTargets(definition, operations).auditLogs;
	if (audit) {
		items.push({ key: 'audit-logs', title: 'Audit logs', description: AUDIT_LOG_MEANING[audit] ?? '', chips: [labelOf(AUDIT_LOG_LEVELS, audit)] });
	}
	return items;
}

/* ── Requirements ─────────────────────────────────────────────────────── */

export interface RequirementRow {
	readonly label: string;
	readonly values: readonly string[];
}

export interface RequirementGroup {
	/** The question it answers, the key it is discussed under. */
	readonly key: 'runtime' | 'languages' | 'security' | 'compliance' | 'accessibility';
	readonly title: string;
	readonly rows: readonly RequirementRow[];
}

export interface TechnicalConstraint {
	readonly id: string;
	readonly title: string;
	readonly detail: string;
}

export function requirementGroups(input: {
	identity: FoundationIdentityDraft;
	definition: FoundationDefinitionDraft;
	operations: FoundationOperationsDraft;
}): RequirementGroup[] {
	const { identity, definition, operations } = input;
	const answered = definition.lastSavedAt !== null;
	const i18n = operations.i18n;
	const localeLabel = new Map(list(i18n.locales).map((l) => [l.code, l.label]));
	const languages = list(definition.market.languages).map((code) => localeLabel.get(code) || labelOf(LANGUAGES, code));
	const optional = (label: string, value: string): RequirementRow[] =>
		text(value) ? [{ label, values: [text(value)] }] : [];

	return [
		{
			key: 'runtime',
			title: 'WHERE IT MUST RUN',
			rows: [
				{ label: 'Platforms', values: list(definition.technical.compatibilities) },
				...optional('Browsers', operations.quality.browsers),
				{ label: 'Form factors', values: aToZ(labelsOf(ALL_FORM_FACTORS, [...new Set(list(identity.formFactors).map(catalogFormFactor))])) }
			]
		},
		{
			key: 'languages',
			title: 'LANGUAGES AND LOCALES',
			rows: [
				{ label: 'Languages', values: languages },
				...optional('Primary language', text(i18n.primaryLocale) ? languageOwnName(i18n.primaryLocale) : ''),
				...optional('Date format', i18n.dateFormat),
				...optional('Number format', i18n.numberFormat),
				...optional('Currency', i18n.currency),
				...optional('Time zone', i18n.timezone)
			]
		},
		{
			key: 'security',
			title: 'SECURITY',
			rows: [
				{ label: 'Authentication', values: aToZ(labelsOf(AUTH_MECHANISMS, list(definition.security.authentication))) },
				{
					label: 'Authorization',
					values: answered && definition.security.authorization ? [labelOf(AUTHORIZATION_MODELS, definition.security.authorization)] : []
				},
				{ label: 'Encryption', values: aToZ(labelsOf(ENCRYPTION_SCOPES, list(definition.security.encryption))) }
			]
		},
		{
			key: 'compliance',
			title: 'COMPLIANCE',
			rows: [
				{ label: 'Regulations', values: aToZ(labelsOf(REGULATIONS, list(definition.market.regulations))) },
				{ label: 'Certifications', values: aToZ(labelsOf(CERTIFICATIONS, list(definition.security.expectedCertifications))) }
			]
		},
		{
			key: 'accessibility',
			title: 'ACCESSIBILITY',
			rows: [{ label: 'Standards', values: aToZ(list(operations.quality.a11yStandards).filter((s) => text(s))) }]
		}
	];
}

/** Where it must run, as the page draws it: the devices of its form factors, its platforms, its browsers. Pure. */
export function runtimeReading(input: {
	identity: Pick<FoundationIdentityDraft, 'formFactors'>;
	definition: FoundationDefinitionDraft;
	operations: FoundationOperationsDraft;
}): { readonly devices: readonly DeviceReading[]; readonly platforms: readonly string[]; readonly browsers: readonly string[] } {
	return {
		devices: formFactorDevices(list(input.identity.formFactors)),
		platforms: aToZ(list(input.definition.technical.compatibilities).map(text).filter(Boolean)),
		browsers: text(input.operations.quality.browsers) ? [text(input.operations.quality.browsers)] : []
	};
}

export interface LanguageChip {
	readonly label: string;
	readonly primary: boolean;
}

/** A locale code down to its language ("en-GB" is "en"). */
const languagePart = (code: string) => code.trim().split(/[-_]/)[0]?.toLowerCase() ?? '';

/**
 * The languages, one chip each, the primary one marked (first, when it is not
 * among the languages), and the formats the spec states. Pure.
 */
export function languagesReading(input: { definition: FoundationDefinitionDraft; operations: FoundationOperationsDraft }): {
	readonly languages: readonly LanguageChip[];
	readonly formats: readonly RequirementRow[];
} {
	const i18n = input.operations.i18n;
	const localeLabel = new Map(list(i18n.locales).map((l) => [l.code, l.label]));
	const primary = text(i18n.primaryLocale);
	const isPrimary = (code: string) => !!primary && (code === primary || languagePart(code) === languagePart(primary));
	const languages = list(input.definition.market.languages)
		.filter((code) => text(code))
		.map((code) => ({ label: localeLabel.get(code) || labelOf(LANGUAGES, code), primary: isPrimary(code) }));
	// The primary language first, the others from A to Z (criterion 4b3d2b4d).
	const sorted = [...languages.filter((l) => l.primary), ...sortByName(languages.filter((l) => !l.primary), (l) => l.label)];
	const marked = primary && !languages.some((l) => l.primary) ? [{ label: languageOwnName(primary), primary: true }, ...sorted] : sorted;
	const format = (label: string, value: string): RequirementRow[] => (text(value) ? [{ label, values: [text(value)] }] : []);
	return {
		languages: marked,
		formats: [
			...format('Dates', i18n.dateFormat),
			...format('Numbers', i18n.numberFormat),
			...format('Currency', i18n.currency),
			...format('Time zone', i18n.timezone)
		]
	};
}

export function technicalConstraints(architecture: ProjectArchitectureDraft): TechnicalConstraint[] {
	return sortByName(
		list(architecture.constraints)
			.filter((c) => text(c.title))
			.map((c) => ({ id: c.id, title: text(c.title), detail: text(c.detail) })),
		(c) => c.title
	);
}

/* ── Data ─────────────────────────────────────────────────────────────── */

/** The facts the spec writes about the data beside its map. */
export function dataFacts(definition: FoundationDefinitionDraft, data: ProjectDataDraft): FactItem[] {
	const items: FactItem[] = [];
	const retention = list(definition.security.dataRetention).filter((r) => text(r.dataType));
	if (retention.length > 0) {
		items.push({
			key: 'retention',
			title: 'Data retention',
			description: '',
			chips: aToZ(retention.map((r) => [text(r.dataType), text(r.duration), labelOf(RETENTION_ACTIONS, r.actionAfter)].filter(Boolean).join(' · ')))
		});
	}
	const databases = sortByName(list(data.databases).filter((d) => text(d.name)), (d) => text(d.name));
	if (databases.length > 0) {
		// Each database says what it holds, its tables counted; an engine the spec leaves at Other says nothing (criterion e8a213be).
		const tables = (id: string) => list(data.entities).filter((e) => e.databaseId === id).length;
		const engine = (code: string) => (code && code !== 'other' ? labelOf(DB_ENGINES, code) : '');
		items.push({
			key: 'databases',
			title: 'Databases',
			description: databases.length === 1 && text(databases[0].description) ? text(databases[0].description) : `${counted(databases.length, 'database')} hold the data.`,
			chips: databases.map((d) => [text(d.name), engine(d.engine), tables(d.id) ? counted(tables(d.id), 'table') : 'no table'].filter(Boolean).join(' · ')),
			chipRefs: databases.map((d) => d.id)
		});
	}
	return items;
}
