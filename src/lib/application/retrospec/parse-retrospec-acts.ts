import { COMMENT_MAX_LENGTH, isChangeVerdict, isDocsFrom, isRetrospecMode, isRetrospecScope, parseDocsLocation, type PersonRef, type RetrospecAct, type RetrospecMode } from '$domain/retrospec';

/**
 * The acts a page sends to the retrospecification, read from an untrusted body
 * (anti-corruption at the edge). What the server owns is never taken from the
 * body: a run's baseline is read from the store when the act arrives, and the
 * baseline a publication captures is named by the server. An act that does not
 * read whole is refused with the reason, never half applied.
 */
export type IncomingRetrospecAct =
	| Exclude<
			RetrospecAct,
			| { op: 'start' }
			| { op: 'publish' }
			| { op: 'remind' }
			| { op: 'request_validation' | 'cancel_validation_request' }
			| { op: 'edit' }
			| { op: 'keep_drift' }
			| { op: 'send_back_drift' }
			| { op: 'undo_drift' }
			| { op: 'cancel_spec_edit' }
			| { op: 'keep_spec_edit' }
			| { op: 'record_commit' }
			| { op: 'check_spec_edits' }
			| { op: 'report_changes' }
			| { op: 'withdraw_changes' }
			| { op: 'end_reading' }
			| { op: 'record_written' }
	  >
	| { readonly op: 'start'; readonly mode: RetrospecMode }
	| { readonly op: 'publish' };

type Raw = Record<string, unknown>;
/** Bounds what one Validate all names; a report reaches this size only over several readings. */
const MAX_VALIDATED_AT_ONCE = 10_000;
const text = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.trim() !== '' && v.length <= max ? v : null);
const total = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);

function person(v: unknown): PersonRef | null {
	if (v === null || typeof v !== 'object') return null;
	const id = text((v as Raw).id, 320);
	if (!id) return null;
	return { id: id.trim(), name: (text((v as Raw).name, 200) ?? id).trim() };
}

function item(o: Raw): { itemId: string; title: string; tab: string } | null {
	const itemId = text(o.itemId);
	if (!itemId) return null;
	return { itemId, title: (text(o.title, 1000) ?? '').trim(), tab: (text(o.tab, 40) ?? '').trim() };
}

function one(raw: unknown): IncomingRetrospecAct | string {
	if (raw === null || typeof raw !== 'object') return 'An act must be an object.';
	const o = raw as Raw;
	switch (o.op) {
		case 'start':
		case 'choose_mode':
			return isRetrospecMode(o.mode) ? { op: o.op, mode: o.mode } : 'mode must be "repo", "docs" or "both".';
		case 'choose_scope':
			return isRetrospecScope(o.scope) ? { op: 'choose_scope', scope: o.scope } : 'scope must be "delta" or "whole".';
		case 'choose_docs':
			// Where the documentation is (criterion b6ad9ca2): bounded here, a link is checked when the prompt is built.
			return isDocsFrom(o.from) ? { op: 'choose_docs', at: parseDocsLocation(o) } : 'from must be "computer" or "links".';
		case 'launch':
		case 'end_analysis':
		case 'cancel':
		case 'publish':
		case 'ask_notify':
		case 'cancel_notify':
			return { op: o.op };
		case 'open_writing':
			return { op: 'open_writing' };
		case 'decide_change': {
			const id = text(o.id, 200);
			if (!id) return 'id names the change of the report.';
			if (o.verdict !== null && !isChangeVerdict(o.verdict)) return 'verdict must be "validated", "reverted", "rejected" or null.';
			if (o.verdict !== 'rejected') return { op: 'decide_change', id, verdict: o.verdict };
			const note = text(o.note, COMMENT_MAX_LENGTH);
			return note ? { op: 'decide_change', id, verdict: 'rejected', note } : 'Say what must change before it goes into the specification.';
		}
		case 'validate_changes': {
			// Validate all names every card it validates, however many: one act, never one per change.
			if (!Array.isArray(o.ids) || o.ids.length === 0 || o.ids.length > MAX_VALIDATED_AT_ONCE) return `ids names from 1 to ${MAX_VALIDATED_AT_ONCE} changes of the report.`;
			const ids = o.ids.map((v) => text(v, 200)?.trim() ?? '');
			return ids.every(Boolean) ? { op: 'validate_changes', ids: [...new Set(ids)] } : 'Each id names a change of the report.';
		}
		case 'start_review':
			return { op: 'start_review', total: total(o.total) ?? 0 };
		case 'validate':
		case 'reject':
		case 'set_aside': {
			const target = item(o);
			return target ? { op: o.op, ...target, total: total(o.total) } : 'itemId is required.';
		}
		case 'share': {
			const target = item(o);
			const to = person(o.to);
			if (!target) return 'itemId is required.';
			return to ? { op: 'share', ...target, to, total: total(o.total) } : 'Name who to share it with.';
		}
		case 'withdraw':
		case 'clear_flag': {
			const itemId = text(o.itemId);
			return itemId ? { op: o.op, itemId, total: total(o.total) } : 'itemId is required.';
		}
		case 'comment': {
			const itemId = text(o.itemId);
			const commentId = text(o.commentId, 80);
			const body = typeof o.text === 'string' ? o.text : '';
			if (!itemId || !commentId) return 'itemId and commentId are required.';
			return { op: 'comment', itemId, commentId, text: body };
		}
		case 'resolve_comment': {
			const itemId = text(o.itemId);
			const commentId = text(o.commentId, 80);
			return itemId && commentId ? { op: 'resolve_comment', itemId, commentId } : 'itemId and commentId are required.';
		}
		default:
			return `Unknown act "${String(o.op)}".`;
	}
}

/** The acts of a body, or the reason the body is refused. */
export function parseRetrospecActs(body: unknown): { ok: true; acts: IncomingRetrospecAct[] } | { ok: false; reason: string } {
	const list = body !== null && typeof body === 'object' ? (body as Raw).acts : null;
	if (!Array.isArray(list) || list.length === 0) return { ok: false, reason: 'acts must be a non-empty list.' };
	if (list.length > 200) return { ok: false, reason: 'At most 200 acts at once.' };
	const acts: IncomingRetrospecAct[] = [];
	for (const raw of list) {
		const parsed = one(raw);
		if (typeof parsed === 'string') return { ok: false, reason: parsed };
		acts.push(parsed);
	}
	return { ok: true, acts };
}
