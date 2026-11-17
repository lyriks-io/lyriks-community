/**
 * One menu of the feature tree open at a time (spec: criterion ac-tree-row-menu).
 * A menu claims the page when it opens; every other menu watching `owner`
 * closes as soon as the owner is no longer itself. Window click handlers
 * cannot do this alone: menu buttons stop the click so it never reaches them.
 */
let owner = $state<symbol | null>(null);

export const oneMenu = {
	get owner(): symbol | null {
		return owner;
	},
	claim(id: symbol): void {
		owner = id;
	}
};
