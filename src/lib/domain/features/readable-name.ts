/**
 * A name of the behavior model as a person reads it (criterion
 * ac-leaf-ac-tree-readable-actions). Actions, screens and events authored from
 * code often carry the code's identifier (`searchRooms`, `select_room`,
 * `RiskAnalysis`, `collection.completed`); on screen they read as words, each
 * one capitalised (`Search Rooms`, `Select Room`, `Risk Analysis`,
 * `Collection Completed`), the reading the engine's French sentences quote. A
 * name already written in words is the author's own phrasing and is left as it
 * is. Display only: the stored name, which the code and the index refer to,
 * never changes.
 */
export function readableName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed || /\s/.test(trimmed)) return name;
	const words = trimmed
		.replace(/[_.-]+/g, ' ')
		// `searchRooms` -> `search Rooms`, `room2Id` -> `room2 Id`
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		// an acronym before a word: `HTTPServer` -> `HTTP Server`
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.split(/\s+/)
		.filter(Boolean);
	return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
