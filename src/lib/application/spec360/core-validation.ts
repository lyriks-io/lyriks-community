/**
 * What validating a whole core feature at once covers on its page: the core
 * feature itself, then every element of each of its features (the feature's
 * description, its actions, their rules, its journey), in the order the
 * specification lists them. Read from the elements the validation counts, so
 * the batch is exactly what waits there. Pure.
 */

const FEATURE_KINDS: ReadonlySet<string> = new Set(['feature', 'action', 'rule', 'flow']);

export interface CoreValidation {
	readonly anchors: readonly string[];
}

export function coreValidation(elementIds: readonly string[], coreId: string, featureIds: readonly string[]): CoreValidation {
	const own = new Set(featureIds);
	const anchors = elementIds.filter((id) => {
		const [kind, ref] = id.split(':');
		if (kind === 'core') return ref === coreId;
		return FEATURE_KINDS.has(kind) && own.has(ref);
	});
	return { anchors };
}
