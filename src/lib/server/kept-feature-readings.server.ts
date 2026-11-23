import { rulesOfFeature, type FeatureRulesReader, type KernelRule } from '$application/specification/index-feature-rules';
import { featureStatements } from '$lib/unspa-schema/requirement-sentences';
import type { SpecLanguage } from '$domain/language';

/**
 * One feature's readings in words, kept while its stored snapshot is the same.
 *
 * The behaviour fold writes every rule and scenario of every feature as its
 * sentence, and it runs again after each write to the spec: about a second of
 * the server's thread on lab for the Lyriks project, though a write touches one
 * feature or two. The kernel store hands back the same frozen object for a file
 * that did not change (local-fs-behavior-repository), so what was read from that
 * object cannot differ: it is kept beside it, and goes when the object goes. A
 * snapshot that is not frozen (a draft, a copy) is read each time.
 */

const keptRules = new WeakMap<object, { readonly key: string; readonly rules: KernelRule[] }>();
const keptStatements = new WeakMap<object, Map<SpecLanguage, Readonly<Record<string, string>>>>();
/** The key of a set of borrowed surfaces, read once per set: the fold builds one set and passes it to every feature. */
const borrowedKeys = new WeakMap<ReadonlySet<string>, string>();

function borrowedKey(borrowed: ReadonlySet<string>): string {
	let key = borrowedKeys.get(borrowed);
	if (key === undefined) {
		key = [...borrowed].sort().join('\u0000');
		borrowedKeys.set(borrowed, key);
	}
	return key;
}

export const keptRulesOfFeature: FeatureRulesReader = (featureId, snap, borrowed, lang) => {
	if (!snap || !Object.isFrozen(snap)) return rulesOfFeature(featureId, snap, borrowed, lang);
	const key = `${featureId}\u0001${lang}\u0001${borrowedKey(borrowed)}`;
	const hit = keptRules.get(snap);
	if (hit && hit.key === key) return hit.rules;
	const rules = rulesOfFeature(featureId, snap, borrowed, lang);
	keptRules.set(snap, { key, rules });
	return rules;
};

export function keptFeatureStatements(feature: Record<string, unknown>, lang: SpecLanguage): Readonly<Record<string, string>> {
	if (!Object.isFrozen(feature)) return featureStatements(feature, lang);
	let byLanguage = keptStatements.get(feature);
	const hit = byLanguage?.get(lang);
	if (hit) return hit;
	// Frozen too: every reader of this feature shares it.
	const statements = Object.freeze(featureStatements(feature, lang));
	if (!byLanguage) {
		byLanguage = new Map();
		keptStatements.set(feature, byLanguage);
	}
	byLanguage.set(lang, statements);
	return statements;
}
