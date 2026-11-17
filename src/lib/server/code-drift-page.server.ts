import type { AppServices } from '$composition/container.server';
import { withCarriedGrants } from '$application/specification/capability-registry';
import { indexFeatureRules } from '$application/specification/index-feature-rules';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { summarizeAction } from '$application/specification/summarize-action';
import { locateInOutline, specOutline } from '$application/spec360/outline';
import { text } from '$application/spec360/labels';
import { holdersIndex } from '$application/spec360/users';
import { specVersionOf, type Baseline } from '$domain/baselines';
import { actionCapabilityId } from '$domain/users';
import {
	analysisOver,
	codeChangeHead,
	reportCards,
	reportCounts,
	reworkRejectedPrompt,
	nextRunReads,
	writeValidatedPrompt,
	writesHeld,
	type ElementReading,
	driftImpact,
	lastPublishedRun,
	followSpecPrompt,
	runDelta,
	runReach,
	scopeLine,
	sendBackPrompt,
	specEditLines,
	specEditStatus,
	specElementHref,
	validationBaselineId,
	type SpecEdit,
	type CodeChange,
	type DriftSpecReading,
	type RetrospecDocument,
	type RetrospecRun
} from '$domain/retrospec';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import type { DriftChangeView, DriftPageData, HeldReportView, RunReportView, SpecEditView } from '$lib/shared/code-drift-page';
import { readBehavior } from './behavior-read.server';
import { nextRunScope, readRetrospecStatus } from './retrospec-status.server';
import { readCodeChanges } from './spec-code-drift.server';
import { readSpecElements } from './spec-elements.server';

/**
 * What the Code drift page shows (criterion 4e7ec88c): whether the code is
 * followed yet (only once the Specification 360° is validated), the version it
 * is compared with and when it was last read, and each change made outside
 * Lyriks with its type, the spec beside the code, the brief that restores it
 * and its impact read from the specification (criteria 4903ceb0, 94d2468a).
 * The spec around a change is read only for the features that changed.
 */

/** The version a baseline made, counted from the validation as the Specification 360° counts it. */
function versionAt(baselines: readonly Baseline[], doc: RetrospecDocument, baselineId: string | null): string | null {
	const at = baselines.find((b) => b.id === baselineId)?.createdAt;
	if (!at) return null;
	return specVersionOf(baselines.filter((b) => b.createdAt <= at), validationBaselineId(doc))?.label ?? null;
}

const GUARDS = new Set(['rule', 'invariant']);

interface SpecAround {
	readonly reading: DriftSpecReading;
	/** The element's own words in the specification, when it has more than its name. */
	readonly words: string | null;
}

/** The specification around each change: its feature's snapshot, rules and grants, read once per feature. */
async function readSpecAround(services: AppServices, projectId: string, changes: readonly CodeChange[]): Promise<Map<string, SpecAround>> {
	const out = new Map<string, SpecAround>();
	if (changes.length === 0) return out;
	const featureIds = [...new Set(changes.map((c) => c.featureId))];
	const [snapshots, users, derived, lang] = await Promise.all([
		Promise.all(featureIds.map(async (featureId) => [featureId, await services.behaviorPort.readFeature(projectId, featureId).catch(() => null)] as const)),
		services.loadUsersDraft.execute(projectId),
		services.refreshDerivedCapabilities.execute(projectId).catch(() => null),
		services.loadSpecLanguage.generated(projectId).catch(() => 'en' as const)
	]);
	const byFeature = new Map<string, UnspaFeatureSnapshot | null>(snapshots);
	const grants = derived ? withCarriedGrants(users, derived) : users;
	const holders = holdersIndex(grants);
	const roleNames = new Map(grants.roles.map((r) => [r.id, text(r.name)]));
	const rulesOf = new Map(
		featureIds.map((featureId) => [featureId, indexFeatureRules(null, [{ featureId, snapshot: byFeature.get(featureId) ?? null }], lang).groups.flatMap((g) => g.rules)])
	);
	for (const change of changes) {
		const { kind, id, actionId } = change.codeElement;
		const action = summarizeAction(byFeature.get(change.featureId) ?? null, actionId);
		const rule = GUARDS.has(kind) ? (rulesOf.get(change.featureId)?.find((r) => r.nodeId === id)?.statement ?? null) : null;
		const reading: DriftSpecReading = {
			featureName: change.featureName,
			action: action
				? {
						name: text(action.name) || action.id,
						who: holders(actionCapabilityId(change.featureId, action.id))
							.map((roleId) => roleNames.get(roleId) ?? '')
							.filter(Boolean),
						writes: action.writes,
						scenarios: action.scenarios.map((s) => s.name)
					}
				: null,
			rule
		};
		const words = rule ?? (kind === 'action' && action ? text(action.intent) || null : null);
		out.set(change.key, { reading, words });
	}
	return out;
}

/** A line Changed in the specification as the page shows it (criteria 68b978c4, fea8666f). */
function specEditView(edit: SpecEdit, featureNames: ReadonlyMap<string, string>, projectId: string, product: { name: string; id: string }): SpecEditView {
	const status = specEditStatus(edit);
	const featureName = edit.featureId ? (featureNames.get(edit.featureId) ?? edit.featureId) : null;
	return {
		itemId: edit.itemId,
		kind: edit.itemId.startsWith('action:') ? 'Action' : 'Feature',
		title: edit.after.text || edit.title,
		featureName,
		href: specElementHref(projectId, edit.itemId),
		before: edit.before,
		after: edit.after,
		by: edit.by.name,
		at: edit.at,
		status,
		check: edit.check ? { code: edit.check.code, where: edit.check.where, at: edit.check.at } : null,
		kept: edit.kept ? { by: edit.kept.by.name, at: edit.kept.at } : null,
		prompt: status === 'differs' || status === 'kept' ? followSpecPrompt(edit, featureName, product) : null
	};
}

/** What a later run not validated yet reads and, once its analysis is over, what it changed (criterion f61f8c94). */
async function readRunReport(services: AppServices, projectId: string, doc: RetrospecDocument, run: RetrospecRun, product: { name: string; id: string }): Promise<RunReportView> {
	const scope = scopeLine(run.mode, runReach(run.complementary && { ...run.complementary, handEdits: specEditLines(doc.specEdits).length }), writesHeld(run));
	const status = await readRetrospecStatus(services, projectId);
	if (!analysisOver(status.status)) return { scope, delta: null, held: null };
	if (run.holds) return { scope, delta: null, held: await readHeldReport(services, projectId, run, product) };
	return { scope, delta: runDelta(doc, run, await readSpecElements(services, projectId).catch(() => null)), held: null };
}

/** The anchors that name their feature second: "action:<featureId>:<actionId>". */
const IN_A_FEATURE = new Set(['feature', 'action', 'rule', 'flow']);

/** The changes of the report beside what the specification reads today (criterion 42311513). */
async function readHeldReport(services: AppServices, projectId: string, run: RetrospecRun, product: { name: string; id: string }): Promise<HeldReportView> {
	const [elements, behavior, features, glossary] = await Promise.all([readSpecElements(services, projectId).catch(() => []), readBehavior(services, projectId), services.loadFeaturesDraft.execute(projectId), services.loadGlossaryDraft.execute(projectId)]);
	const outline = specOutline(features);
	const titles = new Map(elements.map((e) => [e.id, e.title]));
	const readOf = (anchor: string): ElementReading | null => {
		const title = titles.get(anchor);
		if (title === undefined) return null;
		const [kind, featureId, actionId] = anchor.split(':');
		const located = IN_A_FEATURE.has(kind) ? locateInOutline(outline, featureId) : null;
		const intent = kind === 'action' ? behavior.actions[featureId]?.find((a) => a.id === actionId)?.intent : null;
		const description = kind === 'feature' ? features.features.find((f) => f.id === featureId)?.description : null;
		const definition = kind === 'term' ? glossary.terms.find((t) => t.id === featureId)?.definition : null;
		return { title: title.replace(/^(Term|Journey) · /, ''), detail: text(intent ?? description ?? definition ?? '') || null, place: located?.kind === 'feature' ? `${located.core.name} › ${located.feature.name}` : null };
	};
	const counts = reportCounts(run.report);
	return { cards: reportCards(run.report ?? {}, readOf, elements.map((e) => e.id), product), counts, writing: !!run.writingOpenedAt, writePrompt: writeValidatedPrompt(counts.validated, product), reworkPrompt: reworkRejectedPrompt(counts.rejected, product) };
}

export async function readDriftPage(services: AppServices, projectId: string): Promise<DriftPageData> {
	const [{ doc }, identity, features, baselinesDraft] = await Promise.all([
		loadRetrospecDocument(services.sectionDocuments, projectId),
		services.loadFoundationDraft.loadIdentity(projectId),
		services.loadFeaturesDraft.execute(projectId),
		services.loadBaselinesDraft.execute(projectId).catch(() => null)
	]);
	const productName = text(identity.productName) || 'Untitled project';
	const validated = lastPublishedRun(doc);
	const last = doc.runs.at(-1);
	const unfollowed = { productName, version: null, lastSyncAt: null, followed: 0, changes: [], specEdits: [], next: null };
	if (last?.complementary && !last.publishedAt) return { state: 'report', ...unfollowed, report: await readRunReport(services, projectId, doc, last, { name: productName, id: projectId }) };
	if (!validated || last !== validated) return { state: 'draft', ...unfollowed, report: null };
	const baselines = baselinesDraft?.baselines ?? [];
	const { changes, lastSyncAt, followed } = await readCodeChanges(services, projectId, doc);
	const around = await readSpecAround(services, projectId, changes);
	const outline = specOutline(features);
	const views = changes.map((change): DriftChangeView => {
		const spec = around.get(change.key);
		const reading: DriftSpecReading = spec?.reading ?? { featureName: change.featureName, action: null, rule: null };
		const specText = spec?.words ?? change.specText;
		const located = locateInOutline(outline, change.featureId);
		const head = codeChangeHead(change, reading.action?.name ?? null);
		const d = change.decision;
		return {
			key: change.key,
			featureId: change.featureId,
			featureName: change.featureName,
			coreName: located?.kind === 'feature' ? located.core.name : null,
			elementId: change.elementId,
			elementName: change.codeElement.name,
			actionId: change.codeElement.actionId,
			type: head.type,
			shift: change.shift,
			title: head.title,
			where: change.where,
			what: change.what,
			specText,
			snippet: change.snippet,
			prompt: sendBackPrompt({ ...change, specText }, { name: productName, id: projectId }),
			impact: driftImpact(change, reading),
			decision: d ? { decision: d.decision, by: d.by.name, at: d.at, version: d.decision === 'kept' ? versionAt(baselines, doc, d.baselineId) : null } : null
		};
	});
	const featureNames = new Map(features.features.map((f) => [f.id, text(f.name) || f.id]));
	const product = { name: productName, id: projectId };
	return {
		state: 'validated',
		productName,
		version: specVersionOf(baselines, validationBaselineId(doc))?.label ?? null,
		lastSyncAt,
		followed,
		changes: views,
		specEdits: specEditLines(doc.specEdits).map((e) => specEditView(e, featureNames, projectId, product)),
		report: null,
		next: { scope: await nextRunScope(services, projectId), reads: nextRunReads(doc, true) }
	};
}
