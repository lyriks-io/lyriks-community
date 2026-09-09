/** One didactic explanation, shaped for the `HelpTip` component. */
export interface HelpEntry {
	title: string;
	/** One or two plain sentences: what this is for. */
	what: string;
	/** Optional step-by-step "how to use it" bullets. */
	how?: string[];
	/** Optional "why it matters" note — the enterprise cost/quality angle. */
	value?: string;
}
