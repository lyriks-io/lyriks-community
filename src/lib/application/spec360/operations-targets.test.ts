import { describe, expect, it } from 'vitest';
import { createEmptyDataDraft } from '$domain/data';
import { createEmptyDefinitionDraft, createEmptyOperationsDraft } from '$domain/foundation';
import { parseSpecEdit } from '../specification/parse-spec-edit';
import { operationsTargetRefusal, operationsTargets, withOperationsTarget, type PerformanceForm } from './operations-targets';
import { healthItems } from './tech';

const P = 'p1';
const saved = () => ({ ...createEmptyDefinitionDraft(P), lastSavedAt: '2026-11-03T00:00:00.000Z' });
const perf = (over: Partial<PerformanceForm> = {}): PerformanceForm => ({
	actions: [],
	latencyP95Ms: '',
	latencyP99Ms: '',
	ttiMs: '',
	bundleSizeKb: '',
	perfNotes: '',
	...over
});

/** The targets of Operations are set in place on Health [criterion:970aca7c]. */
describe('the targets of Operations set in place [criterion:970aca7c]', () => {
	it('opens on what the spec holds, the audit level unset until someone answered', () => {
		expect(operationsTargets(createEmptyDefinitionDraft(P), createEmptyOperationsDraft(P)).auditLogs).toBeNull();
		const definition = saved();
		definition.technical.performance = [{ action: 'Search a room', target: 300, unit: 'ms' }];
		const operations = createEmptyOperationsDraft(P);
		operations.quality = { ...operations.quality, availabilityPct: '99.9' };
		const t = operationsTargets(definition, operations);
		expect(t.auditLogs).toBe('partial');
		expect(t.performance.actions).toEqual([{ action: 'Search a room', target: '300', unit: 'ms' }]);
		expect(t.availability.availabilityPct).toBe('99.9');
	});

	it('picks an audit level, None included, and Health reads None instead of hiding the row', () => {
		const next = withOperationsTarget(saved(), createEmptyOperationsDraft(P), { target: 'audit-logs', level: 'none' });
		expect(next.operations).toBeNull();
		expect(next.definition?.security.auditLogs).toBe('none');
		const items = healthItems({ data: createEmptyDataDraft(P), definition: next.definition!, operations: createEmptyOperationsDraft(P), coverage: [] });
		expect(items.find((i) => i.key === 'audit-logs')).toMatchObject({ description: 'No action leaves a trace in the audit log.', chips: ['None'] });
	});

	it('writes the performance targets, a blank field not set and a blank row dropped', () => {
		const values = perf({
			actions: [
				{ action: ' Search a room ', target: '300', unit: 'ms' },
				{ action: '', target: '', unit: 'ms' }
			],
			latencyP95Ms: '250',
			ttiMs: ' ',
			perfNotes: ' On a 4G phone. '
		});
		expect(operationsTargetRefusal({ target: 'performance', values })).toBeNull();
		const next = withOperationsTarget(saved(), createEmptyOperationsDraft(P), { target: 'performance', values });
		expect(next.definition?.technical.performance).toEqual([{ action: 'Search a room', target: 300, unit: 'ms' }]);
		expect(next.operations?.quality).toMatchObject({ latencyP95Ms: '250', latencyP99Ms: '', ttiMs: '', perfNotes: 'On a 4G phone.' });
	});

	it('writes the availability, a decimal comma read as a point', () => {
		const next = withOperationsTarget(saved(), createEmptyOperationsDraft(P), {
			target: 'availability',
			values: { availabilityPct: '99,9', errorBudgetPct: '0.1', notes: 'Business hours.' }
		});
		expect(next.operations?.quality).toMatchObject({ availabilityPct: '99.9', errorBudgetPct: '0.1' });
		expect(next.definition?.technical.availability).toBe('Business hours.');
	});

	it('refuses what is not a number, or a percentage outside 0 to 100, naming the field', () => {
		expect(operationsTargetRefusal({ target: 'availability', values: { availabilityPct: '140', errorBudgetPct: '', notes: '' } })).toBe(
			'Time up: write a percentage between 0 and 100.'
		);
		expect(operationsTargetRefusal({ target: 'performance', values: perf({ latencyP99Ms: 'fast' }) })).toBe('p99 latency: write a number.');
		expect(operationsTargetRefusal({ target: 'performance', values: perf({ actions: [{ action: 'Book', target: 'soon', unit: 's' }] }) })).toBe(
			'Book: write a number for its target.'
		);
		expect(operationsTargetRefusal({ target: 'performance', values: perf({ actions: [{ action: '', target: '2', unit: 's' }] }) })).toBe(
			'Name the action each response time is for.'
		);
	});

	it('reads the change from an untrusted body, its shape only', () => {
		expect(parseSpecEdit({ op: 'set_operations_target', target: 'audit-logs', level: 'complete' })).toEqual({
			ok: true,
			request: { op: 'set_operations_target', target: 'audit-logs', level: 'complete' }
		});
		expect(parseSpecEdit({ op: 'set_operations_target', target: 'audit-logs', level: 'most' })).toEqual({ ok: false, reason: 'Pick None, Partial or Complete.' });
		const body = { op: 'set_operations_target', target: 'performance', values: { ...perf(), actions: [{ action: 'Book', target: '2', unit: 'hours' }] } };
		expect(parseSpecEdit(body).ok).toBe(false);
		expect(parseSpecEdit({ op: 'set_operations_target', target: 'availability', values: { availabilityPct: '99', errorBudgetPct: '1', notes: '' } }).ok).toBe(true);
	});
});
