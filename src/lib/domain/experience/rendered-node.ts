import { HEADER_SURFACE_ID, FOOTER_SURFACE_ID, isPanelPresentation, type ExperienceBuilder } from './builder';
import { evalVisibility, getState, listRowsFor, resolveGate, type RowContext, type RunState } from './builder-runtime';

/** Structural reachability in the Runner, not a substitute for the target's access gate. */
export function isNodeRendered(b: ExperienceBuilder, rs: RunState, targetId: string, ctx?: RowContext | null): boolean {
	const visit = (id: string | undefined, ancestors: Set<string>): boolean => {
		if (!id || ancestors.has(id)) return false;
		const node = b.nodes[id];
		if (!node) return false;
		const next = new Set(ancestors).add(id);
		if (node.kind === 'element') {
			// Preserve the target's detailed permission/visibleWhen diagnostics.
			if (id === targetId) return true;
			if (node.elementKind !== 'list' || !node.componentId || !resolveGate(node, rs.activePersonaId, rs.state, ctx).visible) return false;
			return listRowsFor(node, rs.state, rs.collections).length > 0 && visit(b.screenRoots[node.componentId], next);
		}
		if (!evalVisibility(rs.state, node.visibleWhen, ctx)) return false;
		if (id === targetId) return true;
		const include = node.componentId ? b.screenRoots[node.componentId] : undefined;
		// Overlay/menu containers render both their included tree and local children.
		if ((node.presentation === 'overlay' || node.presentation === 'menu') && node.visibleWhen) {
			return visit(include, next) || node.childIds.some((child) => visit(child, next));
		}
		if (isPanelPresentation(node.presentation)) {
			const panels = node.childIds.filter((child) => b.nodes[child]?.kind === 'group');
			const index = Math.min(Math.max(0, Math.floor(Number(getState(rs.state, node.tabsKey || `tabs.${node.id}`)) || 0)), Math.max(0, panels.length - 1));
			return visit(panels[index], next);
		}
		return include ? visit(include, next) : node.childIds.some((child) => visit(child, next));
	};
	const surfaces = [rs.currentScreenId, ...(b.shell?.headerEnabled ? [HEADER_SURFACE_ID] : []), ...(b.shell?.footerEnabled ? [FOOTER_SURFACE_ID] : [])];
	return surfaces.some((surface) => surface && visit(b.screenRoots[surface], new Set()));
}
