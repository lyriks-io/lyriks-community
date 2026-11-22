import { describe, expect, it } from 'vitest';
import { computeDefinitionCoherence } from './definition-coherence';
import { createEmptyDefinitionDraft, type FoundationDefinitionDraft } from './definition';

type Change = (d: FoundationDefinitionDraft) => void;
const definition = (...changes: Change[]) => {
	const d = createEmptyDefinitionDraft('p');
	for (const change of changes) change(d);
	return d;
};
const score = (...changes: Change[]) => computeDefinitionCoherence(definition(...changes)).score;
const codes = (...changes: Change[]) => computeDefinitionCoherence(definition(...changes)).issues.map((i) => i.code);

describe('the Foundation definition coherence', () => {
	it('weighs the problem, the outcome, success criteria, what is served and a delivery boundary', () => {
		expect(score((d) => (d.businessObjective.mainProblem = 'Month-end takes a week'))).toBe(25);
		expect(score((d) => (d.businessObjective.successCriteria = ['Close in a day']))).toBe(19);
		expect(score((d) => (d.market.languages = ['en']))).toBe(13);
		expect(score((d) => (d.market.regulations = ['SOX']))).toBe(13);
		expect(score((d) => (d.technical.compatibilities = ['Chrome']))).toBe(19);
	});

	it('never counts the fields the screen no longer shows (criteria e8a65d93, 5784d998, ac-leaf-ac-tech-2)', () => {
		expect(
			score((d) => {
				d.business.risks = ['Vendor lock-in'];
				d.business.slas = [{ metric: 'Uptime', commitment: '99.9%', penalty: 'Credit' }];
				d.technical.integrations = [{ system: 'ERP', direction: 'both', criticality: 'high' }];
				d.technical.performance = [{ action: 'Search', target: 200, unit: 'ms' }];
				d.technical.availability = '99.9%';
				d.security.dataRetention = [{ dataType: 'Invoices', duration: '10 years', actionAfter: 'archival' }];
			})
		).toBe(0);
	});

	it('takes points away for what contradicts itself, and names it', () => {
		const authOnly: Change = (d) => (d.security.authentication = ['sso']);
		expect([score(authOnly), codes(authOnly)]).toEqual([19 - 8, ['auth-no-encryption']]);
		expect(codes(authOnly, (d) => (d.security.encryption = ['in_transit']))).toEqual([]);
		expect(codes((d) => (d.security.expectedCertifications = ['PCI_DSS']), (d) => (d.security.encryption = ['in_transit']))).toEqual(['pci-needs-at-rest']);
		expect(codes((d) => (d.security.expectedCertifications = ['PCI_DSS']), (d) => (d.security.encryption = ['at_rest']))).toEqual([]);
		expect(codes((d) => (d.market.languages = ['fr']))).toEqual(['eu-lang-no-gdpr']);
		expect(codes((d) => (d.market.languages = ['fr']), (d) => (d.market.regulations = ['g.d.p.r']))).toEqual([]);
	});
});
