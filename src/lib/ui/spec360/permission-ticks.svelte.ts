import type { MatrixRow } from '$application/spec360/users';
import type { SpecEdits } from './edits.svelte';

/**
 * Who can do what ticked in place while the spec is a draft (criterion
 * eba33558), one state for a user's permissions and the full matrix: a cell
 * reads what was clicked at once, until the page reads the grant back (or it
 * is refused and the cell reads as before).
 */
export class PermissionTicks {
	#ticked = $state<Record<string, boolean>>({});
	readonly #edits: SpecEdits;

	constructor(edits: SpecEdits) {
		this.#edits = edits;
	}

	/** Whether the user holds a right on the action, as last clicked. */
	holds(userId: string, row: MatrixRow): boolean {
		return this.#ticked[`${userId}|${row.capabilityId}`] ?? row.roleIds.includes(userId);
	}

	async tick(userId: string, capabilityId: string, on: boolean): Promise<void> {
		const key = `${userId}|${capabilityId}`;
		this.#ticked = { ...this.#ticked, [key]: on };
		await this.#edits.tickPermission(userId, capabilityId, on);
		const { [key]: _done, ...rest } = this.#ticked;
		this.#ticked = rest;
	}
}
