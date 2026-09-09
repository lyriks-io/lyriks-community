/**
 * What an install is actually made of: one entry per deployable component,
 * reported by the running process itself rather than by a hand-kept list.
 *
 * Two rules make this screen trustworthy in a support conversation:
 *  - **Never invent a number.** A component that does not report its version is
 *    `unknown`, not "probably the same as the platform".
 *  - **Absence is not failure.** The platform runs standalone (the Minimal
 *    Autonomous Product), so an unused optional component reads
 *    `not-configured` — a neutral state, never an error.
 */

/**
 * `host` is not a component Lyriks ships or runs: it is the machine underneath,
 * read by the appliance kit at install and at every update (a container cannot
 * see its own host). It rides this same list so one screen, one digest and one
 * feedback report describe the whole install.
 */
export type ComponentOrigin = 'lyriks' | 'runtime' | 'host';

export type ComponentStatus =
	/** This very process. */
	| 'running'
	/** Answered a probe with a version. */
	| 'reachable'
	/**
	 * No version could be established: the component answered without one, or it
	 * is only reachable through another component that did not answer. Either way
	 * the screen says so instead of guessing.
	 */
	| 'unknown'
	/** Optional and deliberately not wired in this install. */
	| 'not-configured'
	/** Configured but did not answer. */
	| 'unreachable'
	/**
	 * Read once, on the host, when the appliance was installed or last updated.
	 * A snapshot rather than a probe: it cannot be re-read from in here, so the
	 * row always says when it was taken.
	 */
	| 'recorded';

export interface ComponentVersion {
	readonly id: string;
	readonly name: string;
	readonly origin: ComponentOrigin;
	/** `null` whenever the component did not report one — never a guess. */
	readonly version: string | null;
	readonly status: ComponentStatus;
	/** Where the number came from, or why there is none. One short sentence. */
	readonly detail?: string;
	/** Extra facts worth copying into a support ticket (commit, build date, …). */
	readonly build?: Readonly<Record<string, string>>;
}

/** Components Lyriks builds and ships, in deployment order. */
export function firstParty(components: readonly ComponentVersion[]): ComponentVersion[] {
	return components.filter((c) => c.origin === 'lyriks');
}

/** The stack underneath — useful in a support ticket, not made by Lyriks. */
export function runtime(components: readonly ComponentVersion[]): ComponentVersion[] {
	return components.filter((c) => c.origin === 'runtime');
}

/** The machine this install runs on, as the kit recorded it. */
export function host(components: readonly ComponentVersion[]): ComponentVersion[] {
	return components.filter((c) => c.origin === 'host');
}

/**
 * One line an operator can paste into a support ticket. Deliberately plain
 * text: it must survive a chat client, an email and a screenshot.
 */
export function componentsDigest(components: readonly ComponentVersion[]): string {
	return components
		.map((c) => `${c.name}: ${c.version ?? statusWord(c.status)}`)
		.join('\n');
}

/**
 * Everything the Versions screen knows, as plain text: version, status, the
 * component's own explanation and its build facts. This is the debugging
 * context a feedback report carries; `componentsDigest` stays the short form
 * for a chat message.
 */
export function componentsReport(components: readonly ComponentVersion[]): string {
	return components
		.map((c) => {
			const lines = [`${c.name}: ${c.version ?? statusWord(c.status)} (${c.status.replace('-', ' ')})`];
			if (c.detail) lines.push(`  ${c.detail}`);
			for (const [label, value] of Object.entries(c.build ?? {})) {
				lines.push(`  ${label}: ${value}`);
			}
			return lines.join('\n');
		})
		.join('\n');
}

function statusWord(status: ComponentStatus): string {
	switch (status) {
		case 'not-configured':
			return 'not configured';
		case 'unreachable':
			return 'unreachable';
		case 'recorded':
			return 'not reported';
		default:
			return 'unknown';
	}
}
