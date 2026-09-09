import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * Per-screen implementation brief for the Lyriks MCP `get_implementation_context`
 * tool — a distilled, high-signal markdown summary of ONE screen for a coder/AI
 * building it: the layout as an indented outline (element kinds + labels + wiring,
 * with reused components expanded inline), the journeys/steps that reach the
 * screen, the data the screen touches, and the design tokens to honour.
 *
 *   GET /api/sections/context?projectId=<id>&screen=<screenId>
 *     -> { projectId, screen, markdown }
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	const screenId = url.searchParams.get('screen') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	if (!screenId) error(400, 'screen is required');

	const s = getServices();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const draft = (await s.loadExperienceDraft.execute(projectId)) as any;
	const builder = draft.builder;

	const screen = (draft.screens ?? []).find((sc: any) => sc.id === screenId);
	const rootId: string | undefined = builder?.screenRoots?.[screenId];
	if (!screen && !rootId) error(404, `screen "${screenId}" not found in project "${projectId}"`);

	const md: string[] = [];
	const title = screen?.name || screenId;
	md.push(`# ${title}`);
	if (screen?.description) md.push(`> ${screen.description}`);
	const meta = [screen?.path && `route \`${screen.path}\``, screen?.device && `device \`${screen.device}\``]
		.filter(Boolean)
		.join(' · ');
	if (meta) md.push(meta);

	/* ── Layout outline ──────────────────────────────────────────────────── */
	md.push('\n## Layout');
	if (rootId) md.push('```\n' + outline(builder, rootId, 0).join('\n') + '\n```');
	else md.push('_No layout built yet — create one with build_screen._');

	/* ── Journeys & steps that reach this screen ─────────────────────────── */
	const steps = (draft.steps ?? []).filter((st: any) => st.linkedScreenId === screenId);
	if (steps.length) {
		md.push('\n## Reached by');
		const byJourney = new Map<string, any[]>();
		for (const st of steps) {
			const arr = byJourney.get(st.journeyId) ?? [];
			arr.push(st);
			byJourney.set(st.journeyId, arr);
		}
		for (const [jid, js] of byJourney) {
			const j = (draft.journeys ?? []).find((x: any) => x.id === jid);
			md.push(`- **${j?.name || jid}** — ${js.map((x: any) => x.name).join(' → ')}`);
		}
	}

	/* ── Data the screen touches ─────────────────────────────────────────── */
	const reads = (draft.stepDataReads ?? []).filter((d: any) =>
		steps.some((st: any) => st.id === d.stepId)
	);
	const collections = (builder?.collections ?? []).map((c: any) => c.name);
	if (reads.length || collections.length) {
		md.push('\n## Data');
		if (collections.length) md.push(`- Simulator collections: ${collections.join(', ')}`);
		for (const r of reads) md.push(`- reads \`${r.entityName}\``);
	}

	/* ── Design tokens to honour ─────────────────────────────────────────── */
	const t = builder?.theme;
	if (t) {
		md.push('\n## Design tokens');
		md.push(
			`- accent \`${t.accent}\` on \`${t.onAccent}\` · surface \`${t.surface}\` · bg \`${t.bg}\` · ink \`${t.ink}\``
		);
		md.push(
			`- font \`${t.font}\` · density \`${t.density}\` · radii button/${t.radii?.button} input/${t.radii?.input} card/${t.radii?.card}`
		);
	}

	return json({ projectId, screen: screenId, markdown: md.join('\n') });
};

/** Render a builder subtree as an indented outline; reused components expand inline. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function outline(builder: any, nodeId: string, depth: number, seen: Set<string> = new Set()): string[] {
	const node = builder.nodes?.[nodeId];
	if (!node) return [];
	const pad = '  '.repeat(depth);

	if (node.kind === 'group') {
		const bits: string[] = [];
		if (node.flex?.direction) bits.push(node.flex.direction);
		if (node.flex?.card) bits.push('card');
		if (node.presentation && node.presentation !== 'inline') bits.push(node.presentation);
		let head = `${pad}▸ ${node.label || 'group'}${bits.length ? ` (${bits.join(', ')})` : ''}`;
		const vis = visSummary(node.visibleWhen);
		if (vis) head += `  «${vis}»`;
		const lines = [head];
		// A componentId group renders the component's tree (which lives on its own surface).
		if (node.componentId && builder.screenRoots?.[node.componentId] && !seen.has(node.componentId)) {
			seen.add(node.componentId);
			lines[0] += `  ⟶ component "${node.componentId}"`;
			lines.push(...outline(builder, builder.screenRoots[node.componentId], depth + 1, seen));
		}
		for (const cid of node.childIds ?? []) lines.push(...outline(builder, cid, depth + 1, seen));
		return lines;
	}

	// element
	const w = node.wiring ?? {};
	const tags: string[] = [];
	if (node.variant) tags.push(node.variant);
	if (node.inputType) tags.push(`type=${node.inputType}`);
	const style = styleSummary(node.appearance);
	if (style) tags.push(`style ${style}`);
	if (node.media?.src) tags.push(`media ${node.media.src}`);
	for (const tr of w.transitions ?? []) {
		const e = tr.effect ?? {};
		if (e.kind === 'navigate') tags.push(`→ ${e.target}`);
		else if (e.kind === 'setState') tags.push(`setState ${e.target}=${e.value}`);
		else if (e.kind === 'toggleState') tags.push(`toggle ${e.target}`);
		else if (e.kind === 'incrementState') tags.push(`inc ${e.target}`);
		else if (e.kind === 'call') tags.push(`call "${e.call?.label ?? ''}"`);
		else if (e.kind) tags.push(e.kind);
	}
	if (w.binding?.targetRef) tags.push(`binds ${w.binding.targetKind}:${w.binding.targetRef}`);
	const vis = visSummary(w.visibleWhen);
	if (vis) tags.push(`visibleWhen ${vis}`);
	return [`${pad}• ${node.elementKind}: "${node.label}"${tags.length ? `  [${tags.join(' · ')}]` : ''}`];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function visSummary(v: any): string {
	if (!v?.path) return '';
	return v.op === 'truthy' || v.op === 'falsy'
		? `${v.path} ${v.op}`
		: `${v.path} ${v.op} ${v.expected}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function styleSummary(a: any): string {
	if (!a || typeof a !== 'object') return '';
	return [
		a.width && `width=${a.width}`,
		a.align && `align=${a.align}`,
		a.fontSize && `${a.fontSize}px`,
		a.fontWeight && `weight=${a.fontWeight}`,
		a.color && `color=${a.color}`,
		a.background && `bg=${a.background}`,
		a.radius !== undefined && `radius=${a.radius}`,
		a.shadow && 'shadow'
	]
		.filter(Boolean)
		.join(',');
}
