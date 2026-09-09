/**
 * Shell-facing re-export of the pure member-name derivation. The rule lives in
 * the domain (`$domain/team/member-name`) so the application layer can share it;
 * UI code imports it from here.
 */
export { memberInitials, memberNameFromEmail } from '$domain/team/member-name';
