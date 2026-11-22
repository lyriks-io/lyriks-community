/**
 * The acts the Specification 360° sends about its validation, read from an
 * untrusted body. Only ids travel: the element's title, who must validate it,
 * the baseline a definitive validation captures and the code a change reads
 * are all read by the server when the act arrives.
 */
export type SpecValidationAct =
	/** A rejection asks for a change (criterion a4ef7658): the element's validations go and it waits on its validators again. */
	| { readonly op: 'validate' | 'withdraw' | 'reject'; readonly itemId: string }
	/** The same validation, given from the Simulation of a change request (EVO-003): its version must not be frozen. */
	| { readonly op: 'validate'; readonly itemId: string; readonly fromRequest: string }
	/** Take back the validation a landed change request gave the element (EVO-002). */
	| { readonly op: 'withdraw_request_validation'; readonly itemId: string }
	| { readonly op: 'remind'; readonly itemId: string; readonly to: string }
	| { readonly op: 'request_validation' | 'cancel_validation_request'; readonly itemId: string; readonly to: string }
	| { readonly op: 'finalize' }
	/**
	 * Every element still waiting on the reader, picked by the server: of the
	 * whole specification, or of the Features pages only (`scope: 'features'`).
	 */
	| { readonly op: 'validate_waiting'; readonly scope?: 'features' }
	/** A decision on a code change made outside Lyriks: keep it, send it back, or take the decision back. */
	| { readonly op: 'keep_drift' | 'send_back_drift' | 'undo_drift'; readonly key: string }
	/** The code contradicts a hand edit and the reader keeps the specification (criterion fea8666f). */
	| { readonly op: 'keep_spec_edit'; readonly itemId: string };

type Raw = Record<string, unknown>;
const id = (v: unknown, max = 400): string | null => (typeof v === 'string' && v.trim() !== '' && v.length <= max ? v.trim() : null);

function one(raw: unknown): SpecValidationAct | string {
	if (raw === null || typeof raw !== 'object') return 'An act must be an object.';
	const o = raw as Raw;
	switch (o.op) {
		case 'validate':
		case 'withdraw':
		case 'reject':
		case 'withdraw_request_validation': {
			const itemId = id(o.itemId);
			if (!itemId) return 'itemId is required.';
			if (o.op === 'validate' && o.fromRequest !== undefined) {
				const fromRequest = id(o.fromRequest, 200);
				return fromRequest ? { op: 'validate', itemId, fromRequest } : 'fromRequest names a change request by its id.';
			}
			return o.op === 'withdraw_request_validation' ? { op: o.op, itemId } : { op: o.op, itemId };
		}
		case 'remind':
		case 'request_validation':
		case 'cancel_validation_request': {
			const itemId = id(o.itemId);
			const to = id(o.to, 320);
			return itemId && to ? { op: o.op, itemId, to } : 'itemId and to are required.';
		}
		case 'finalize':
			return { op: 'finalize' };
		case 'validate_waiting':
			if (o.scope === undefined) return { op: 'validate_waiting' };
			return o.scope === 'features' ? { op: 'validate_waiting', scope: 'features' } : `Unknown scope "${String(o.scope)}".`;
		case 'keep_spec_edit': {
			const itemId = id(o.itemId);
			return itemId ? { op: 'keep_spec_edit', itemId } : 'itemId is required.';
		}
		case 'keep_drift':
		case 'send_back_drift':
		case 'undo_drift': {
			const key = id(o.key, 1000);
			return key ? { op: o.op, key } : 'key is required.';
		}
		default:
			return `Unknown act "${String(o.op)}".`;
	}
}

export function parseSpecValidationActs(body: unknown): { ok: true; acts: SpecValidationAct[] } | { ok: false; reason: string } {
	const list = body !== null && typeof body === 'object' ? (body as Raw).acts : null;
	if (!Array.isArray(list) || list.length === 0) return { ok: false, reason: 'acts must be a non-empty list.' };
	if (list.length > 500) return { ok: false, reason: 'At most 500 acts at once.' };
	const acts: SpecValidationAct[] = [];
	for (const raw of list) {
		const parsed = one(raw);
		if (typeof parsed === 'string') return { ok: false, reason: parsed };
		acts.push(parsed);
	}
	if (acts.some((a) => a.op === 'finalize') && acts.length > 1) return { ok: false, reason: 'Validate definitively on its own.' };
	return { ok: true, acts };
}
