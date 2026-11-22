import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument, saveRetrospecActs } from '$application/retrospec/retrospec-store';
import {
	amendedByRequest,
	carriesElement,
	elementProved,
	isLanded,
	landedLines,
	record,
	requestKeyOf,
	validationOf,
	type Actor,
	type EvolutionRequest,
	type KnowledgeLanding,
	type ProjectEvolutionDraft
} from '$domain/evolution';
import { RETROSPEC_SECTION, SPEC360_TAB, landingInKnowledge, type LandedElement, type PersonRef, type SpecElement } from '$domain/retrospec';
import { forgetSpecElements, readSpecElements } from './spec-elements.server';
import { publishSectionChange } from './sync-bus.server';

/**
 * The landing validates in Knowledge what the change delivered (EVO-002): once
 * the specification is written, every element the landing wrote whose lines of
 * the Verification report are all proved in the code reads Validated through
 * the request. It runs after the specification write and never undoes it: when
 * Knowledge cannot be written, the change stays live, its elements read To
 * review and the history of the request says why.
 */

/** What Knowledge read before the landing, element by element: what the landing wrote is told from it. */
export type KnowledgeBefore = ReadonlyMap<string, string | undefined>;

const fingerprints = (elements: readonly SpecElement[]): KnowledgeBefore => new Map(elements.map((e) => [e.id, e.fingerprint]));

/** Knowledge as it reads before anything lands; null when it cannot be read, which the landing then says. */
export async function readKnowledgeBefore(services: AppServices, projectId: string): Promise<KnowledgeBefore | null> {
	try {
		return fingerprints(await readSpecElements(services, projectId));
	} catch {
		return null;
	}
}

/** The requests this batch made land, and that carry something to write. */
export function landedBetween(before: ProjectEvolutionDraft, after: ProjectEvolutionDraft): EvolutionRequest[] {
	return after.requests.filter((request) => {
		const was = before.requests.find((r) => r.id === request.id);
		const carries = request.drafts.length + request.dataDrafts.length + request.sectionDrafts.length + request.ruleDrafts.length > 0;
		return carries && isLanded(request) && !!was && !isLanded(was);
	});
}

/**
 * The elements the landing validates: those it added, changed or removed among
 * the ones the request carries a change to, then those set to Validate at the
 * landing it did not write (EVO-003). One the change amends is validated only
 * once its code proves it; one it only builds on is, the approval having covered it.
 */
function writtenElements(request: EvolutionRequest, before: KnowledgeBefore, after: readonly SpecElement[]): LandedElement[] {
	const now = new Map(after.map((e) => [e.id, e]));
	const ids = new Set([...before.keys(), ...now.keys()]);
	const lines = landedLines(request);
	const written: LandedElement[] = [];
	for (const id of ids) {
		const element = now.get(id);
		const changed = !before.has(id) || !element || before.get(id) !== element.fingerprint;
		if (changed && carriesElement(request, id)) written.push({ id, element, proved: elementProved(lines, id) });
	}
	const landed = new Set(written.map((w) => w.id));
	for (const id of Object.keys(request.landingChoices ?? {})) {
		if (landed.has(id)) continue;
		written.push({ id, element: now.get(id), proved: amendedByRequest(request, id) ? elementProved(lines, id) : true });
	}
	return written;
}

/** The people who approved the request, by the names the team reads; the person who made it live when nobody signed the Approval. */
function approversOf(request: EvolutionRequest, actor: PersonRef, names: ReadonlyMap<string, string>): PersonRef[] {
	const ids = [...new Set(validationOf(request, 'approval').validations.map((v) => v.by))];
	return ids.length > 0 ? ids.map((id) => ({ id, name: names.get(id.toLowerCase()) ?? id })) : [actor];
}

const plural = (n: number) => `${n} element${n === 1 ? '' : 's'}`;

function summaryOf(key: string, outcome: KnowledgeLanding): string {
	if (outcome.failure) return `Knowledge could not record what ${key} delivered: ${outcome.failure} The change is live; ${plural(outcome.toReview.length)} it wrote read To review.`;
	if (outcome.specValidated) return `The specification is validated definitively: the landing of ${key} validated nothing element by element in Knowledge.`;
	return `Knowledge: ${plural(outcome.validated.length)} validated through ${key}, ${plural(outcome.toReview.length)} to review.`;
}

export interface KnowledgeLandingInput {
	readonly projectId: string;
	readonly before: ProjectEvolutionDraft;
	readonly after: ProjectEvolutionDraft;
	readonly knowledgeBefore: KnowledgeBefore | null;
	readonly actor: Actor & { readonly name?: string };
	/** The team by lowercased id, to name the people who approved. */
	readonly names: ReadonlyMap<string, string>;
	readonly at: string;
	readonly origin: string | null;
}

/** One landed request validated in Knowledge, or the reason it could not be. */
async function landInKnowledge(services: AppServices, input: KnowledgeLandingInput, request: EvolutionRequest, key: string): Promise<KnowledgeLanding> {
	const lander: PersonRef = { id: input.actor.id, name: input.names.get(input.actor.id.toLowerCase()) ?? input.actor.name ?? input.actor.id };
	let written: LandedElement[] = [];
	try {
		if (!input.knowledgeBefore) throw new Error('Knowledge could not be read before the landing.');
		// What the landing wrote is read off the specification it left: the behaviour lands straight in the engine.
		forgetSpecElements(input.projectId);
		const after = await readSpecElements(services, input.projectId);
		written = writtenElements(request, input.knowledgeBefore, after);
		const { doc } = await loadRetrospecDocument(services.sectionDocuments, input.projectId);
		const landing = landingInKnowledge(doc, { requestId: request.id, requestKey: key, approvedBy: approversOf(request, lander, input.names), at: input.at }, written, SPEC360_TAB, after.length);
		if (landing.acts.length > 0) {
			const saved = await saveRetrospecActs(services.sectionDocuments, input.projectId, landing.acts, { actor: lander, now: input.at }, input.origin);
			if (!saved.ok) throw new Error(saved.reason);
			publishSectionChange({ projectId: input.projectId, section: RETROSPEC_SECTION, origin: input.origin });
		}
		return { at: input.at, validated: landing.validated, toReview: landing.toReview, ...(landing.specValidated ? { specValidated: true } : {}) };
	} catch (cause) {
		const failure = cause instanceof Error && cause.message ? cause.message : 'Knowledge did not answer.';
		return { at: input.at, validated: [], toReview: written.filter((w) => w.element).map((w) => w.id), failure };
	}
}

const ATTEMPTS = 3;

/** The outcome kept on the request with its line of history, under the dossier's revision; false when it could not be. */
async function keepOnRequest(services: AppServices, input: KnowledgeLandingInput, requestId: string, outcome: KnowledgeLanding, summary: string): Promise<boolean> {
	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		const [draft, revision] = await Promise.all([
			services.loadEvolutionDraft.execute(input.projectId),
			services.sectionDocuments.currentRevision(input.projectId, 'evolution')
		]);
		const requests = draft.requests.map((r) =>
			r.id === requestId
				? record({ ...r, knowledgeLanding: outcome }, { id: `knowledge-${requestId}-${input.at}`, type: 'knowledge_validation', summary, actor: input.actor, at: input.at })
				: r
		);
		if (await services.saveEvolutionDraft.execute({ ...draft, requests }, { expectedRevision: revision, origin: input.origin })) return true;
	}
	return false;
}

/**
 * Validate in Knowledge what each request this batch made land delivered, and
 * say it: one result per request, never thrown, since the landing stands whatever happens here.
 */
export async function validateLandedInKnowledge(services: AppServices, input: KnowledgeLandingInput): Promise<{ readonly requestId: string; readonly ok: boolean; readonly summary: string }[]> {
	const results: { requestId: string; ok: boolean; summary: string }[] = [];
	for (const request of landedBetween(input.before, input.after)) {
		const key = requestKeyOf(input.after.requests, request.id) ?? request.id;
		const outcome = await landInKnowledge(services, input, request, key);
		const summary = summaryOf(key, outcome);
		const kept = await keepOnRequest(services, input, request.id, outcome, summary).catch(() => false);
		if (!kept) console.warn(`[evolution] what the landing of ${key} did in Knowledge could not be recorded on the request: ${summary}`);
		results.push({ requestId: request.id, ok: !outcome.failure, summary });
	}
	return results;
}
