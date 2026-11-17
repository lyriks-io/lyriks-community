import type { Cookies } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import type { KernelRulesReadModel } from '$application/specification/index-feature-rules';
import { permissionCoverage } from '$domain/users';
import {
	activityLog,
	analysisOf,
	cancelRefusal,
	codeCoverage,
	currentRun,
	finalCheckOutcome,
	foundSoFar,
	partNotes,
	phaseNotes,
	noticedPoints,
	readRetrospec,
	rebuiltTiles,
	retrospecStatus,
	heldDelta,
	runDelta,
	specEditLines,
	writesHeld,
	summaryNote,
	tracedShare,
	type PersonRef,
	type RetrospecFigures,
	type RetrospecSpec
} from '$domain/retrospec';
import { nextRunReads, runCards } from '$domain/retrospec/run-history';
import { withoutServerReadings } from '$domain/retrospec';
import { readBehavior } from './behavior-read.server';
import { aiCallsOf, aiLastSeenOf } from './retrospec-ai.server';
import { aiDetectionsOf } from './retrospec-detected.server';
import { readRetrospecStore, retrospecActor, retrospecFactsOf } from './retrospec-status.server';
import { readSpecElements } from './spec-elements.server';
import { discussionRoster } from './spec360-discussions.server';
import { readNoticedToReview } from './spec360-overview.server';

/**
 * Everything the Retrospecification page shows, read in one pass: the
 * specification tab by tab, the live analysis, the summary, the review, and
 * the people a review item can be shared with.
 */

/**
 * The people an item can be shared with: the project's team and the active
 * workspace's members (the roster the Specification 360° discussions notify),
 * the reader aside. Nobody on a solo install.
 */
async function shareableMembers(services: AppServices, projectId: string, cookies: Cookies, me: PersonRef): Promise<(PersonRef & { job: string })[]> {
	const people = await discussionRoster(services, projectId, cookies).catch(() => []);
	return people
		.filter((p) => p.email.trim().toLowerCase() !== me.id.trim().toLowerCase())
		.map((p) => ({ id: p.email, name: p.name, job: p.job }));
}

/** Each action's own rules, keyed `${featureId}:${actionId}`, in the words that say why the rule exists. */
function rulesByAction(model: KernelRulesReadModel): Record<string, { id: string; text: string }[]> {
	const out: Record<string, { id: string; text: string }[]> = {};
	for (const group of model.groups) {
		for (const rule of group.rules) {
			const { featureId, actionId, kind } = rule.origin;
			if (kind !== 'action' || !featureId || !actionId || rule.kind !== 'rule') continue;
			(out[`${featureId}:${actionId}`] ??= []).push({ id: rule.nodeId, text: rule.description || rule.statement });
		}
	}
	return out;
}

/** The behaviour the LLM authored, folded for the reading. */
async function behaviorOf(services: AppServices, projectId: string): Promise<RetrospecSpec['behavior']> {
	const behavior = await readBehavior(services, projectId);
	return {
		actionsByFeature: Object.fromEntries(Object.entries(behavior.actions).map(([featureId, actions]) => [featureId, actions.map((a) => ({ id: a.id, name: a.name, intent: a.intent }))])),
		rulesByAction: rulesByAction(behavior.kernelRules),
		authoredFeatureIds: behavior.overview.features.filter((f) => f.authored).map((f) => f.featureId)
	};
}

export type RetrospecPageData = Awaited<ReturnType<typeof loadRetrospecPage>>;

/** Everything a retrospecification is read from: its own record, the specification it rebuilt, the code index. */
async function loadRetrospecSpec(services: AppServices, projectId: string) {
	const [store, foundation, scope, users, features, data, experience, rules, glossary, architecture, documents, behavior, coverage] = await Promise.all([
		readRetrospecStore(services, projectId),
		services.loadFoundationDraft.execute(projectId),
		services.loadScopeDraft.execute(projectId),
		services.loadUsersDraft.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		services.loadDataDraft.execute(projectId),
		services.loadExperienceDraft.execute(projectId),
		services.loadRulesDraft.execute(projectId),
		services.loadGlossaryDraft.execute(projectId),
		services.loadArchitectureDraft.execute(projectId),
		services.loadDocumentRegister.execute(projectId),
		behaviorOf(services, projectId),
		services.implementationCoverage.get(projectId).catch(() => ({}))
	]);
	const spec: RetrospecSpec = { foundation, scope, users, features, data, experience, rules, glossary, architecture, documents, behavior };
	const productName = foundation.identity.productName.trim() || 'Untitled project';
	const facts = retrospecFactsOf(store.doc, store.revisions, scope, foundation.identity, features);
	return { store, spec, productName, facts, coverage, reading: readRetrospec(spec, productName) };
}

/**
 * The headline figures of a retrospecification, the same on its summary and
 * on At a glance: what it found (sources read, entities, features, actions,
 * rules, screens), the share of the spec the code index located in the code,
 * the share of what it read that cites its source. Null until an analysis has
 * run to its end, as there is nothing to sum up before.
 */
export async function loadRetrospecFigures(services: AppServices, projectId: string): Promise<RetrospecFigures | null> {
	const { store, spec, facts, coverage, reading } = await loadRetrospecSpec(services, projectId);
	if (!analysisOf(facts).finished && !retrospecStatus(facts).published) return null;
	return {
		docs: currentRun(store.doc)?.mode === 'docs',
		found: foundSoFar(reading.counts),
		code: codeCoverage(Object.values(coverage)).pct,
		traced: tracedShare(spec).pct
	};
}

export async function loadRetrospecPage(services: AppServices, projectId: string, cookies: Cookies) {
	const [{ store, spec, productName, facts, coverage, reading }, me] = await Promise.all([loadRetrospecSpec(services, projectId), retrospecActor(services, cookies)]);
	const { scope, users, features, data, experience, rules, documents, behavior } = spec;
	const members = await shareableMembers(services, projectId, cookies, me);
	const run = currentRun(store.doc);
	const { progress, finished, checkedAt } = analysisOf(facts);
	// Once the analysis is over, its summary reads Project health and What Lyriks noticed from the reading the Overview
	// and Notices show, never from what the run's final check left behind (criterion 1b4a3935).
	const outcome = finished ? finalCheckOutcome(scope.auditLog, run && !run.implicit ? run.startedAt : null) : null;
	const health = finished ? await services.projectHealthView.get(projectId).catch(() => null) : null;
	const findings = finished
		? await readNoticedToReview(
				services, projectId,
				noticedPoints(health?.points ?? [], { rules, features, data, experience, sources: documents.sources, authoredFeatureIds: behavior.authoredFeatureIds })
			)
		: [];
	const unconfirmed = findings.filter((f) => f.unconfirmed).length;
	const notes = phaseNotes(reading.counts);
	const parts = partNotes(reading.counts);
	const calls = aiCallsOf(projectId);
	const permissions = users.roles.length > 0 && users.permissions.length > 0 ? permissionCoverage(users, features.features.map((f) => f.id)).pct : null;
	const status = retrospecStatus(facts);
	// What a later run changed, once its analysis is over; a first run wrote all of it (criterion 03192a6e).
	const elements = finished && run?.complementary ? await readSpecElements(services, projectId).catch(() => null) : null;
	const delta = !finished || !run?.complementary ? null : run.holds ? heldDelta(run, elements ?? []) : runDelta(store.doc, run, elements);
	// Nothing of this run is in the specification yet (criterion 50b00229).
	const held = writesHeld(run);
	return {
		projectId,
		productName,
		held,
		me,
		members,
		status,
		revision: store.revision,
		run: run && withoutServerReadings(run),
		// A later run until its review, a first one on its source step only (criterion 0ec7551b).
		cancellable: cancelRefusal(store.doc) === null && (!!run?.complementary || status.status === 'source'),
		// A complementary run's prompt names the commit it starts from and the hand edits that wait on the code (criterion 8c9bfffe).
		complementary: run?.complementary && !run.publishedAt ? { fromCommit: run.complementary.fromCommit, handEdits: specEditLines(store.doc.specEdits).length, scope: run.complementary.scope, held: !!run.holds } : null,
		comments: store.doc.comments,
		// The runs of the product, newest first, and what the next one reads (criterion 2dbed801).
		runs: runCards(store.doc, status.status, facts.rebuiltFrom),
		next: nextRunReads(store.doc, status.status !== 'start'),
		analysis: {
			phases: progress.phases.map((p) => {
				const withNotes = p.parts.map((part) => ({ ...part, note: part.share > 0 ? (parts[part.key] ?? '') : '' }));
				// A phase made of parts sums them up on one line: what shows when it is folded.
				const note = withNotes.length > 0 ? withNotes.map((part) => part.note).filter(Boolean).join(' · ') : p.share > 0 ? (notes[p.key] ?? '') : '';
				return { ...p, note, parts: withNotes };
			}),
			pct: progress.pct,
			started: progress.started,
			finished,
			// When Lyriks ran its final check on this run: without one, the summary says the reading is partial (criterion a05bca06).
			checkedAt,
			found: [...(held ? [{ n: Object.keys(run?.report ?? {}).length, label: 'Changes found' }] : []), ...foundSoFar(reading.counts)],
			log: activityLog(run, calls, scope.auditLog, aiDetectionsOf(services, projectId)),
			aiLastSeenAt: aiLastSeenOf(projectId)
		},
		summary: {
			note: summaryNote(reading.counts, productName),
			code: codeCoverage(Object.values(coverage)),
			traced: tracedShare(spec),
			tiles: rebuiltTiles(reading.counts, permissions),
			delta,
			// The points still to review, the final check's first: the Overview's Noticed figure counts the same.
			findings,
			// What the celebration says waits under Could not be confirmed, counted in that very list.
			unconfirmed: outcome && unconfirmed > 0 ? { points: unconfirmed } : null,
			// Project health, the Overview's Health figure, beside what Lyriks noticed.
			health: health
				? { score: health.headline.score, verdict: health.headline.verdict, blocking: health.headline.blocking, total: health.headline.total, codeLinked: health.codeLinked }
				: null,
			counts: { features: reading.counts.features, actions: reading.counts.actions, rules: reading.counts.rules, screens: reading.counts.screens }
		},
		reading
	};
}
