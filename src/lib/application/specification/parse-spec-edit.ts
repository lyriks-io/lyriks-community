import { isAnchor } from '$domain/discussions';
import { ADDED_KINDS, type AddedKind } from '$application/spec360/add-elements';
import { parseRuleEdit, type RuleEditRequest } from '$application/spec360/rule-edit';
import type { ProductClassification } from '../spec360/classification';
import { isProposedId } from '../spec360/edits';
import { isAuditLogLevel, isPerformanceUnit, type ActionTargetRow, type OperationsTargetEdit } from '../spec360/operations-targets';

/**
 * What the Specification 360° asks to change in place, read from an untrusted
 * body: an element's title, description and tags; a user or a core feature
 * added; an element deleted; an issue of What Lyriks noticed rejected (kept as it is) or put back to review. The anchor names the element by its spec id.
 */
export type SpecEditRequest =
	| RuleEditRequest
	| {
			readonly op: 'edit';
			readonly anchor: string;
			readonly text: string;
			readonly desc?: string;
			readonly tags?: readonly string[];
			/** The product's market, industry, product type and form factors (the product's summary only). */
			readonly classification?: ProductClassification;
	  }
	/** `id`: the one the page minted to show the new element before the answer (a UUID). */
	| { readonly op: 'add_user'; readonly id?: string }
	| { readonly op: 'add_core'; readonly id?: string }
	| { readonly op: 'add_feature'; readonly coreId: string; readonly id?: string }
	/** A journey, a component, a stack component, a constraint or a term added at the foot of its list (criterion 51e215ef). */
	| { readonly op: 'add_element'; readonly kind: AddedKind; readonly id?: string }
	/** An action added to a feature; the behavior engine mints its id (criterion 51e215ef). */
	| { readonly op: 'add_action'; readonly featureId: string }
	| { readonly op: 'delete'; readonly anchor: string }
	/** An issue of What Lyriks noticed rejected, kept as it is (criterion e0f69b3c). */
	| { readonly op: 'keep_finding'; readonly issueId: string }
	/** A rejection taken back by Undo: the issue is open again (criterion e0f69b3c). */
	| { readonly op: 'reopen_finding'; readonly issueId: string }
	/** A cell of who can do what ticked: `on` grants the user the action, off takes it back (criterion eba33558). */
	| { readonly op: 'tick_permission'; readonly roleId: string; readonly capabilityId: string; readonly on: boolean }
	/** A hand edit of a validated specification cancelled from Code drift: the element reads again what it read before (criterion 0873e142). */
	| { readonly op: 'cancel_hand_edit'; readonly anchor: string }
	/** A target of Operations set in place on Health (criterion 970aca7c). */
	| ({ readonly op: 'set_operations_target' } & OperationsTargetEdit);

const MAX_TEXT = 4000;
const MAX_TAGS = 60;

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length <= MAX_TEXT ? v : null);
const MAX_FORM_FACTORS = 40;
const MAX_ACTION_TARGETS = 50;
const short = (v: unknown): v is string => typeof v === 'string' && v.length <= 300;

/** The shape of a target of Operations only; whether its numbers are numbers is the server's to check. */
function operationsTargetIn(o: Raw): OperationsTargetEdit | string {
	if (o.target === 'audit-logs') return isAuditLogLevel(o.level) ? { target: 'audit-logs', level: o.level } : 'Pick None, Partial or Complete.';
	const v = (o.values !== null && typeof o.values === 'object' ? o.values : null) as Raw | null;
	if (!v) return 'Send the values of the target.';
	if (o.target === 'availability') {
		const notes = str(v.notes);
		if (!short(v.availabilityPct) || !short(v.errorBudgetPct) || notes === null) return 'Each availability value is a short text.';
		return { target: 'availability', values: { availabilityPct: v.availabilityPct, errorBudgetPct: v.errorBudgetPct, notes } };
	}
	if (o.target !== 'performance') return 'Name the target: performance, availability or audit-logs.';
	const notes = str(v.perfNotes);
	if (![v.latencyP95Ms, v.latencyP99Ms, v.ttiMs, v.bundleSizeKb].every(short) || notes === null) return 'Each performance value is a short text.';
	const rows = v.actions;
	if (!Array.isArray(rows) || rows.length > MAX_ACTION_TARGETS) return `At most ${MAX_ACTION_TARGETS} action targets.`;
	const actions: ActionTargetRow[] = [];
	for (const row of rows as Raw[]) {
		if (row === null || typeof row !== 'object' || !short(row.action) || !short(row.target) || !isPerformanceUnit(row.unit)) return 'Each action target has an action, a target and a unit among ms, s, rps and tps.';
		actions.push({ action: row.action, target: row.target, unit: row.unit });
	}
	return {
		target: 'performance',
		values: { actions, latencyP95Ms: v.latencyP95Ms as string, latencyP99Ms: v.latencyP99Ms as string, ttiMs: v.ttiMs as string, bundleSizeKb: v.bundleSizeKb as string, perfNotes: notes }
	};
}

/** The classification's shape only; which choices are known is the server's to check. */
function classificationIn(raw: unknown): ProductClassification | string {
	if (raw === null || typeof raw !== 'object') return 'The classification is an object.';
	const o = raw as Raw;
	const choice = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' && v.length <= 80 ? v : undefined);
	const marketType = choice(o.marketType);
	const industry = choice(o.industry);
	const productType = choice(o.productType);
	const factors = o.formFactors;
	if (marketType === undefined || industry === undefined || productType === undefined) return 'Each choice is a short code.';
	if (!Array.isArray(factors) || factors.length > MAX_FORM_FACTORS || factors.some((f) => typeof f !== 'string' || f.length > 80)) return 'The form factors are a short list of codes.';
	return { marketType, industry, productType, formFactors: factors as string[] };
}

export function parseSpecEdit(body: unknown): { ok: true; request: SpecEditRequest } | { ok: false; reason: string } {
	const o = (body !== null && typeof body === 'object' ? body : {}) as Raw;
	switch (o.op) {
		case 'upsert_rule': {
			const parsed = parseRuleEdit(o);
			return parsed.ok ? { ok: true, request: parsed.value } : { ok: false, reason: parsed.reason };
		}
		case 'add_user':
		case 'add_core':
			if (o.id === undefined) return { ok: true, request: { op: o.op } };
			return isProposedId(o.id) ? { ok: true, request: { op: o.op, id: o.id } } : { ok: false, reason: 'The new element\'s id is a UUID.' };
		case 'add_feature': {
			if (typeof o.coreId !== 'string' || o.coreId.length === 0 || o.coreId.length > 300) return { ok: false, reason: 'Name the core feature that takes the feature.' };
			if (o.id === undefined) return { ok: true, request: { op: 'add_feature', coreId: o.coreId } };
			return isProposedId(o.id) ? { ok: true, request: { op: 'add_feature', coreId: o.coreId, id: o.id } } : { ok: false, reason: 'The new element\'s id is a UUID.' };
		}
		case 'add_element': {
			const kind = ADDED_KINDS.find((k) => k === o.kind);
			if (!kind) return { ok: false, reason: 'Say what to add: a journey, a component, a stack component, a constraint or a term.' };
			if (o.id === undefined) return { ok: true, request: { op: 'add_element', kind } };
			return isProposedId(o.id) ? { ok: true, request: { op: 'add_element', kind, id: o.id } } : { ok: false, reason: 'The new element\'s id is a UUID.' };
		}
		case 'add_action':
			return typeof o.featureId === 'string' && o.featureId.length > 0 && o.featureId.length <= 300
				? { ok: true, request: { op: 'add_action', featureId: o.featureId } }
				: { ok: false, reason: 'Name the feature that takes the action.' };
		case 'delete':
			return isAnchor(o.anchor) ? { ok: true, request: { op: 'delete', anchor: o.anchor } } : { ok: false, reason: 'Name the element to delete.' };
		case 'tick_permission': {
			const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 300;
			if (!id(o.roleId) || !id(o.capabilityId) || typeof o.on !== 'boolean') return { ok: false, reason: 'Name the user, the action and whether it is granted.' };
			return { ok: true, request: { op: 'tick_permission', roleId: o.roleId as string, capabilityId: o.capabilityId as string, on: o.on } };
		}
		case 'set_operations_target': {
			const read = operationsTargetIn(o);
			return typeof read === 'string' ? { ok: false, reason: read } : { ok: true, request: { op: 'set_operations_target', ...read } };
		}
		case 'cancel_hand_edit':
			return isAnchor(o.anchor) ? { ok: true, request: { op: 'cancel_hand_edit', anchor: o.anchor } } : { ok: false, reason: 'Name the element whose edit to cancel.' };
		case 'keep_finding':
		case 'reopen_finding':
			return typeof o.issueId === 'string' && o.issueId.length > 0 && o.issueId.length <= 200 && !/\s/.test(o.issueId)
				? { ok: true, request: { op: o.op, issueId: o.issueId } }
				: { ok: false, reason: o.op === 'keep_finding' ? 'Name the issue to keep.' : 'Name the issue to put back to review.' };
		case 'edit': {
			if (!isAnchor(o.anchor)) return { ok: false, reason: 'Name the element to edit.' };
			const text = str(o.text);
			if (text === null) return { ok: false, reason: `The text holds at most ${MAX_TEXT} characters.` };
			const desc = o.desc === undefined ? undefined : str(o.desc);
			if (desc === null) return { ok: false, reason: `The description holds at most ${MAX_TEXT} characters.` };
			let tags: string[] | undefined;
			if (o.tags !== undefined) {
				if (!Array.isArray(o.tags) || o.tags.length > MAX_TAGS || o.tags.some((t) => typeof t !== 'string' || t.length > 300)) {
					return { ok: false, reason: `At most ${MAX_TAGS} tags, each a short text.` };
				}
				tags = o.tags as string[];
			}
			let classification: ProductClassification | undefined;
			if (o.classification !== undefined) {
				if (o.anchor !== 'product') return { ok: false, reason: 'Only the product is classified.' };
				const read = classificationIn(o.classification);
				if (typeof read === 'string') return { ok: false, reason: read };
				classification = read;
			}
			return {
				ok: true,
				request: { op: 'edit', anchor: o.anchor, text, ...(desc !== undefined ? { desc } : {}), ...(tags ? { tags } : {}), ...(classification ? { classification } : {}) }
			};
		}
		default:
			return { ok: false, reason: `Unknown change "${String(o.op)}".` };
	}
}
