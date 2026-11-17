import type { DiagramLinkKind, LinkCandidate } from '$domain/evolution';

/**
 * Where each link of the request's diagrams opens, and whether it still points
 * at something (ac-evo-func-uml-link, ac-evo-tech-uml-link): asked of the
 * project once for the links the diagrams hold, and told of every link picked
 * on the page, so a link just made is never taken for one gone.
 */
export class DiagramLinkStatus {
	readonly projectId: string;
	#known = $state<Record<string, string | null>>({});

	constructor(projectId: string) {
		this.projectId = projectId;
	}

	/** Where a link opens; null when what it links to is gone, undefined while not known. */
	hrefOf(ref: string | undefined): string | null | undefined {
		return ref && ref in this.#known ? this.#known[ref] : undefined;
	}

	remember(candidate: Pick<LinkCandidate, 'ref' | 'href'>) {
		this.#known = { ...this.#known, [candidate.ref]: candidate.href ?? '' };
	}

	/** Look up the links not known yet; a link the project does not answer for is gone. */
	async load(refs: readonly string[]) {
		const asked = refs.filter((r) => !(r in this.#known));
		if (asked.length === 0) return;
		const res = await fetch(`/api/evolution/links?projectId=${encodeURIComponent(this.projectId)}&refs=${encodeURIComponent(asked.join(','))}`).catch(() => null);
		if (!res?.ok) return;
		const { candidates } = (await res.json()) as { candidates: LinkCandidate[] };
		const found = new Map(candidates.map((c) => [c.ref, c.href ?? '']));
		this.#known = { ...this.#known, ...Object.fromEntries(asked.map((r) => [r, found.get(r) ?? null])) };
	}

	/** What the picker offers for what is typed, of the kind the element takes. */
	async search(kind: DiagramLinkKind, q: string): Promise<LinkCandidate[]> {
		const res = await fetch(`/api/evolution/links?projectId=${encodeURIComponent(this.projectId)}&kind=${kind}&q=${encodeURIComponent(q)}`).catch(() => null);
		if (!res?.ok) return [];
		return ((await res.json()) as { candidates: LinkCandidate[] }).candidates;
	}
}
