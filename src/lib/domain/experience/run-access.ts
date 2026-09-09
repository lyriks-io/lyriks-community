/**
 * Screen-area access for the run-mode simulator.
 *
 * When a persona (a Step-03 role) is active in the run, screens the role is not
 * permitted to reach are locked. Access is derived from the Users & Permissions
 * matrix, most specific rule first:
 *
 *  1. The screen's OWN surface row. A page is a capability in its own right, so
 *     "Visible" on that row is the direct answer to "may this persona open this
 *     page?" — it wins over anything inherited.
 *  2. Otherwise the screen's Core: every screen belongs to one
 *     (`screen.category === core id`), governed by the capabilities that belong
 *     to it (its features and journeys, grouped by `coreId`). A persona may open
 *     the screen when the matrix grants its role `read` on any of them.
 *
 * A page whose own row nobody holds yet is NOT treated as forbidden — it is
 * treated as un-authored, and falls through to its Core. Otherwise adding the
 * surface rows would have locked every screen of every existing project.
 * Screens whose Core has no capability either (login, dashboard, …) stay open
 * to everyone, and author mode (`activePersonaId === null`) sees everything.
 *
 * The role→capability resolution is done at the composition edge (the server
 * `capabilityAccess` catalog, itself built from the sparse permission grants),
 * so this module stays pure and free of the Users bounded context.
 */

/** Minimal structural shapes — avoids importing the full draft / users types. */
interface ScreenLike {
	readonly id: string;
	readonly category: string | null;
}
interface CapabilityRoles {
	readonly id: string;
	readonly roleIds: readonly string[];
	/** The Core this capability belongs to; null/absent = not Core-scoped. */
	readonly coreId?: string | null;
	/** The screen this capability IS (a surface row); null/absent = not a page. */
	readonly screenId?: string | null;
}

export interface ScreenAccessMap {
	/** screenId → capability ids that govern it (absent/empty ⇒ ungated). */
	readonly screenCapabilityIds: Record<string, readonly string[]>;
	/** capabilityId → role ids the matrix grants `read` (i.e. may open the area). */
	readonly capabilityRoleIds: Record<string, readonly string[]>;
}

/**
 * Build the screen→capabilities and capability→roles maps the simulator gates
 * on. A screen is governed by its own surface row when someone holds it, and
 * otherwise inherits every capability whose Core matches its category.
 */
export function buildScreenAccessMap(
	screens: readonly ScreenLike[],
	capabilityAccess: readonly CapabilityRoles[]
): ScreenAccessMap {
	const capabilityRoleIds: Record<string, readonly string[]> = {};
	const capabilityIdsByCore = new Map<string, string[]>();
	const capabilityIdsByScreen = new Map<string, string[]>();
	for (const c of capabilityAccess) {
		capabilityRoleIds[c.id] = c.roleIds;
		// A page governs itself or inherits from its Core — it never *contributes*
		// to its Core, or an ungranted page row would show up as a governing
		// capability of every sibling screen.
		if (c.coreId && !c.screenId) {
			const list = capabilityIdsByCore.get(c.coreId) ?? [];
			list.push(c.id);
			capabilityIdsByCore.set(c.coreId, list);
		}
		// Only a held row governs: an empty grant list means "not authored yet",
		// not "forbidden to everyone".
		if (c.screenId && c.roleIds.length > 0) {
			const list = capabilityIdsByScreen.get(c.screenId) ?? [];
			list.push(c.id);
			capabilityIdsByScreen.set(c.screenId, list);
		}
	}

	const screenCapabilityIds: Record<string, readonly string[]> = {};
	for (const s of screens) {
		const own = capabilityIdsByScreen.get(s.id);
		const caps = own ?? (s.category ? capabilityIdsByCore.get(s.category) : undefined);
		if (caps && caps.length) screenCapabilityIds[s.id] = caps;
	}
	return { screenCapabilityIds, capabilityRoleIds };
}

/**
 * Can the active persona open this screen? Author (`null`) and ungated screens
 * are always open; otherwise the persona must hold at least one of the
 * capabilities governing the screen — its own surface row when it has one, else
 * its Core's.
 */
export function canAccessScreen(
	access: ScreenAccessMap | null,
	screenId: string,
	activePersonaId: string | null
): boolean {
	if (!access || activePersonaId === null) return true;
	const caps = access.screenCapabilityIds[screenId];
	if (!caps || caps.length === 0) return true;
	return caps.some((cap) => access.capabilityRoleIds[cap]?.includes(activePersonaId));
}

/** The capability ids governing a screen (empty when ungated) — for UI labels. */
export function governingCapabilityIds(
	access: ScreenAccessMap | null,
	screenId: string
): readonly string[] {
	return access?.screenCapabilityIds[screenId] ?? [];
}
