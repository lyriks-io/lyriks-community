import { error } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { saveRetrospecActs } from '$application/retrospec/retrospec-store';
import type { SpecValidationAct } from '$application/specification/parse-spec-validation-acts';
import { onFeaturesPages } from '$domain/discussions';
import { choicesOpen } from '$domain/evolution';
import { SPEC360_TAB, applyRetrospecActs, canReviewElement, codeSnapshot, samePersonRef, specValidationBoard, waitingOn, type PersonRef, type RetrospecAct } from '$domain/retrospec';
import { publishSectionChange } from './sync-bus.server';
import { readCodeChanges, readCodeFacts } from './spec-code-drift.server';
import { readSpecValidationBoard } from './spec-validation.server';

/**
 * The Specification 360°'s validation acts turned into the retrospecification's
 * own acts, every fact read here: the element's title and the people it waits
 * on, the baseline a definitive validation (or a code change kept) captures,
 * the code the validation is read against, the team told it is validated.
 */

async function captureBaseline(services: AppServices, projectId: string, name: string, note: string, origin: string | null): Promise<string | null> {
	const captured = await services.captureBaseline.execute(projectId, name, note, { expectedRevision: null, origin });
	if (!captured) error(409, 'The baselines changed at the same time. Try again.');
	publishSectionChange({ projectId, section: 'baselines', origin });
	return captured.draft.baselines[0]?.id ?? null;
}

/** The requests whose Simulation the acts come from, each refused when its version is frozen: its choices read only (rule d1cd168e). */
async function refuseFromFrozenRequests(services: AppServices, projectId: string, acts: readonly SpecValidationAct[]): Promise<void> {
	const named = [...new Set(acts.flatMap((act) => ('fromRequest' in act ? [act.fromRequest] : [])))];
	if (named.length === 0) return;
	const { requests } = await services.loadEvolutionDraft.execute(projectId);
	for (const requestId of named) {
		const request = requests.find((r) => r.id === requestId && r.status !== 'deleted');
		if (!request) error(404, 'This change request does not exist.');
		const open = choicesOpen(request);
		if (!open.ok) error(400, open.reason);
	}
}

export async function applySpecValidationActs(
	services: AppServices, projectId: string,
	acts: readonly SpecValidationAct[],
	actor: PersonRef,
	origin: string | null,
	access: { readonly canWrite: boolean } = { canWrite: true }
): Promise<{ revision: number }> {
	// A validation given from the Simulation of a request is the same act, once that request's version is not frozen (EVO-003).
	await refuseFromFrozenRequests(services, projectId, acts);
	const read = await readSpecValidationBoard(services, projectId, actor, { requireTeam: true, reviewOnly: !access.canWrite });
	const { elements, team, doc } = read;
	let board = read.board;
	let projected = doc;
	const now = new Date().toISOString();
	if (acts.some((act) => act.op === 'finalize') && acts.length > 1) error(400, 'Validate definitively on its own.');
	if (!access.canWrite && acts.some((act) => !['validate', 'withdraw', 'validate_waiting', 'withdraw_request_validation'].includes(act.op))) {
		error(403, 'Only a project editor may change validation assignments or the specification.');
	}
	const byId = new Map(elements.map((e) => [e.id, e]));
	const element = (itemId: string) => {
		const found = byId.get(itemId);
		if (!found) error(400, 'This element is no longer in the specification. Reload the page.');
		return found;
	};
	const total = elements.length;
	const identity = await services.loadFoundationDraft.loadIdentity(projectId);
	const product = identity.productName.trim() || 'the product';

	const out: RetrospecAct[] = [];
	const canPublish = (current: typeof doc) => specValidationBoard({ doc: current, elements, team, viewer: actor, baselines: read.baselines }).complete;
	const captures: { readonly index: number; readonly capture: () => Promise<string | null> }[] = [];
	// The code changes read once for the request, and the changes it keeps share one version (criterion d18e3e74).
	let changesRead: Awaited<ReturnType<typeof readCodeChanges>>['changes'] | null = null;
	const codeChanges = async () => (changesRead ??= (await readCodeChanges(services, projectId, doc)).changes);
	const keeps = acts.filter((a) => a.op === 'keep_drift').length;
	let keptBaseline: Promise<string | null> | null = null;
	for (const act of acts) {
		const previousLength = out.length;
		switch (act.op) {
			case 'validate':
			case 'withdraw': {
				if (board.summary.state === 'validated') error(400, 'The specification is already validated.');
				const e = element(act.itemId);
				// A validation only from someone the element waits on (criterion d1703bb6); a writer withdraws freely, nothing stands to withdraw otherwise.
				if (!(act.op === 'withdraw' && access.canWrite) && !canReviewElement(projected, e, team, actor, access.canWrite)) {
					error(403, 'This question does not require your validation.');
				}
				// Validating an element the former review rejected restores it: the click is the explicit decision.
				if (act.op === 'validate' && board.standings[e.id]?.rejected) out.push({ op: 'clear_flag', itemId: e.id, total });
				out.push(act.op === 'validate' ? { op: 'validate', itemId: e.id, title: e.title, tab: SPEC360_TAB, total } : { op: 'withdraw', itemId: e.id, total });
				break;
			}
			case 'withdraw_request_validation': {
				const e = element(act.itemId);
				const waitsOnActor = canReviewElement(projected, e, team, actor, access.canWrite);
				// An unassigned reader cannot act for the people an element waits on (rule 312a7bb5).
				if (!access.canWrite && !waitsOnActor) error(403, 'forbidden');
				// Only the people an element waits on take back what stands in their place (rule 846c0d0a).
				if (!waitsOnActor) error(403, 'This question does not require your validation.');
				// Once the specification is the reference, it changes through a change request (rule 78b379d6).
				if (board.summary.state === 'validated') error(400, 'The specification is already validated.');
				// There is nothing to take back where no request validated the element (rule c75239d4).
				if (!board.standings[e.id]?.through) error(400, 'No change request validated this element.');
				out.push({ op: 'withdraw_request_validation', itemId: e.id, total });
				break;
			}
			case 'reject': {
				// A change requested (criterion a4ef7658): nobody's validation stands until it is validated again.
				if (board.summary.state === 'validated') error(400, 'The specification is already validated.');
				const e = element(act.itemId);
				out.push({ op: 'reject', itemId: e.id, title: e.title, tab: SPEC360_TAB, total });
				break;
			}
			case 'validate_waiting': {
				// The whole specification (or all its features) at once: the server picks what waits on the reader, so no request grows with the spec.
				if (board.summary.state === 'validated') error(400, 'The specification is already validated.');
				const waiting = waitingOn(board, actor).filter((id) => act.scope !== 'features' || onFeaturesPages(id));
				if (!access.canWrite && waiting.length === 0) error(403, 'No question currently requires your validation.');
				for (const itemId of waiting) {
					const e = element(itemId);
					out.push({ op: 'validate', itemId: e.id, title: e.title, tab: SPEC360_TAB, total });
				}
				break;
			}
			case 'remind': {
				const e = element(act.itemId);
				const to = board.standings[e.id]?.missing.find((p) => samePersonRef(p, { id: act.to, name: '' }));
				if (!to) error(400, 'This person no longer has to validate this element.');
				out.push({ op: 'remind', itemId: e.id, title: e.title, to });
				break;
			}
			case 'request_validation':
			case 'cancel_validation_request': {
				if (board.summary.state === 'validated') error(400, 'The specification is already validated.');
				const e = element(act.itemId);
				const requested = projected.validationRequests?.[e.id]?.find((request) => samePersonRef(request.to, { id: act.to, name: '' }));
				if (act.op === 'cancel_validation_request') {
					if (requested) out.push({ op: act.op, itemId: e.id, title: e.title, to: requested.to });
					break;
				}
				const to = team.find((member) => samePersonRef(member.person, { id: act.to, name: '' }))?.person;
				if (!to) error(400, 'Choose a person who can access this project.');
				if (!board.standings[e.id]?.required.some((person) => samePersonRef(person, to))) {
					out.push({ op: act.op, itemId: e.id, title: e.title, to });
				}
				break;
			}
			case 'finalize': {
				if (board.summary.state === 'validated') error(400, 'The specification is already validated.');
				if (!board.complete) error(400, 'Validate every element before validating the specification definitively.');
				const notify = team.map((m) => m.person).filter((p) => !samePersonRef(p, actor));
				const code = codeSnapshot(await readCodeFacts(services, projectId));
				// Capture only after every local act passes; publication rechecks concurrent reviews on each save retry.
				captures.push({ index: out.length, capture: () => captureBaseline(services, projectId, `Specification 360° of ${product}`, `Validated by ${actor.name}: the reference every evolution is simulated against.`, origin) });
				// What each element reads now: a complementary run carries its validations while it reads the same (criterion 0c87480c).
				const fingerprints = Object.fromEntries(elements.flatMap((e) => (e.fingerprint ? [[e.id, e.fingerprint] as const] : [])));
				out.push({ op: 'publish', baselineId: null, notify, code, fingerprints });
				break;
			}
			case 'keep_drift':
			case 'send_back_drift': {
				const change = (await codeChanges()).find((c) => c.key === act.key);
				if (!change) error(400, 'This change is no longer in the code. Reload the page.');
				if (act.op === 'keep_drift') {
					captures.push({ index: out.length, capture: () => (keptBaseline ??= keeps > 1
						? captureBaseline(services, projectId, `Code changes kept · ${change.featureName}`, `${keeps} changes made in the code kept in the Specification 360° by ${actor.name}.`, origin)
						: captureBaseline(services, projectId, `Code change kept · ${change.elementLabel}`, `${change.what} Kept in the Specification 360° by ${actor.name}.`, origin)) });
					out.push({ op: 'keep_drift', key: change.key, code: change.code, baselineId: null, title: change.elementLabel });
				} else {
					out.push({ op: 'send_back_drift', key: change.key, code: change.code, title: change.elementLabel });
				}
				break;
			}
			case 'keep_spec_edit':
				out.push({ op: 'keep_spec_edit', itemId: act.itemId });
				break;
			case 'undo_drift': {
				// Only the decision this very code reads with is taken back; a version a keep captured stays as it was (criterion 537e1684).
				const change = (await codeChanges()).find((c) => c.key === act.key);
				if (!change?.decision) error(400, 'This change has no decision to take back. Reload the page.');
				out.push({ op: 'undo_drift', key: change.key, title: change.elementLabel });
				break;
			}
		}
		const preview = applyRetrospecActs(projected, out.slice(previousLength), { actor, now, reviewOnly: !access.canWrite, canPublish });
		if (!preview.ok) error(400, preview.reason);
		projected = preview.doc;
		board = specValidationBoard({ doc: projected, elements, team, viewer: access.canWrite ? actor : null, baselines: read.baselines });
	}
	for (const pending of captures) {
		const act = out[pending.index];
		if (act.op === 'publish' || act.op === 'keep_drift') out[pending.index] = { ...act, baselineId: await pending.capture() };
	}
	const outcome = await saveRetrospecActs(services.sectionDocuments, projectId, out, {
		actor,
		now,
		reviewOnly: !access.canWrite,
		canPublish,
		canReview: (current, itemId) => canReviewElement(current, byId.get(itemId), team, actor, access.canWrite)
	}, origin);
	if (!outcome.ok) error(outcome.conflict ? 409 : 400, outcome.reason);
	return { revision: outcome.revision };
}
