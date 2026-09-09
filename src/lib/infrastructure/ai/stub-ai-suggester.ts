import {
	type FormFactorCode,
	type MarketTypeCode,
	type FoundationIdentityDraft,
	type SuggestableSection
} from '$domain/foundation';
import type {
	AiSuggesterPort,
	BriefAnalysis,
	PersonaSuggestion,
	SectionSuggestion
} from '$application/ports';

/**
 * Deterministic, offline brief heuristics behind `AiSuggesterPort`. Keyword
 * matching only — no network call, no key — so the Analyze / Suggest UX works
 * on the air-gapped appliance. Feature suggestions are NOT produced here: they
 * only ever come from the operator's LLM through the MCP write path.
 */
export class StubAiSuggester implements AiSuggesterPort {
	async analyzeBrief(brief: string): Promise<BriefAnalysis> {
		const text = brief.toLowerCase();
		return {
			suggestedFormFactors: this.formFactors(text),
			suggestedMarketType: this.marketType(text),
			suggestedPainPoints: this.painPoints(text),
			suggestedCompetitors: this.competitorNames(text),
			highlights: this.highlights(brief)
		};
	}

	async suggest(
		section: SuggestableSection,
		brief: string,
		draft: FoundationIdentityDraft
	): Promise<SectionSuggestion> {
		void draft;
		const formFactors = this.formFactors(brief.toLowerCase());
		return { section, patch: { formFactors }, itemCount: formFactors.length };
	}

	async suggestPersonas(brief: string, draft: FoundationIdentityDraft): Promise<PersonaSuggestion[]> {
		const text = `${brief} ${draft.industry}`.toLowerCase();
		const out: PersonaSuggestion[] = [
			{ name: 'Customer', rationale: 'Buys and manages their own orders.', userClass: 'end-user' },
			{ name: 'Visitor', rationale: 'Browses without an account.', userClass: 'end-user' },
			{ name: 'Admin', rationale: 'Configures the workspace and its members.', userClass: 'back-office' },
			{ name: 'Operator', rationale: 'Runs day-to-day back-office operations.', userClass: 'back-office' }
		];
		if (/member|subscriber|portal|account|loyalty/.test(text))
			out.push({ name: 'Member', rationale: 'A returning, signed-in end-user.', userClass: 'end-user' });
		if (/support|help|ticket|service desk/.test(text))
			out.push({ name: 'Support', rationale: 'Assists end-users with limited internal access.', userClass: 'back-office' });
		if (/invoic|billing|finance|account|payment|dunning/.test(text)) {
			out.push({ name: 'Finance Manager', rationale: 'Owns invoicing, dunning and cash collection.', userClass: 'back-office' });
			out.push({ name: 'Accountant', rationale: 'Reconciles the books and closes the month.', userClass: 'back-office' });
		}
		return out;
	}

	/* ── keyword heuristics ──────────────────────────────────────────────── */

	private formFactors(text: string): FormFactorCode[] {
		const picks = new Set<FormFactorCode>();
		if (/\bapi\b|integrat/.test(text)) picks.add('api');
		if (/mobile|app store|ios|android/.test(text)) picks.add('mobile_touch');
		if (/web|browser|saas|dashboard|portal/.test(text)) picks.add('web_interface');
		if (/cli|command.line|terminal/.test(text)) picks.add('cli');
		if (/voice|speech|alexa/.test(text)) picks.add('voice_assistant');
		if (/chat|bot|messaging/.test(text)) picks.add('text_chatbot');
		if (/agent|autonomous|llm/.test(text)) picks.add('ai_agent');
		if (picks.size === 0) picks.add('web_interface');
		return [...picks];
	}

	private marketType(text: string): MarketTypeCode {
		if (/\bb2c\b|consumer|individual/.test(text)) return 'b2c';
		if (/government|public sector|\bb2g\b/.test(text)) return 'b2g';
		if (/marketplace|peer.to.peer|\bp2p\b/.test(text)) return 'p2p';
		return 'b2b';
	}

	private painPoints(text: string): string[] {
		const out: string[] = [];
		if (/invoic|billing/.test(text)) out.push('Manual invoicing overhead');
		if (/dunning|collection|payment/.test(text)) out.push('Slow collections');
		if (/expensive|costly|legacy|heavy/.test(text)) out.push('Expensive legacy tools');
		if (/compliance|regulation|2026/.test(text)) out.push('Looming compliance gap');
		if (/manual|time|hours/.test(text)) out.push('Too much manual work');
		return out.length ? out.slice(0, 4) : ['Status-quo workflow is slow and error-prone'];
	}

	private competitorNames(text: string): string[] {
		const known: Record<string, string> = {
			stripe: 'Stripe',
			quickbooks: 'QuickBooks',
			sage: 'Sage',
			gocardless: 'GoCardless',
			xero: 'Xero',
			notion: 'Notion',
			salesforce: 'Salesforce'
		};
		const found = Object.entries(known)
			.filter(([key]) => text.includes(key))
			.map(([, name]) => name);
		return found.length ? found : ['Incumbent A', 'Incumbent B'];
	}

	private highlights(brief: string): string[] {
		const out = new Set<string>();
		// Quantified claims like "14 hours", "80%", "5-50 employees".
		for (const m of brief.matchAll(/\b\d[\d.,]*\s?(?:%|hours?|h\b|days?|employees|min|x)\b/gi)) {
			out.add(m[0].trim());
		}
		for (const kw of ['Stripe', 'GoCardless', 'GDPR', 'compliance', 'automat']) {
			const re = new RegExp(`\\b${kw}\\w*\\b`, 'i');
			const m = brief.match(re);
			if (m) out.add(m[0]);
		}
		return [...out].slice(0, 8);
	}

}
