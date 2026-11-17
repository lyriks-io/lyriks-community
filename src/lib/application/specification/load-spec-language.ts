import {
	proseLanguage,
	specLanguage,
	type SpecLanguage,
	type SpecLanguageReading
} from '$domain/language';
import type { ProjectFeaturesDraft } from '$domain/features';
import type { LoadFeaturesDraftUseCase } from './load-features-draft';
import type { LoadFoundationDraftUseCase } from './load-foundation-draft';

/** The features whose prose is read: a draft, or the read of it already in flight. */
type FeaturesAtHand =
	| Pick<ProjectFeaturesDraft, 'features'>
	| Promise<Pick<ProjectFeaturesDraft, 'features'>>;

/** A short, stable fingerprint of the prose, so a detection is not run twice on the same text. */
function fingerprint(texts: readonly string[]): string {
	let hash = 0x811c9dc5;
	for (const text of texts) {
		for (let i = 0; i < text.length; i += 1) {
			hash ^= text.charCodeAt(i);
			hash = Math.imul(hash, 0x01000193);
		}
		hash ^= 0x1f;
		hash = Math.imul(hash, 0x01000193);
	}
	return `${texts.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * The language a project's spec is written in: the primary locale its
 * operating details declare, English when none is. The prose of its features
 * is read to warn: always when nothing is declared, and, when a language is
 * declared, whenever the caller already holds the features, to say the prose
 * reads in the other language.
 */
export class LoadSpecLanguageUseCase {
	/** The last detection per project, with the fingerprint of the prose it was read from. */
	readonly #prose = new Map<string, { readonly key: string; readonly language: 'en' | 'fr' | null }>();

	constructor(
		private readonly foundation: Pick<LoadFoundationDraftUseCase, 'loadOperations'>,
		private readonly features: Pick<LoadFeaturesDraftUseCase, 'execute'>
	) {}

	/**
	 * The language Lyriks generates its texts in, read from the declaration
	 * alone: cheap enough for every page load and every write.
	 */
	async generated(projectId: string): Promise<SpecLanguage> {
		const locale = (await this.foundation.loadOperations(projectId)).i18n.primaryLocale;
		return specLanguage(locale).generated;
	}

	/**
	 * The whole reading. `features`, when the caller already holds them (or is
	 * reading them), spares a second read of the draft and lets a declared
	 * language be checked against its prose; without them, the draft is read
	 * only when nothing is declared.
	 */
	async execute(projectId: string, features?: FeaturesAtHand): Promise<SpecLanguageReading> {
		const locale = (await this.foundation.loadOperations(projectId)).i18n.primaryLocale;
		if (locale.trim()) {
			if (!features) return specLanguage(locale);
			return specLanguage(locale, this.#proseOf(projectId, await features));
		}
		const draft = await (features ?? this.features.execute(projectId));
		return specLanguage('', this.#proseOf(projectId, draft));
	}

	#proseOf(projectId: string, draft: Pick<ProjectFeaturesDraft, 'features'>): 'en' | 'fr' | null {
		const texts = draft.features.map((feature) => feature.description ?? '');
		const key = fingerprint(texts);
		const known = this.#prose.get(projectId);
		if (known?.key === key) return known.language;
		const language = proseLanguage(texts);
		this.#prose.set(projectId, { key, language });
		return language;
	}
}
