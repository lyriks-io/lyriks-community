import { error } from '@sveltejs/kit';
import { assertSummaryFits } from './product-summary.server';
import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument, saveRetrospecActs } from '$application/retrospec/retrospec-store';
import type { SpecEditRequest } from '$application/specification/parse-spec-edit';
import { validatedSpecRefusal } from '$application/spec360/validated-edits';
import {
	actionEditOp,
	addCore,
	addUser,
	coreDeletionRefusal,
	deleteCore,
	deleteUser,
	editArchitecture,
	editData,
	editDefinition,
	editExperience,
	editFeatures,
	editGlossary,
	addFeature,
	editIdentity,
	editShapeOf,
	editUsers,
	NEW_CORE_NAME,
	NEW_FEATURE_NAME,
	NEW_USER_NAME,
	validatedElementOf,
	type ElementEdit
} from '$application/spec360/edits';
import { roleUses } from '$application/spec360/role-uses';
import { keepFinding, reopenFinding } from '$application/spec360/settle-finding';
import { tickMatrixCell } from '$application/spec360/matrix-grant';
import { OPERATIONS_TARGET_TITLE, operationsTargetRefusal, withOperationsTarget } from '$application/spec360/operations-targets';
import { anchorOf } from '$domain/discussions';
import { withCarriedGrants } from '$application/specification/capability-registry';
import { indexFeatureActions } from '$application/specification/index-feature-actions';
import { classificationProblem, withClassification } from '$application/spec360/classification';
import { specState, type PersonRef, type RetrospecAct, type RevalidationInput } from '$domain/retrospec';
import { persistFeaturesDraft } from './features-write.server';
import { forgetSpecElements } from './spec-elements.server';
import { editedRevalidation, readElementText } from './spec360-revalidation.server';
import { NEW_NAME, SECTION_OF, addToArchitecture, addToExperience, addToGlossary, newActionOps } from '$application/spec360/add-elements';
import { publishSectionChange } from './sync-bus.server';
import { handEditChange, readHandEditBefore } from './spec360-hand-edits.server';
import { isFoundationSection, withFoundationLock } from './foundation-lock.server';
import { ruleEditOperation, ruleTarget } from '$application/spec360/rule-edit';
import { featureIdCollisionMessage } from '$application/specification/feature-id-collision';

/**
 * A change made in place on the Specification 360°, written into the section
 * that holds the element through the same save the section's own page uses
 * (revision, write, the change told to every open tab), then recorded on the
 * retrospecification as the person's edit: they are the element's last
 * author, and the others validate the new text again. A validated
 * specification stays editable (criterion 611e98cb): the edit is followed
 * instead, on Code drift or by a mark, and nothing goes back to validation.
 */

/** A server-composed save of a section still on the revision lock: bump, write, roll back on failure, tell the tabs. */
async function persistLocked(services: AppServices, projectId: string, section: string, origin: string | null, save: () => Promise<unknown>): Promise<void> {
	const revisionSection = isFoundationSection(section) ? 'foundation' : section;
	const revision = await services.draftLock.commit(projectId, revisionSection, null);
	try {
		await save();
	} catch (e) {
		if (revision !== null) await services.draftLock.rollback(projectId, revisionSection, revision).catch(() => {});
		throw e;
	}
	publishSectionChange({ projectId, section, origin });
}

const unchanged = (): never => error(400, 'This element is no longer in the specification. Reload the page.');

async function writeEdit(services: AppServices, projectId: string, anchor: string, edit: ElementEdit, origin: string | null): Promise<void> {
	const shape = editShapeOf(anchor);
	if (!shape) error(400, 'This element is not edited here.');
	const save = { expectedRevision: null, origin };
	switch (shape.section) {
		case 'identity': {
			let next = editIdentity(await services.loadFoundationDraft.loadIdentity(projectId), anchor, edit) ?? unchanged();
			// Refused before anything is written, the classification included (criterion 72251131).
			await assertSummaryFits(services, projectId, next.brief);
			if (edit.classification) {
				const problem = classificationProblem(edit.classification);
				if (problem) error(400, problem);
				const classified = withClassification(next, await services.loadFoundationDraft.loadDefinition(projectId), edit.classification);
				next = classified.identity;
				// The market lives in the definition: written first, so a failed identity save never leaves it half done.
				await persistLocked(services, projectId, 'foundation.definition', origin, () => services.saveFoundationDraft.saveDefinition(classified.definition));
			}
			const identity = next;
			await persistLocked(services, projectId, 'foundation.identity', origin, async () => {
				await services.saveFoundationDraft.saveIdentity(identity);
				await services.syncBehaviorProject.execute(identity);
			});
			return;
		}
		case 'definition': {
			const next = editDefinition(await services.loadFoundationDraft.loadDefinition(projectId), anchor, edit) ?? unchanged();
			await persistLocked(services, projectId, 'foundation.definition', origin, () => services.saveFoundationDraft.saveDefinition(next));
			return;
		}
		case 'users': {
			const next = editUsers(await services.loadUsersDraft.execute(projectId), anchor, edit) ?? unchanged();
			await persistLocked(services, projectId, 'users', origin, () => services.saveUsersDraft.execute(next));
			return;
		}
		case 'features': {
			const next = editFeatures(await services.loadFeaturesDraft.execute(projectId), anchor, edit) ?? unchanged();
			await persistFeaturesDraft(services, next);
			return;
		}
		case 'experience': {
			const next = editExperience(await services.loadExperienceDraft.execute(projectId), anchor, edit) ?? unchanged();
			await persistLocked(services, projectId, 'experience', origin, () => services.saveExperienceDraft.execute(next));
			return;
		}
		case 'architecture': {
			const next = editArchitecture(await services.loadArchitectureDraft.execute(projectId), anchor, edit) ?? unchanged();
			if (!(await services.saveArchitectureDraft.execute(next, save))) error(409, 'The architecture changed at the same time. Try again.');
			return;
		}
		case 'data': {
			const next = editData(await services.loadDataDraft.execute(projectId), anchor, edit) ?? unchanged();
			await persistLocked(services, projectId, 'data', origin, () => services.saveDataDraft.execute(next));
			return;
		}
		case 'glossary': {
			const next = editGlossary(await services.loadGlossaryDraft.execute(projectId), anchor, edit) ?? unchanged();
			if (!(await services.saveGlossaryDraft.execute(next, save))) error(409, 'The glossary changed at the same time. Try again.');
			return;
		}
		case 'behavior': {
			// An action renamed in place, as the feature tree's Rename writes it (criterion 701caee5).
			const [, featureId, actionId] = anchor.split(':');
			const snapshot = await services.behaviorPort.readFeature(projectId, featureId).catch(() => null);
			const action = indexFeatureActions([{ featureId, snapshot }])[featureId]?.find((a) => a.id === actionId) ?? unchanged();
			const op = actionEditOp(anchor, action.surfaceId, action.name, edit) ?? unchanged();
			const { available, batch } = await services.authorBehavior.execute({ projectId, featureId, operations: [op], dryRun: false });
			if (!available) error(503, 'The behavior engine did not answer: reload the page before trying again.');
			if (!batch?.ok) error(400, batch?.errors?.[0] ?? 'The behavior model refused the change.');
			return;
		}
	}
}

/**
 * The trace of an element added, ticked or edited elsewhere than in its text.
 * On a validated specification it is prose the code cannot confirm: it is
 * marked Changed since the last retrospecification (criterion 956cb2ac).
 */
function authorship(authored: { itemId: string; title: string }, validated: boolean): RetrospecAct {
	if (!validated) return { op: 'edit', ...authored };
	const change = { itemId: authored.itemId, title: authored.title, featureId: null, implemented: false, before: { text: '', desc: '' }, after: { text: authored.title, desc: '' } };
	return { op: 'edit', ...authored, change };
}

/** The first surface a feature's behavior model holds, where a first action goes; null when it holds none yet. */
function firstSurfaceId(snapshot: unknown): string | null {
	const surfaces = (snapshot as { feature?: { surfaces?: readonly { id?: unknown }[] } } | null)?.feature?.surfaces ?? [];
	const id = surfaces[0]?.id;
	return typeof id === 'string' && id ? id : null;
}

/** Apply one change; answers the anchor of what it added, so the page opens it to edit. */
export async function applySpecEdit(services: AppServices, projectId: string, request: SpecEditRequest, actor: PersonRef, origin: string | null): Promise<{ anchor: string | null }> {
	const shape = 'anchor' in request ? editShapeOf(request.anchor) : null;
	const foundation = request.op === 'set_operations_target' || shape?.section === 'identity' || shape?.section === 'definition';
	return withFoundationLock(services, projectId, foundation ? 'foundation' : '', () =>
		applySpecEditLocked(services, projectId, request, actor, origin));
}

async function applySpecEditLocked(services: AppServices, projectId: string, request: SpecEditRequest, actor: PersonRef, origin: string | null): Promise<{ anchor: string | null }> {
	const { doc } = await loadRetrospecDocument(services.sectionDocuments, projectId);
	const validated = specState(doc) === 'validated';
	// Editing a validated specification in place waits until Code drift can follow the change (criterion 9b3e04e1).
	const refusal = validatedSpecRefusal(validated, request.op);
	if (refusal) error(400, refusal);
	let anchor: string | null = null;
	let authored: { itemId: string; title: string } | null = null;
	// On a validated specification the edit is followed: what it read before and now (criterion 68b978c4).
	let followed: RetrospecAct | null = null;
	// On a draft, the elements the change reaches beyond the one written: a validated parent that gains a child, an
	// element deleted. Their validations go and their validated version is kept (criterion e6029af6).
	const reached: RetrospecAct[] = [];
	const reach = async (itemId: string, change: 'child_added' | 'deleted') => {
		if (validated) return;
		const before = await readElementText(services, projectId, itemId);
		reached.push({ op: 'edit', itemId, title: before.text, revalidate: { change, before, after: change === 'deleted' ? null : before } });
	};
	let revalidate: RevalidationInput | undefined;
	switch (request.op) {
		case 'upsert_rule': {
			const owns = (await services.loadFeaturesDraft.execute(projectId)).features.some((f) => f.id === request.featureId);
			if (!owns) error(404, 'Feature not found in project');
			const collisions = await services.detectFeatureIdCollision.execute(projectId, request.featureId);
			if (collisions.length) error(409, featureIdCollisionMessage(projectId, request.featureId, collisions));
			const snapshot = await services.behaviorPort.readFeature(projectId, request.featureId);
			const target = ruleTarget(snapshot, request.actionId, request.ruleId) ?? unchanged();
			if (target.updatedAt !== request.expectedUpdatedAt) error(409, 'The feature changed while you edited this rule. Reload it before saving.');
			const { available, batch } = await services.authorBehavior.execute({ projectId, featureId: request.featureId, operations: [ruleEditOperation(target, request.rule)], expectedUpdatedAt: request.expectedUpdatedAt, dryRun: false });
			if (!available) error(503, 'The behavior engine did not confirm this rule. Reload before retrying: the write may have applied.');
			if (!batch?.ok) error(batch?.conflict ? 409 : 400, batch?.errors?.[0] ?? 'The behavior model refused the rule.');
			const id = request.ruleId ?? batch.refs?.knowledge_rule;
			if (!id) error(503, 'The rule was saved but its identity could not be confirmed. Reload the page.');
			anchor = anchorOf('rule', request.featureId, id);
			authored = { itemId: anchor, title: request.rule.description };
			if (!request.ruleId) await reach(anchorOf('action', request.featureId, request.actionId), 'child_added');
			services.behaviorAdvisories.touch?.(projectId);
			break;
		}
		case 'edit': {
			const prior = validated ? await readHandEditBefore(services, projectId, request.anchor) : null;
			const draftBefore = validated ? null : await readElementText(services, projectId, request.anchor);
			await writeEdit(services, projectId, request.anchor, request, origin);
			authored = { itemId: validatedElementOf(request.anchor), title: request.text.trim() };
			if (draftBefore) revalidate = editedRevalidation(draftBefore, request);
			if (prior) followed = { op: 'edit', ...authored, change: handEditChange(request.anchor, authored.title || prior.before.text, prior, request) };
			break;
		}
		case 'cancel_hand_edit': {
			// The element reads again what it read before the first edit, through the same save (criterion 0873e142).
			const line = doc.specEdits?.[request.anchor];
			if (!line?.implemented) error(400, 'There is no hand edit to cancel on this element. Reload the page.');
			await writeEdit(services, projectId, request.anchor, { text: line.before.text, desc: line.before.desc }, origin);
			followed = { op: 'cancel_spec_edit', itemId: request.anchor };
			break;
		}
		case 'add_user': {
			const added = addUser(await services.loadUsersDraft.execute(projectId), request.id);
			await persistLocked(services, projectId, 'users', origin, () => services.saveUsersDraft.execute(added.draft));
			anchor = added.anchor;
			authored = { itemId: added.anchor, title: NEW_USER_NAME };
			break;
		}
		case 'add_core': {
			const added = addCore(await services.loadFeaturesDraft.execute(projectId), request.id);
			await persistFeaturesDraft(services, added.draft);
			anchor = added.anchor;
			authored = { itemId: added.anchor, title: NEW_CORE_NAME };
			break;
		}
		case 'add_feature': {
			const added = addFeature(await services.loadFeaturesDraft.execute(projectId), request.coreId, request.id);
			if (!added) error(400, 'This core feature is no longer in the specification. Reload the page.');
			await reach(anchorOf('core', request.coreId), 'child_added');
			await persistFeaturesDraft(services, added.draft);
			anchor = added.anchor;
			authored = { itemId: added.anchor, title: NEW_FEATURE_NAME };
			break;
		}
		case 'add_element': {
			// A journey, a component, a stack component, a constraint or a term at the foot of its list (criterion 51e215ef).
			const save = { expectedRevision: null, origin };
			switch (SECTION_OF[request.kind]) {
				case 'experience': {
					const added = addToExperience(await services.loadExperienceDraft.execute(projectId), request.kind as 'journey' | 'component', request.id);
					await persistLocked(services, projectId, 'experience', origin, () => services.saveExperienceDraft.execute(added.draft));
					anchor = added.anchor;
					break;
				}
				case 'architecture': {
					const added = addToArchitecture(await services.loadArchitectureDraft.execute(projectId), request.kind as 'stack' | 'constraint', request.id);
					if (!(await services.saveArchitectureDraft.execute(added.draft, save))) error(409, 'The architecture changed at the same time. Try again.');
					anchor = added.anchor;
					break;
				}
				case 'glossary': {
					const added = addToGlossary(await services.loadGlossaryDraft.execute(projectId), request.id);
					if (!(await services.saveGlossaryDraft.execute(added.draft, save))) error(409, 'The glossary changed at the same time. Try again.');
					anchor = added.anchor;
					break;
				}
			}
			authored = anchor ? { itemId: anchor, title: NEW_NAME[request.kind] } : null;
			break;
		}
		case 'add_action': {
			// The engine mints the action's id; it comes with one rule that allows it until its rules are written.
			const feature = (await services.loadFeaturesDraft.execute(projectId)).features.find((f) => f.id === request.featureId);
			if (!feature) error(404, 'Feature not found in project');
			const collisions = await services.detectFeatureIdCollision.execute(projectId, request.featureId);
			if (collisions.length) error(409, featureIdCollisionMessage(projectId, request.featureId, collisions));
			const snapshot = await services.behaviorPort.readFeature(projectId, request.featureId).catch(() => null);
			const surfaceId = indexFeatureActions([{ featureId: request.featureId, snapshot }])[request.featureId]?.[0]?.surfaceId ?? firstSurfaceId(snapshot);
			await reach(anchorOf('feature', request.featureId), 'child_added');
			const { available, batch } = await services.authorBehavior.execute({ projectId, featureId: request.featureId, operations: newActionOps(surfaceId, feature.name), dryRun: false });
			if (!available) error(503, 'The behavior engine did not answer: reload the page before trying again.');
			if (!batch?.ok) error(400, batch?.errors?.[0] ?? 'The behavior model refused the new action.');
			const id = batch.refs?.action;
			if (!id) error(503, 'The action was added but its identity could not be confirmed. Reload the page.');
			anchor = anchorOf('action', request.featureId, id);
			authored = { itemId: anchor, title: NEW_NAME.action };
			services.behaviorAdvisories.touch?.(projectId);
			break;
		}
		case 'tick_permission': {
			const [users, derived] = await Promise.all([services.loadUsersDraft.execute(projectId), services.refreshDerivedCapabilities.execute(projectId)]);
			const capability = derived.features.find((c) => c.id === request.capabilityId);
			if (!capability) error(400, 'This action is no longer in the specification. Reload the page.');
			// The grants made before actions had rows are carried first, as the matrix reads them (criterion e81345e6).
			const next = tickMatrixCell(withCarriedGrants(users, derived), request.roleId, request.capabilityId, capability.source, request.on);
			if (next) await persistLocked(services, projectId, 'users', origin, () => services.saveUsersDraft.execute(next));
			authored = { itemId: 'permissions', title: 'Who can do what' };
			break;
		}
		case 'set_operations_target': {
			// A target changes nothing the product does: it is set in place, on a draft or a validated specification (criterion 970aca7c).
			const refusal = operationsTargetRefusal(request);
			if (refusal) error(400, refusal);
			const [definition, operations] = await Promise.all([services.loadFoundationDraft.loadDefinition(projectId), services.loadFoundationDraft.loadOperations(projectId)]);
			const next = withOperationsTarget(definition, operations, request);
			if (next.operations) {
				const quality = next.operations;
				await persistLocked(services, projectId, 'foundation.operations', origin, async () => {
					if (!(await services.saveFoundationDraft.saveOperations(quality, { expectedRevision: null, origin }))) error(409, 'The targets changed at the same time. Try again.');
				});
			}
			if (next.definition) {
				const written = next.definition;
				await persistLocked(services, projectId, 'foundation.definition', origin, () => services.saveFoundationDraft.saveDefinition(written));
			}
			authored = { itemId: anchorOf('health', request.target), title: OPERATIONS_TARGET_TITLE[request.target] };
			break;
		}
		case 'keep_finding': {
			const next = keepFinding(await services.loadRulesDraft.execute(projectId), request.issueId, actor.name, new Date().toISOString());
			if (!next) error(400, 'This point is no longer open, or it blocks the project health: turn it into an evolution. Reload the page.');
			await persistLocked(services, projectId, 'rules', origin, () => services.saveRulesDraft.execute(next));
			break;
		}
		case 'reopen_finding': {
			const next = reopenFinding(await services.loadRulesDraft.execute(projectId), request.issueId);
			if (!next) error(400, 'This finding is no longer rejected. Reload the page.');
			await persistLocked(services, projectId, 'rules', origin, () => services.saveRulesDraft.execute(next));
			break;
		}
		case 'delete': {
			const kind = request.anchor.split(':', 1)[0];
			if (kind === 'role' || kind === 'core') await reach(request.anchor, 'deleted');
			if (kind === 'role') {
				const users = await services.loadUsersDraft.execute(projectId);
				const [features, experience, definition] = await Promise.all([
					services.loadFeaturesDraft.execute(projectId),
					services.loadExperienceDraft.execute(projectId),
					services.loadFoundationDraft.loadDefinition(projectId)
				]);
				// A user the rest of the spec uses is never deleted from here: those places would point at no one.
				const used = roleUses(request.anchor.slice('role:'.length), { users, features, experience, definition });
				if (used.summary) error(400, `${used.summary}: change those first.`);
				const next = deleteUser(users, request.anchor) ?? unchanged();
				await persistLocked(services, projectId, 'users', origin, () => services.saveUsersDraft.execute(next));
			} else if (kind === 'core') {
				const features = await services.loadFeaturesDraft.execute(projectId);
				const refusal = coreDeletionRefusal(features, request.anchor);
				if (refusal) error(400, refusal);
				await persistFeaturesDraft(services, deleteCore(features, request.anchor) ?? unchanged());
			} else {
				error(400, 'Only a user or a core feature is deleted here.');
			}
			break;
		}
	}
	forgetSpecElements(projectId);
	// The same mirror a section page's own save schedules (Enterprise back sync); never fails the edit.
	void services.scheduleBackSync(projectId).catch(() => {});
	// The section is written; the authorship is its trace.
	const authoredTrace = followed ?? (authored ? authorship(authored, validated) : null);
	const trace = authoredTrace?.op === 'edit' && revalidate ? { ...authoredTrace, revalidate } : authoredTrace;
	const traces = [...(trace ? [trace] : []), ...reached];
	if (traces.length && request.op === 'upsert_rule') {
		const recorded = await saveRetrospecActs(services.sectionDocuments, projectId, traces, { actor, now: new Date().toISOString() }, origin).catch(() => null);
		if (!recorded?.ok) error(503, 'The rule was saved, but its review history could not be updated. Reload before editing it again.');
	} else if (traces.length) await saveRetrospecActs(services.sectionDocuments, projectId, traces, { actor, now: new Date().toISOString() }, origin).catch(() => null);
	return { anchor };
}
