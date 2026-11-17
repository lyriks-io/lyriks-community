import {
	AUDIT_LOG_LEVELS,
	PERFORMANCE_UNITS,
	type AuditLogLevel,
	type FoundationDefinitionDraft,
	type FoundationOperationsDraft,
	type PerformanceUnit
} from '$domain/foundation';
import { list, text } from './labels';

/**
 * The targets of Operations on Tech and data · Health, set in place by whoever
 * may edit the project, on a draft or a validated specification alike
 * (criterion 970aca7c): what the form opens on, what a person asks to write,
 * the refusal that names the field at fault, and the drafts the write leaves.
 * A target changes nothing the product does. Pure.
 */

export type OperationsTargetKey = 'performance' | 'availability' | 'audit-logs';
export const OPERATIONS_TARGETS: readonly OperationsTargetKey[] = ['performance', 'availability', 'audit-logs'];
export const OPERATIONS_TARGET_TITLE: Readonly<Record<OperationsTargetKey, string>> = {
	performance: 'Performance targets',
	availability: 'Availability',
	'audit-logs': 'Audit logs'
};

/** The response time of one key action, as typed: the target stays text until it is checked. */
export interface ActionTargetRow {
	readonly action: string;
	readonly target: string;
	readonly unit: PerformanceUnit;
}

export interface PerformanceForm {
	readonly actions: readonly ActionTargetRow[];
	readonly latencyP95Ms: string;
	readonly latencyP99Ms: string;
	readonly ttiMs: string;
	readonly bundleSizeKb: string;
	readonly perfNotes: string;
}

export interface AvailabilityForm {
	readonly availabilityPct: string;
	readonly errorBudgetPct: string;
	readonly notes: string;
}

export interface OperationsTargets {
	/** Null until someone answers: a definition never saved holds the form's default, not an answer. */
	readonly auditLogs: AuditLogLevel | null;
	readonly performance: PerformanceForm;
	readonly availability: AvailabilityForm;
}

export type OperationsTargetEdit =
	| { readonly target: 'audit-logs'; readonly level: AuditLogLevel }
	| { readonly target: 'performance'; readonly values: PerformanceForm }
	| { readonly target: 'availability'; readonly values: AvailabilityForm };

/** The meaning of each audit log level, said in words on Health (criteria 8a696e52 and 970aca7c). */
export const AUDIT_LOG_MEANING: Readonly<Record<AuditLogLevel, string>> = {
	none: 'No action leaves a trace in the audit log.',
	partial: 'Some actions leave a trace in the audit log, not all of them.',
	complete: 'Every action leaves a trace in the audit log.'
};

export const isAuditLogLevel = (v: unknown): v is AuditLogLevel => AUDIT_LOG_LEVELS.some((l) => l.code === v);
export const isPerformanceUnit = (v: unknown): v is PerformanceUnit => PERFORMANCE_UNITS.some((u) => u.code === v);

export function operationsTargets(definition: FoundationDefinitionDraft, operations: FoundationOperationsDraft): OperationsTargets {
	const q = operations.quality;
	return {
		auditLogs: definition.lastSavedAt !== null ? definition.security.auditLogs : null,
		performance: {
			actions: list(definition.technical.performance).map((p) => ({ action: text(p.action), target: String(p.target ?? ''), unit: p.unit })),
			latencyP95Ms: text(q.latencyP95Ms),
			latencyP99Ms: text(q.latencyP99Ms),
			ttiMs: text(q.ttiMs),
			bundleSizeKb: text(q.bundleSizeKb),
			perfNotes: text(q.perfNotes)
		},
		availability: { availabilityPct: text(q.availabilityPct), errorBudgetPct: text(q.errorBudgetPct), notes: text(definition.technical.availability) }
	};
}

const number = (value: string) => (/^\d+(\.\d+)?$/.test(value.trim().replace(',', '.')) ? Number(value.trim().replace(',', '.')) : null);
const blank = (value: string) => value.trim() === '';

/** What makes the edit refused, naming the field at fault; null when it can be written. */
export function operationsTargetRefusal(edit: OperationsTargetEdit): string | null {
	if (edit.target === 'audit-logs') return null;
	const amounts: [string, string][] =
		edit.target === 'performance'
			? [
					['p95 latency', edit.values.latencyP95Ms],
					['p99 latency', edit.values.latencyP99Ms],
					['Time to interactive', edit.values.ttiMs],
					['Bundle size', edit.values.bundleSizeKb]
				]
			: [];
	const shares: [string, string][] =
		edit.target === 'availability'
			? [
					['Time up', edit.values.availabilityPct],
					['Error budget', edit.values.errorBudgetPct]
				]
			: [];
	for (const [field, value] of amounts) if (!blank(value) && number(value) === null) return `${field}: write a number.`;
	for (const [field, value] of shares) {
		if (blank(value)) continue;
		const n = number(value);
		if (n === null || n > 100) return `${field}: write a percentage between 0 and 100.`;
	}
	if (edit.target === 'performance') {
		for (const row of edit.values.actions) {
			if (blank(row.action) && blank(row.target)) continue;
			if (blank(row.action)) return 'Name the action each response time is for.';
			if (number(row.target) === null) return `${text(row.action)}: write a number for its target.`;
		}
	}
	return null;
}

/** The value as stored: a number written with a decimal point, blank when not set. */
const stored = (value: string) => (blank(value) ? '' : String(number(value) ?? value.trim()));

/**
 * The drafts the edit leaves, null for a slice it does not touch. The caller
 * checks `operationsTargetRefusal` first: an unchecked edit is written as typed.
 */
export function withOperationsTarget(
	definition: FoundationDefinitionDraft,
	operations: FoundationOperationsDraft,
	edit: OperationsTargetEdit
): { definition: FoundationDefinitionDraft | null; operations: FoundationOperationsDraft | null } {
	if (edit.target === 'audit-logs') return { definition: { ...definition, security: { ...definition.security, auditLogs: edit.level } }, operations: null };
	if (edit.target === 'availability') {
		const v = edit.values;
		return {
			definition: { ...definition, technical: { ...definition.technical, availability: v.notes.trim() } },
			operations: { ...operations, quality: { ...operations.quality, availabilityPct: stored(v.availabilityPct), errorBudgetPct: stored(v.errorBudgetPct) } }
		};
	}
	const v = edit.values;
	const performance = v.actions
		.filter((r) => !blank(r.action) && number(r.target) !== null)
		.map((r) => ({ action: r.action.trim(), target: number(r.target) as number, unit: r.unit }));
	return {
		definition: { ...definition, technical: { ...definition.technical, performance } },
		operations: {
			...operations,
			quality: {
				...operations.quality,
				latencyP95Ms: stored(v.latencyP95Ms),
				latencyP99Ms: stored(v.latencyP99Ms),
				ttiMs: stored(v.ttiMs),
				bundleSizeKb: stored(v.bundleSizeKb),
				perfNotes: v.perfNotes.trim()
			}
		}
	};
}
