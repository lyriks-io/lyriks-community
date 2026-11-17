/**
 * A person as the page names them: their roster name, never a raw id. With
 * auth off, the one operator of the box acts under a technical id the history
 * keeps; the page passes the name the app gives them, and only without one does
 * it read as "Local operator".
 */
export function personName(id: string, members: readonly { id: string; name: string }[] = []): string {
	const named = members.find((m) => m.id === id)?.name;
	if (named) return named;
	return id === 'local-operator' ? 'Local operator' : id;
}
