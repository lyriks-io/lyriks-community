/**
 * The pages an AI cites in a message of Ask my AI (criterion 7f4690b0). The AI
 * writes a page it names as [name](address), with the address a Lyriks answer
 * gave for it, or pastes a bare address of the installation; the conversation
 * reads them as links. Only a page of this installation becomes one: a link to
 * anywhere else reads as plain text, so a message never leads off the
 * installation with a click, and nothing is fetched to show it.
 */

/** A run of a message: plain text, or the name of a page with the path that opens it. */
export interface MessageSegment {
	readonly text: string;
	readonly href?: string;
}

/** [name](address), or a bare http(s) address. */
const LINK = /\[([^\]\n]+)\]\(([^()\s]+)\)|(https?:\/\/[^\s<>"'()]+)/g;
const NAMED = /\[([^\]\n]+)\]\(([^()\s]+)\)/g;
/** What closes a sentence after a bare address, and is no part of it. */
const TRAILING = /[.,;:!?]+$/;

/**
 * The path that opens the address on this installation, or null when it leads
 * elsewhere. It is resolved against the installation's own origin, so a path
 * a browser would read as another host (//host, /\host) is refused too.
 */
export function installationPath(address: string, origin: string): string | null {
	try {
		const url = new URL(address, origin);
		if (url.origin !== origin) return null;
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return null;
	}
}

/** The message as runs of text and links, in order; `origin` is the installation's (scheme, host and port). */
export function messageSegments(text: string, origin: string): MessageSegment[] {
	const segments: MessageSegment[] = [];
	const push = (segment: MessageSegment) => {
		const before = segments[segments.length - 1];
		if (!segment.href && before && !before.href) segments[segments.length - 1] = { text: before.text + segment.text };
		else if (segment.text) segments.push(segment);
	};
	let at = 0;
	for (const match of text.matchAll(LINK)) {
		push({ text: text.slice(at, match.index) });
		const [whole, name, named, bare] = match;
		if (named !== undefined) {
			const href = installationPath(named, origin);
			push(href ? { text: name, href } : { text: `${name} (${named})` });
		} else {
			const tail = TRAILING.exec(bare)?.[0] ?? '';
			const address = bare.slice(0, bare.length - tail.length);
			const href = installationPath(address, origin);
			push(href ? { text: address, href } : { text: address });
			push({ text: tail });
		}
		at = (match.index ?? 0) + whole.length;
	}
	push({ text: text.slice(at) });
	return segments;
}

/** The message as words alone: each [name](address) reads as its name, for a title or a short notice. */
export function messageWords(text: string): string {
	return text.replace(NAMED, '$1');
}
