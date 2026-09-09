/**
 * The generic closed-vocabulary entry every bounded context builds its
 * catalogs from. Codes are the contract (persisted, shared downstream);
 * labels are human display copy.
 */
export interface Option<Code extends string = string> {
	readonly code: Code;
	readonly label: string;
	readonly hint?: string;
}

/**
 * A catalog code OR any user-typed value. Industry, product type and market
 * type accept custom entries (the catalogs are starting points, not fences);
 * the `string & {}` keeps the catalog codes autocompleting.
 */
export type CustomizableCode<C extends string> = C | (string & {});
