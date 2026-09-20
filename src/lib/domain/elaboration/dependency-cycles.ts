/** Cycle members only, not every feature downstream of a cycle. Iterative to avoid stack overflow. */
export function dependencyCycleMembers(graph: ReadonlyMap<string, readonly string[]>): Set<string> {
	const visited = new Set<string>();
	const order: string[] = [];
	const reverse = new Map([...graph.keys()].map(id => [id, [] as string[]]));
	for (const [id, edges] of graph) for (const next of edges) reverse.get(next)?.push(id);
	for (const root of graph.keys()) {
		const stack = [{ id: root, exit: false }];
		while (stack.length) {
			const frame = stack.pop()!;
			if (frame.exit) { order.push(frame.id); continue; }
			if (visited.has(frame.id)) continue;
			visited.add(frame.id);
			stack.push({ id: frame.id, exit: true });
			for (const next of graph.get(frame.id) ?? []) if (graph.has(next) && !visited.has(next)) stack.push({ id: next, exit: false });
		}
	}
	const assigned = new Set<string>();
	const cyclic = new Set<string>();
	for (const root of order.reverse()) {
		if (assigned.has(root)) continue;
		const stack = [root];
		const members: string[] = [];
		while (stack.length) {
			const id = stack.pop()!;
			if (assigned.has(id)) continue;
			assigned.add(id); members.push(id);
			for (const next of reverse.get(id) ?? []) if (!assigned.has(next)) stack.push(next);
		}
		if (members.length > 1 || graph.get(root)?.includes(root)) for (const id of members) cyclic.add(id);
	}
	return cyclic;
}
