/**
 * Saves sent one after the other, in the order the person acted. A page shows
 * each act at once and saves it behind; a second act on what a first one is
 * still saving waits for it, so the server applies them in the order they were
 * made and an answer never lands after the act that followed it.
 */
export class SaveQueue {
	#tail: Promise<unknown> = Promise.resolve();

	/** Runs `save` once every save queued before it has settled, and answers what it answers. */
	run<T>(save: () => Promise<T>): Promise<T> {
		const next = this.#tail.then(save, save);
		this.#tail = next.catch(() => undefined);
		return next;
	}
}

/**
 * Why a save was refused, in the server's words when it gives them (`message`,
 * `refusal`, or a plain text body), else the status: what the error toast says
 * after the page went back to how it stood.
 */
export async function refusalOf(res: Response, fallback: string): Promise<string> {
	const raw = await res.text().catch(() => '');
	if (raw) {
		try {
			const body = JSON.parse(raw) as { message?: unknown; refusal?: unknown; error?: unknown } | null;
			for (const said of [body?.refusal, body?.message, body?.error]) if (typeof said === 'string' && said.trim()) return said.trim();
		} catch {
			if (raw.trim().length <= 300 && !raw.trimStart().startsWith('<')) return raw.trim();
		}
	}
	return `${fallback} (${res.status}).`;
}
