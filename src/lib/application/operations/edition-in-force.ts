import { keyProjects, openedEdition, projectsInForce, type LicenseEdition, type LicenseView } from '$domain/licensing';

/**
 * The edition this installation opens right now, kept in step with its licence.
 *
 * The images declare what the installation can run (`LYRIKS_EDITION`); the key in
 * force decides what it opens within that (an Enterprise installation holding a
 * Community key opens Community). Every licence read records the key's edition
 * here, the activation gate's read included, so each request is served under the
 * edition of the key it was let through with. A read that finds no verifiable key
 * keeps the last edition known: that installation is walled until a key is
 * entered, and must not widen meanwhile.
 */
export class EditionInForce {
	private keyEdition: LicenseEdition | null = null;
	private keyProjectCount: number | null = null;
	private listener: (() => void) | null = null;

	constructor(private readonly declaredEdition: string | undefined) {}

	/** Remember the edition of the key a licence read found. */
	record(view: LicenseView): void {
		const edition = view.entitlements?.edition;
		if (!edition || !view.entitlements) return;
		const before = this.current();
		this.keyEdition = edition;
		this.keyProjectCount = keyProjects(view.entitlements);
		if (this.current() !== before) this.listener?.();
	}

	/**
	 * Be told when the edition the installation opens changes, for what was
	 * started under the previous one (the engine subprocesses prove or not).
	 */
	onChange(listener: () => void): void {
		this.listener = listener;
	}

	/** The edition the installation opens, never more than its images. */
	current(): string | undefined {
		return openedEdition(this.declaredEdition, this.keyEdition);
	}

	/**
	 * The number of active projects the installation holds (EVO-016): 1 on
	 * Community, the number the key in force states on Enterprise, null (every
	 * project) when it states none.
	 */
	projects(): number | null {
		return projectsInForce(this.current(), this.keyProjectCount);
	}

	/** The edition of the images this installation runs, whatever key it holds. */
	declared(): string | undefined {
		return this.declaredEdition;
	}
}
