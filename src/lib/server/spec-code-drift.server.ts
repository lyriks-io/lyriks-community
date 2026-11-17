import type { AppServices } from '$composition/container.server';
import type { FeatureImplementationCoverage } from '$application/use-cases';
import {
	RETROSPEC_SECTION,
	lastPublishedRun,
	codeBroughtBy,
	codeChangesSince,
	codeReference,
	handEdited,
	specEditsToReview,
	type BranchCode,
	type CodeChange,
	type CodeFeatureFacts,
	type RetrospecDocument,
	type RetrospecRun
} from '$domain/retrospec';
import { leafFeatures } from '$domain/features';
import type { CodeTrack } from '$domain/evolution';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';

/**
 * What the code reads for every element of the specification, from the last
 * sync of the repository's implementation index (the engine's implementation
 * status, kept per feature), and the changes made in the code outside Lyriks
 * since the Specification 360° was validated.
 */
export async function readCodeFacts(services: AppServices, projectId: string): Promise<CodeFeatureFacts[]> {
	const [coverage, features] = await Promise.all([
		services.implementationCoverage.get(projectId).catch(() => ({})),
		services.loadFeaturesDraft.execute(projectId)
	]);
	const names = new Map(leafFeatures(features).map((f) => [f.id, f.name.trim() || f.id]));
	return codeFactsOf(coverage, names);
}

/** The code facts of a coverage reading; a feature without a name in `names` reads its id. */
function codeFactsOf(coverage: Readonly<Record<string, FeatureImplementationCoverage>>, names: ReadonlyMap<string, string> = new Map()): CodeFeatureFacts[] {
	return Object.values(coverage).map((c) => ({
		featureId: c.featureId,
		featureName: names.get(c.featureId) ?? c.featureId,
		syncedAt: c.updatedAt,
		specUpdatedAt: c.specUpdatedAt,
		elements: Object.entries(c.actions ?? {}).flatMap(([actionId, a]) =>
			(a.elements ?? []).map((e) => ({
				actionId,
				kind: e.kind,
				id: e.id ?? '',
				name: e.name,
				file: e.location?.file || null,
				line: e.location?.line ?? null,
				snippet: e.location?.snippet ?? ''
			}))
		)
	}));
}

/** The span a request's branch reported over, and what its merge brought (ac-evo-branch-not-outside). */
function branchCodeOf(code: CodeTrack): BranchCode {
	return {
		from: code.boundAt ?? code.commits[0]?.at ?? code.reportedAt,
		to: code.reportedAt,
		merged: code.merged ? { at: code.merged.at, code: code.merged.code ?? {} } : null
	};
}

/** Every branch a request of the project reported code from, whatever became of the request. */
async function readBranchCode(services: AppServices, projectId: string): Promise<BranchCode[]> {
	const evolution = await services.loadEvolutionDraft.execute(projectId);
	return evolution.requests.flatMap((r) => (r.code ? [branchCodeOf(r.code)] : []));
}

interface PendingReading {
	/** The revisions of the review document and of the evolutions it was read at. */
	readonly key: string;
	/** The validated run the code is followed against; null while the specification is a draft. */
	readonly validated: RetrospecRun | null;
	readonly specEdits: RetrospecDocument['specEdits'];
	readonly branches: readonly BranchCode[];
	/** The coverage reading the changes were taken from: the cached tier hands the same object until it recomputes. */
	readonly coverage: object | null;
	readonly changes: readonly CodeChange[] | null;
}

const pendingCache = new Map<string, PendingReading>();

/**
 * The code changes made outside Lyriks since the validation, with the
 * validated run they are read against; null while the specification is a
 * draft. When nothing moved it costs two revision reads and, once validated,
 * the cached coverage; the review document and the evolutions are read again
 * only when one of them moved, and a draft never touches the coverage at all.
 */
async function readFollowedChanges(services: AppServices, projectId: string): Promise<PendingReading | null> {
	const [retroRevision, evolutionRevision] = await Promise.all([
		services.sectionDocuments.currentRevision(projectId, RETROSPEC_SECTION),
		services.sectionDocuments.currentRevision(projectId, 'evolution').catch(() => -1)
	]);
	const key = `${retroRevision}|${evolutionRevision}`;
	const hit = pendingCache.get(projectId);
	let reading: PendingReading;
	if (hit && hit.key === key) reading = hit;
	else {
		const { doc } = await loadRetrospecDocument(services.sectionDocuments, projectId);
		const last = lastPublishedRun(doc);
		const validated = last && doc.runs[doc.runs.length - 1] === last ? last : null;
		reading = { key, validated, specEdits: doc.specEdits, branches: validated ? await readBranchCode(services, projectId) : [], coverage: null, changes: null };
		pendingCache.set(projectId, reading);
	}
	if (!reading.validated) return null;
	const coverage = await services.implementationCoverage.get(projectId).catch(() => ({}));
	if (reading.coverage === coverage && reading.changes) return reading;
	const changes = codeChangesSince(reading.validated, codeFactsOf(coverage), reading.branches, handEdited(reading.specEdits));
	const read = { ...reading, coverage, changes };
	pendingCache.set(projectId, read);
	return read;
}

/**
 * How many code changes made outside Lyriks still wait for a decision, for the
 * app bar on every page of the project (criterion 4e7ec88c); null while the
 * specification is not validated. The hand edits not checked against the code
 * yet count like a code change to review (criterion 68b978c4).
 */
export async function readDriftPending(services: AppServices, projectId: string): Promise<number | null> {
	const read = await readFollowedChanges(services, projectId);
	if (!read?.changes) return null;
	return read.changes.filter((c) => !c.decision).length + specEditsToReview(read.specEdits);
}

/**
 * The code changes made outside Lyriks since the validation, decided or not,
 * each named by its feature as the specification names it, as Home tells them
 * (criterion d18e3e74); null while a draft.
 */
export async function readDriftChanges(services: AppServices, projectId: string): Promise<readonly CodeChange[] | null> {
	const changes = (await readFollowedChanges(services, projectId))?.changes ?? null;
	if (!changes?.length) return changes;
	const features = await services.loadFeaturesDraft.execute(projectId);
	const names = new Map(leafFeatures(features).map((f) => [f.id, f.name.trim()]));
	return changes.map((c) => ({ ...c, featureName: names.get(c.featureId) || c.featureName }));
}

/**
 * The changes made in the code outside Lyriks since the validation, none while
 * the specification is a draft; with when the code was last synced and how
 * many code elements the reference follows (none: nothing can be compared).
 */
export async function readCodeChanges(
	services: AppServices, projectId: string,
	doc: RetrospecDocument
): Promise<{ changes: CodeChange[]; lastSyncAt: string | null; followed: number }> {
	const validated = lastPublishedRun(doc);
	const [facts, branches] = await Promise.all([readCodeFacts(services, projectId), readBranchCode(services, projectId)]);
	const lastSyncAt = facts.reduce<string | null>((max, f) => (f.syncedAt && (!max || f.syncedAt > max) ? f.syncedAt : max), null);
	if (!validated || doc.runs[doc.runs.length - 1] !== validated) return { changes: [], lastSyncAt, followed: 0 };
	const followed = Object.values(codeReference(validated, branches)).filter(Boolean).length;
	return { changes: codeChangesSince(validated, facts, branches, handEdited(doc.specEdits)), lastSyncAt, followed };
}

/**
 * What a request's branch brings at its merge, read against the reference as
 * it stands (the validation, then the merges before it); nothing while the
 * specification was never validated, since there is then nothing to read against.
 */
export async function readCodeBroughtBy(services: AppServices, projectId: string, code: CodeTrack): Promise<Record<string, string>> {
	const [{ doc }, facts, branches] = await Promise.all([loadRetrospecDocument(services.sectionDocuments, projectId), readCodeFacts(services, projectId), readBranchCode(services, projectId)]);
	const validated = lastPublishedRun(doc);
	if (!validated?.publishedAt) return {};
	return codeBroughtBy(branchCodeOf(code), codeReference(validated, branches), facts);
}
