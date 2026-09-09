/**
 * Client-safe constants for optimistic-lock wiring. Kept out of the `.server`
 * helper so client stores can import the header name without pulling server-only
 * code into the browser bundle.
 */
export const REVISION_HEADER = 'x-lyriks-rev';
