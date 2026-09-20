import { isFieldBuilderKind, type BuilderElementNode, type ExperienceBuilder } from './builder';
import { blocksWhenEmpty, inputNodesOfScreen, sampleInputValue } from './builder-runtime';
import { simulate, type SimAction } from './simulate';
import { hostedSurfacesResolver } from './surface-hosting';

/** A bounded search for enabling interactions; never invents state or bypasses a guard. */
export function planNavigation(
	builder: ExperienceBuilder,
	startScreenId: string,
	prefix: SimAction[],
	fromScreenId: string,
	toScreenId: string,
	maxAttempts = 256
): SimAction[] | null {
	const surfaces = hostedSurfacesResolver(builder.nodes)(fromScreenId);
	const elements = Object.values(builder.nodes).filter((n): n is BuilderElementNode =>
		n.kind === 'element' && surfaces.has(n.surfaceId)
	);
	const initial = simulate(builder, { startScreenId, actions: prefix });
	if (initial.finalScreenId !== fromScreenId) return null;
	const key = (state: Record<string, unknown>, counts: Record<string, number>) =>
		JSON.stringify([Object.entries(state).sort(([a], [b]) => a.localeCompare(b)), counts]);
	const seen = new Set([key(initial.state, initial.collectionCounts)]);
	const queue: SimAction[][] = [[]];
	let attempts = 0;
	for (let cursor = 0; cursor < queue.length && attempts < maxAttempts; cursor++) {
		const path = queue[cursor];
		if (path.length >= 8) continue;
		for (const node of elements) {
			const triggers = [...new Set(node.wiring.transitions.map((t) => t.trigger))];
			if (node.wiring.binding?.targetKind === 'surface') triggers.push('click');
			for (const trigger of [...new Set(triggers)]) {
				if (++attempts > maxAttempts) return null;
				const fills: SimAction[] = node.wiring.requireValid
					? inputNodesOfScreen(builder, fromScreenId).flatMap((input) => {
						if (!blocksWhenEmpty(input)) return [];
						const value = sampleInputValue(input);
						return value === null ? [] : [{ nodeId: input.id, type: value }];
					}) : [];
				const next = [...path, ...fills, { nodeId: node.id, trigger }];
				const run = simulate(builder, { startScreenId, actions: [...prefix, ...next] });
				// A scenario failure must still be surfaced by verification, not turn
				// into "no navigation". Binding/visibility/validation failures cannot
				// be used as enabling steps in a purported happy path.
				const errors = run.errors.slice(initial.errors.length);
				if (errors.some((e) => e.kind !== 'scenario')) continue;
				if (run.finalScreenId === toScreenId) return next;
				if (run.finalScreenId !== fromScreenId || isFieldBuilderKind(node.elementKind)) continue;
				const signature = key(run.state, run.collectionCounts);
				if (seen.has(signature)) continue;
				seen.add(signature);
				queue.push(next);
			}
		}
	}
	return null;
}
