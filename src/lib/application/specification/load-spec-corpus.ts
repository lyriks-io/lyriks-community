import type { BehaviorPort } from '../ports/behavior-port';

/** Reads one section's draft; the composition root hands one per section. */
export type SectionReader = (projectId: string) => Promise<unknown>;

/**
 * Keys whose values are identifiers, addresses or presentation, never words a
 * person wrote: matching the vocabulary against them would only find noise.
 */
const NON_PROSE_KEY =
	/^(id|ids|key|ref|refs|url|href|src|icon|color|colour|tone|class|className|style|path|file|signature|version|status|kind|type|code|locale|lang|operator|unit|format|hash|token|revision|sourceMode|stage|layer|category|severity|lastSavedAt|updatedAt|createdAt|savedAt|at)$|(Id|Ids|At|Url|Href|Key|Ref|Color|Icon|Path)$/;
const NON_PROSE_VALUE = /^(https?:\/\/|#[0-9a-f]{3,8}$|[0-9a-f-]{8,}$|[\d\s.,:%/-]+$)/i;

/**
 * Every piece of prose a draft holds: names, descriptions, rules, scenarios,
 * messages. A pure walk over the document, so a field added to any section
 * tomorrow is read without this list changing.
 */
export function collectProse(value: unknown, into: string[] = [], key = ''): string[] {
	if (typeof value === 'string') {
		const text = value.trim();
		if (text && /\p{L}/u.test(text) && !NON_PROSE_KEY.test(key) && !NON_PROSE_VALUE.test(text))
			into.push(text);
	} else if (Array.isArray(value)) {
		for (const item of value) collectProse(item, into, key);
	} else if (value && typeof value === 'object') {
		for (const [k, v] of Object.entries(value)) if (!NON_PROSE_KEY.test(k)) collectProse(v, into, k);
	}
	return into;
}

/**
 * The whole specification as text, for the Glossary: every section a person or
 * an AI client authors (Evolution dossiers excepted, they are proposals until
 * frozen) and every feature of the behavior model. The glossary counts its
 * words, and the words it bans, against all of it instead of the brief alone.
 * A section or a feature that cannot be read is skipped, never fatal.
 */
export class LoadSpecCorpusUseCase {
	constructor(
		private readonly sections: readonly SectionReader[],
		private readonly behavior: Pick<BehaviorPort, 'readProject' | 'readFeature'>
	) {}

	async execute(projectId: string): Promise<string> {
		const drafts = await Promise.all(
			this.sections.map((read) => read(projectId).catch(() => null))
		);
		const project = await this.behavior.readProject(projectId).catch(() => null);
		const features = await Promise.all(
			(project?.project.featureIds ?? []).map((featureId) =>
				this.behavior.readFeature(projectId, featureId).catch(() => null)
			)
		);
		return collectProse([...drafts, ...features]).join('\n');
	}
}
