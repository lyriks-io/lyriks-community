import { getContext, setContext } from 'svelte';

/**
 * The names of the project's admin roles, provided by the page that draws
 * people (the request page's UML diagrams) so a person so named carries the
 * admin's shield (ac-evo-func-uml). Defaults to none outside such a page: a
 * drawing then shows plain user marks.
 */
const KEY = Symbol('admin-role-names');

export type AdminNamesAccessor = () => readonly string[];

export function setAdminNames(accessor: AdminNamesAccessor): void {
	setContext(KEY, accessor);
}

export function getAdminNames(): AdminNamesAccessor {
	return getContext<AdminNamesAccessor>(KEY) ?? (() => []);
}
