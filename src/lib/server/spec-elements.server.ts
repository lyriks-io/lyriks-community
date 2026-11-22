import type { AppServices } from '$composition/container.server';
import { withCarriedGrants } from '$application/specification/capability-registry';
import { readSectionRevisions } from '$application/retrospec/retrospec-store';
import { specElements } from '$application/spec360/elements';
import { experienceView } from '$application/spec360/experience';
import { glanceView } from '$application/spec360/glance';
import { text } from '$application/spec360/labels';
import { specOutline } from '$application/spec360/outline';
import { productRules } from '$application/spec360/product-rules';
import { dataFacts, healthItems, requirementGroups, stackLayers, technicalConstraints } from '$application/spec360/tech';
import { permissionMatrix, specUsers } from '$application/spec360/users';
import type { SpecElement } from '$domain/retrospec';
import { SECTIONS } from '$lib/shared/sections';
import { readBehavior } from './behavior-read.server';
import { readSignature } from './engine-cache-staleness';

/**
 * The elements of a project's Specification 360°, read from every section the
 * pages read, once per change: the list is kept per project under the
 * revisions of the sections it reads and the signature of the behaviour folder,
 * which moves when a behaviour or an implementation report is written straight
 * into the engine. A 15 s timer used to stand for that signature: every click
 * after a pause rebuilt the whole list (a second or more on a large project).
 */

/** The net for what neither the revisions nor the signature see. */
const TTL_MS = 5 * 60_000;

/**
 * Sections the list never reads: a change request's acts and the background
 * coherence analysis write them all day long, and must not throw the list away.
 */
const UNREAD: ReadonlySet<string> = new Set(['evolution', 'coherence']);
const READ_SECTIONS = SECTIONS.filter((section) => !UNREAD.has(section));

/** What the list depends on: the revisions of the sections it reads and the behaviour folder. */
export async function specElementsKey(services: AppServices, projectId: string): Promise<string> {
	const revisions = await readSectionRevisions(services.sectionDocuments, services.draftLock, projectId, READ_SECTIONS).catch(() => ({}));
	// A store that answers in bulk gives every section of the project: only those the list reads count.
	const sections = Object.entries(revisions)
		.filter(([section]) => READ_SECTIONS.includes(section as (typeof READ_SECTIONS)[number]))
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v}`)
		.join('|');
	// No signature (no behaviour folder here): the key is the revisions alone, and the TTL is the net.
	return `${sections}|behavior=${readSignature(services.behaviorSignature, projectId) ?? 'unsigned'}`;
}

async function readFresh(services: AppServices, projectId: string): Promise<SpecElement[]> {
	const [foundation, users, features, experience, data, architecture, glossary, behavior, derived, coverage] = await Promise.all([
		services.loadFoundationDraft.execute(projectId),
		services.loadUsersDraft.execute(projectId),
		services.loadFeaturesDraft.execute(projectId),
		services.loadExperienceDraft.execute(projectId),
		services.loadDataDraft.execute(projectId),
		services.loadArchitectureDraft.execute(projectId),
		services.loadGlossaryDraft.execute(projectId),
		readBehavior(services, projectId),
		services.refreshDerivedCapabilities.execute(projectId),
		services.implementationCoverage.get(projectId).catch(() => ({}))
	]);
	const outline = specOutline(features);
	const glance = glanceView({
		identity: foundation.identity,
		definition: foundation.definition,
		users,
		outline,
		architecture,
		counts: { features: 0, actions: 0, rules: 0, users: 0, entities: 0, terms: 0 }
	});
	const carried = withCarriedGrants(users, derived);
	return specElements({
		pitch: glance.pitch,
		hasProblem: !!(glance.problem || glance.symptoms.length),
		hasTarget: !!(glance.target || glance.outcomes.length),
		users: specUsers(users),
		productRules: productRules(behavior.kernelRules, data.rules?.generated),
		hasPermissions: permissionMatrix(carried, derived.features).length > 0,
		outline,
		actions: behavior.actions,
		rules: behavior.kernelRules,
		...(behavior.disabledFeatures ? { disabledFeatures: behavior.disabledFeatures } : {}),
		experience: experienceView(experience),
		entityCount: data.entities.length,
		dataFacts: dataFacts(foundation.definition, data),
		stack: stackLayers(architecture),
		health: healthItems({ data, definition: foundation.definition, operations: foundation.operations, coverage: Object.values(coverage) }),
		requirements: requirementGroups(foundation),
		constraints: technicalConstraints(architecture),
		terms: glossary.terms.map((t) => ({ id: t.id, term: text(t.term) })),
		// What the rows above carry less of, for the fingerprint a complementary run carries validations against.
		contents: {
			problem: foundation.definition.businessObjective,
			target: foundation.definition.businessObjective.expectedOutcome,
			permissions: carried.permissions,
			branding: experience.brand ?? null,
			datamap: data.entities,
			...Object.fromEntries(features.features.map((f) => [`feature:${f.id}`, { name: f.name, description: f.description }])),
			...Object.fromEntries(glossary.terms.map((t) => [`term:${t.id}`, t]))
		}
	});
}

/** Share the costly first read as well as its result; an older read cannot replace a newer one. */
export class SpecElementsReader {
	readonly #cache = new Map<string, { key: string; at: number; elements: SpecElement[] }>();
	readonly #pending = new Map<string, Promise<SpecElement[]>>();
	readonly #epochs = new Map<string, number>();
	readonly #latest = new Map<string, { key: string; order: number }>();
	#order = 0;

	constructor(
		private readonly read = readFresh,
		private readonly revisions = specElementsKey,
		private readonly now = Date.now
	) {}

	async execute(services: AppServices, projectId: string): Promise<SpecElement[]> {
		const order = ++this.#order;
		const epoch = this.#epochs.get(projectId) ?? 0;
		const key = await this.revisions(services, projectId);
		if ((this.#epochs.get(projectId) ?? 0) !== epoch) return this.execute(services, projectId);
		if (order > (this.#latest.get(projectId)?.order ?? 0)) this.#latest.set(projectId, { key, order });
		const hit = this.#cache.get(projectId);
		if (hit && hit.key === key && this.now() - hit.at < TTL_MS) return hit.elements;
		const pendingKey = JSON.stringify([projectId, key, epoch]);
		const pending = this.#pending.get(pendingKey);
		if (pending) return pending;
		const run = this.read(services, projectId).then((elements) => {
			if ((this.#epochs.get(projectId) ?? 0) === epoch && this.#latest.get(projectId)?.key === key) {
				this.#cache.set(projectId, { key, at: this.now(), elements });
			}
			return elements;
		}).finally(() => {
			if (this.#pending.get(pendingKey) === run) this.#pending.delete(pendingKey);
		});
		this.#pending.set(pendingKey, run);
		return run;
	}

	forget(projectId: string): void {
		this.#cache.delete(projectId);
		this.#epochs.set(projectId, (this.#epochs.get(projectId) ?? 0) + 1);
		this.#latest.delete(projectId);
	}
}

const elementsReader = new SpecElementsReader();

/** Every element of the project's Specification 360°, in page order. */
export const readSpecElements = (services: AppServices, projectId: string): Promise<SpecElement[]> => elementsReader.execute(services, projectId);

/** Forget a project's elements: a write made here must read back at once. */
export function forgetSpecElements(projectId: string): void {
	elementsReader.forget(projectId);
}
