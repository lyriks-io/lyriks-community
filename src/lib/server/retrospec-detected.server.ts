import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import {
	currentRun,
	isNamedSection,
	KIND_OF,
	NAMED_SECTIONS,
	namedIn,
	newlyNamed,
	type DetectedFact,
	type NamedElement,
	type NamedParts,
	type NamedSection
} from '$domain/retrospec';
import { PROJECT_ACTIVITY_ID } from '$lib/shared/ai-activity';
import { RETROSPEC_DETECTED_SECTION } from '$lib/shared/section-sync';
import { readBehavior } from './behavior-read.server';
import { publishSectionChange, subscribeAiActivity, type ProjectAiActivity } from './sync-bus.server';

/**
 * What the person's AI adds to the specification during a retrospecification,
 * by name. After each burst of its writes to a section, the section is read
 * again and every element it did not hold before (a feature, an action, a
 * table, a role, a screen, a term, a technology, a source) is detected: the
 * activity log reads "Lyriks detected the feature “Send a message”".
 *
 * Each node keeps, per project, the elements it knows and its recent
 * detections (nothing persisted), like the AI's calls. What a project holds is
 * first read at the AI's first call on it, before it writes; a node that first
 * hears the AI mid-run starts from what stands then, so it never announces
 * what was already there. Only a retrospecification under way is followed: an
 * AI writing elsewhere costs nothing.
 */

/** How long after the AI's last write to a section the section is read again: a burst costs one read. */
const DETECT_AFTER_MS = 1500;
/** How long a project found with no retrospecification under way is not asked again. */
const UNDER_WAY_RECHECK_MS = 60_000;
/** The detections kept per project; older ones fall off. */
const KEPT = 300;

interface Watch {
	/** The keys of the elements known, per section; null until the first read, or while no run is under way. */
	known: Map<NamedSection, Set<string>> | null;
	/** The first read, under way or done. */
	baseline: Promise<void> | null;
	/** When the project was last found with no run under way. */
	idleSince: number | null;
	/** One detection at a time per project: two reads of a section never announce the same element twice. */
	chain: Promise<void>;
	readonly timers: Map<NamedSection, ReturnType<typeof setTimeout>>;
	readonly facts: DetectedFact[];
}

const watches = new Map<string, Watch>();
let detecting = false;

function watchOf(projectId: string): Watch {
	let w = watches.get(projectId);
	if (!w) {
		w = { known: null, baseline: null, idleSince: null, chain: Promise.resolve(), timers: new Map(), facts: [] };
		watches.set(projectId, w);
	}
	return w;
}

/** A retrospecification started and not yet closed or published. */
async function underWay(services: AppServices, projectId: string): Promise<boolean> {
	const { doc } = await loadRetrospecDocument(services.sectionDocuments, projectId);
	const run = currentRun(doc);
	return !!run && !run.implicit && !run.analysisEndedAt && !run.publishedAt;
}

/** The named elements of the sections asked, read from the specification as it stands. */
async function readNamed(services: AppServices, projectId: string, sections: readonly NamedSection[]): Promise<Map<NamedSection, NamedElement[]>> {
	const wants = (s: NamedSection) => sections.includes(s);
	const [features, behavior, data, users, experience, glossary, architecture, documents] = await Promise.all([
		wants('features') ? services.loadFeaturesDraft.execute(projectId) : undefined,
		wants('behavior') ? readBehavior(services, projectId).then((b) => ({ actionsByFeature: b.actions })) : undefined,
		wants('data') ? services.loadDataDraft.execute(projectId) : undefined,
		wants('users') ? services.loadUsersDraft.execute(projectId) : undefined,
		wants('experience') ? services.loadExperienceDraft.execute(projectId) : undefined,
		wants('glossary') ? services.loadGlossaryDraft.execute(projectId) : undefined,
		wants('architecture') ? services.loadArchitectureDraft.execute(projectId) : undefined,
		wants('documents') ? services.loadDocumentRegister.execute(projectId) : undefined
	]);
	const parts: NamedParts = { features, behavior, data, users, experience, glossary, architecture, documents };
	return new Map(sections.map((section) => [section, namedIn(section, parts)]));
}

const keysOf = (elements: readonly NamedElement[] | undefined) => new Set((elements ?? []).map((e) => e.key));

/** What the project holds before the AI writes, when a retrospecification is under way. */
async function takeBaseline(services: AppServices, projectId: string, w: Watch): Promise<void> {
	if (!(await underWay(services, projectId))) {
		w.idleSince = Date.now();
		w.baseline = null;
		return;
	}
	w.idleSince = null;
	const read = await readNamed(services, projectId, NAMED_SECTIONS);
	w.known = new Map(NAMED_SECTIONS.map((s) => [s, keysOf(read.get(s))]));
}

/** The section read again: what it holds and was not known is detected, then known. */
async function detect(services: AppServices, projectId: string, w: Watch, section: NamedSection): Promise<void> {
	await w.baseline;
	if (!w.known) return;
	const elements = (await readNamed(services, projectId, [section])).get(section) ?? [];
	const known = w.known.get(section) ?? new Set<string>();
	const added = newlyNamed(known, elements);
	for (const key of keysOf(elements)) known.add(key);
	w.known.set(section, known);
	if (added.length === 0) return;
	w.facts.push({ at: new Date().toISOString(), kind: KIND_OF[section], names: added.map((e) => e.name) });
	if (w.facts.length > KEPT) w.facts.splice(0, w.facts.length - KEPT);
	// Nothing authored changed with it: the Retrospecification page alone re-reads.
	publishSectionChange({ projectId, section: RETROSPEC_DETECTED_SECTION, origin: null });
}

function onActivity(services: AppServices, activity: ProjectAiActivity): void {
	if (activity.requestId !== PROJECT_ACTIVITY_ID) return;
	const { projectId } = activity;
	const w = watchOf(projectId);
	if (!w.baseline && !w.known && (w.idleSince === null || Date.now() - w.idleSince > UNDER_WAY_RECHECK_MS)) {
		w.baseline = takeBaseline(services, projectId, w).catch((e) => {
			w.baseline = null;
			console.warn('[retrospec] could not read what the project holds:', e instanceof Error ? e.message : e);
		});
	}
	const section = activity.section?.split('.')[0];
	if (activity.act !== 'write' || !isNamedSection(section)) return;
	clearTimeout(w.timers.get(section));
	w.timers.set(
		section,
		setTimeout(() => {
			w.timers.delete(section);
			w.chain = w.chain.then(() => detect(services, projectId, w, section)).catch((e) => console.warn('[retrospec] detection failed:', e instanceof Error ? e.message : e));
		}, DETECT_AFTER_MS)
	);
}

/** Follow the AI's activity on this node, once. */
export function ensureDetecting(services: AppServices): void {
	if (detecting) return;
	detecting = true;
	subscribeAiActivity((activity) => onActivity(services, activity));
}

/** What this node detected on a project, oldest first. */
export function aiDetectionsOf(services: AppServices, projectId: string): readonly DetectedFact[] {
	ensureDetecting(services);
	return watches.get(projectId)?.facts ?? [];
}
