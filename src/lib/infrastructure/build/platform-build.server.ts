import type { PlatformBuildInfo } from '$application/use-cases';
import pkg from '../../../../package.json' with { type: 'json' };

/**
 * Identity of this build, resolved with ZERO hand-maintained values.
 *
 * `version` is the repository's own `package.json`, inlined at build time — a
 * release bump is the single edit, and the running app cannot disagree with the
 * artifact it was cut from. `commit` / `builtAt` are stamped INTO the image by
 * the Dockerfile build args (the publish workflow passes them automatically), so
 * a support screen can name the exact source of a running container. The image
 * tag is what the appliance compose deployed (`LYRIKS_VERSION: ${LYRIKS_TAG}`).
 *
 * Everything except `version` is optional: a source checkout simply reports
 * less, and never a placeholder that looks like a real value.
 */
export function platformBuildInfo(env: Record<string, string | undefined>): PlatformBuildInfo {
	const clean = (value: string | undefined): string | null => {
		const trimmed = value?.trim();
		return trimmed ? trimmed : null;
	};
	return {
		version: pkg.version,
		imageTag: clean(env.LYRIKS_VERSION) ?? clean(env.LYRIKS_TAG),
		// CI stamps the full commit; 12 characters is what a human quotes.
		commit: clean(env.LYRIKS_BUILD_SHA)?.slice(0, 12) ?? null,
		builtAt: clean(env.LYRIKS_BUILD_DATE)
	};
}

/** The engine release this build depends on — the declared, not running, version. */
export function declaredEngineVersion(): string {
	return pkg.dependencies.unspaghettit.replace(/^[^0-9]*/, '');
}
