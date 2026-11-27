import { currentPersonId } from './evolution-actor.server';
import { timedPart } from './slow-requests.server';
import { shortMemo } from './short-memo.server';
import { error } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import { loadRetrospecDocument } from '$application/retrospec/retrospec-store';
import { RETROSPEC_SECTION, type ActContext, type PersonRef, type RetrospecDocument } from '$domain/retrospec';
import { canReviewElement, specValidationBoard, type SpecElement, type SpecValidationBoard, type SpecValidationSummary } from '$domain/retrospec';
import type { TeamMember } from '$domain/retrospec';
import { shortName } from '$domain/activity';
import type { Baseline } from '$domain/baselines';
import { readSpecElements } from './spec-elements.server';
import { readOnRevision } from './read-on-revision.server';

/**
 * The validation of a project's Specification 360°, as the app bar, Home and
 * the Specification 360° read it: the elements, who each one waits on (the
 * team's jobs), what the retrospecification's verdicts say, and the version
 * the baselines give once validated.
 */

/**
 * The reachable people of the project's owning workspace with their jobs on the
 * project (Enterprise team jobs). The open-source build holds no roster and no
 * jobs: an empty team, so the lead validates alone.
 */
const teams = shortMemo<{ team: TeamMember[]; available: boolean }>();

async function validationTeam(services: AppServices, projectId: string): Promise<{ team: TeamMember[]; available: boolean }> {
	if (!services.identity.multiUser) return { team: [], available: true };
	// One read per project and reader for a few seconds: the page, its band and the app bar all ask (short-memo).
	// An unavailable team is never kept: the next read asks the server again.
	return teams(`${projectId}|${currentPersonId(services)}`, async () => {
		const read = await readValidationTeamFromServer(services, projectId);
		if (!read.available) throw new Error('team unavailable');
		return read;
	}).catch(() => ({ team: [], available: false }));
}

async function readValidationTeamFromServer(services: AppServices, projectId: string): Promise<{ team: TeamMember[]; available: boolean }> {
	try {
		// The link is local and the workspaces live in the Back: asked together, not one after the other.
		const [link, workspaces] = await Promise.all([services.backLinks.find(projectId), services.workspaces.listForCaller()]);
		if (!link) throw new Error('The project workspace is unavailable.');
		const active = workspaces.find((workspace) => workspace.id === link.backWorkspaceId);
		if (!active) throw new Error('The owning workspace is unavailable.');
		if (services.teamJobs.participantsForProject) {
			const people = await services.teamJobs.participantsForProject(active.id, projectId);
			if (people.length === 0) throw new Error('The project roster is unavailable.');
			return { available: true, team: people.map((person) => ({
				person: { id: person.email.trim().toLowerCase(), name: shortName(person.name.trim() || person.email) || person.email },
				jobIds: person.jobIds,
				jobNames: person.names,
				...(person.jobTopics ? { jobTopics: person.jobTopics } : {}),
				...(person.role ? { role: person.role } : {})
			})) };
		}
		const [members, jobs] = await Promise.all([
			services.workspaces.listMembers(active.id),
			services.teamJobs.forProject(active.id, projectId)
		]);
		if (members.length === 0) throw new Error('The project roster is unavailable.');
		return { available: true, team: members
			.filter((m) => m.email?.trim() && m.role !== 'mcp')
			.map((m) => {
				const id = m.email.trim().toLowerCase();
				const held = jobs.get(id);
				return { person: { id, name: shortName(m.name?.trim() || id) || id }, jobIds: held?.jobIds ?? [], jobNames: held?.names ?? [], ...(held?.jobTopics ? { jobTopics: held.jobTopics } : {}), ...(m.role ? { role: m.role } : {}) };
			}) };
	} catch {
		return { team: [], available: false };
	}
}

export async function readValidationTeam(services: AppServices, projectId: string): Promise<TeamMember[]> {
	return (await validationTeam(services, projectId)).team;
}

export interface SpecValidationRead {
	readonly teamAvailable: boolean;
	readonly board: SpecValidationBoard;
	readonly elements: readonly SpecElement[];
	readonly team: readonly TeamMember[];
	readonly doc: RetrospecDocument;
	readonly revision: number;
	readonly baselines: readonly Baseline[];
}

const baselinesOf = (services: AppServices, projectId: string): Promise<Baseline[]> =>
	services.loadBaselinesDraft.execute(projectId).then((d) => [...d.baselines]);

/** Everything the Specification 360° needs to draw and act on the validation. */
/** The run's document, read again for a guard (fresh), else once per revision of it. */
function validationDocument(services: AppServices, projectId: string, fresh: boolean) {
	return fresh
		? loadRetrospecDocument(services.sectionDocuments, projectId)
		: readOnRevision(services, projectId, RETROSPEC_SECTION, () => loadRetrospecDocument(services.sectionDocuments, projectId));
}

/** The validated versions, read again for a guard (fresh), else once per revision of them. */
function validationBaselines(services: AppServices, projectId: string, fresh: boolean): Promise<Baseline[]> {
	return (fresh ? baselinesOf(services, projectId) : readOnRevision(services, projectId, 'baselines', () => baselinesOf(services, projectId))).catch(
		() => [] as Baseline[]
	);
}

/**
 * What the board reads whoever reads it, ahead of the first reader (the read
 * ahead after a start). The team is left out: it is read in the account service
 * as the person reading, and nobody reads ahead.
 */
export async function readSpecValidationSources(services: AppServices, projectId: string): Promise<void> {
	await Promise.all([
		validationDocument(services, projectId, false),
		readSpecElements(services, projectId),
		validationBaselines(services, projectId, false)
	]);
}

export async function readSpecValidationBoard(services: AppServices, projectId: string, viewer: PersonRef | null, options: { readonly requireTeam?: boolean; readonly reviewOnly?: boolean } = {}): Promise<SpecValidationRead> {
	// Each part timed on its own: the board is read twice a page (the bar and Knowledge), so its slow part is worth naming.
	const fresh = options.requireTeam === true;
	const [{ doc, revision }, elements, roster, baselines] = await Promise.all([
		timedPart('validation:document', validationDocument(services, projectId, fresh)),
		timedPart('validation:elements', readSpecElements(services, projectId)),
		timedPart('validation:team', validationTeam(services, projectId)),
		timedPart('validation:baselines', validationBaselines(services, projectId, fresh))
	]);
	if (options.requireTeam && !roster.available) error(503, 'The project team is unavailable. Try again when it is available.');
	const team = roster.team;
	const folding = performance.now();
	const read = specValidationBoard({ doc, elements, team, viewer: options.reviewOnly ? null : viewer, baselines });
	const folded = performance.now() - folding;
	if (folded >= 200) console.warn(`[slow-part] validation:board ${Math.round(folded)}ms (${elements.length} elements)`);
	const board = roster.available ? read : { ...read, complete: false, pct: 0 };
	return { board, elements, team, teamAvailable: roster.available, doc, revision, baselines };
}

/** The Specification 360°'s status: DRAFT or VALIDATED, its counts and its version. */
export async function readSpecValidation(services: AppServices, projectId: string, viewer: PersonRef | null): Promise<SpecValidationSummary> {
	return (await readSpecValidationBoard(services, projectId, viewer)).board.summary;
}

/**
 * Knowledge's validation guards, for a door that applies the run's acts itself
 * (the run's own API): a validation only from someone the element waits on, a
 * publication only once every element is validated by everyone it waits on.
 * Both are read again on every optimistic-save rebase. The caller may write.
 */
export async function readValidationGuards(services: AppServices, projectId: string, actor: PersonRef): Promise<Pick<ActContext, 'canReview' | 'canPublish'>> {
	const read = await readSpecValidationBoard(services, projectId, actor, { requireTeam: true });
	const byId = new Map(read.elements.map((e) => [e.id, e]));
	return {
		canReview: (current, itemId) => canReviewElement(current, byId.get(itemId), read.team, actor, true),
		canPublish: (current) => specValidationBoard({ doc: current, elements: read.elements, team: read.team, viewer: actor, baselines: read.baselines }).complete
	};
}
