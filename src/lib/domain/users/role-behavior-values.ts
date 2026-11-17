import type { Role } from './draft';

/**
 * The state paths the behaviour declares, read from feature snapshots as plain
 * data: every `surfaces[].stateDefinitions[].path`.
 */
export function declaredStatePaths(features: readonly unknown[]): Set<string> {
	const paths = new Set<string>();
	for (const feature of features) {
		const surfaces = (feature as { surfaces?: unknown } | null)?.surfaces;
		if (!Array.isArray(surfaces)) continue;
		for (const surface of surfaces) {
			const definitions = (surface as { stateDefinitions?: unknown } | null)?.stateDefinitions;
			if (!Array.isArray(definitions)) continue;
			for (const definition of definitions) {
				const path = (definition as { path?: unknown } | null)?.path;
				if (typeof path === 'string' && path) paths.add(path);
			}
		}
	}
	return paths;
}

/**
 * The role values whose state no feature declares (criterion 8763ca70 of
 * feat-access-matrix): each one named, so the write is refused with what to fix.
 */
export function roleValuesOutsideBehavior(
	roles: readonly Role[],
	declared: ReadonlySet<string>
): { readonly path: string; readonly message: string }[] {
	return roles.flatMap((role, index) =>
		(role.behaviorValues ?? []).flatMap((value, at) =>
			declared.has(value.path)
				? []
				: [
						{
							path: `roles[${index}].behaviorValues[${at}].path`,
							message: `"${value.path}" of role "${role.name}" is a state no feature of the behaviour declares. Name a state path a feature declares (get_behavior_feature lists them), or declare it in the features that read the role.`
						}
					]
		)
	);
}
