import { describe, expect, it } from 'vitest';
import type { AiSuggesterPort, BriefAnalysis, TelemetryEvent } from '../ports';
import { AnalyzeBriefUseCase, EmptyBriefError } from './analyze-brief';

const analysis: BriefAnalysis = { suggestedFormFactors: ['biometric'], suggestedPainPoints: ['Slow month-end'], suggestedCompetitors: ['Ledgerly'], highlights: ['month-end'] };

function analyze() {
	const asked: string[] = [];
	const events: TelemetryEvent[] = [];
	const ai = { analyzeBrief: async (brief: string) => (asked.push(brief), analysis) } satisfies Pick<AiSuggesterPort, 'analyzeBrief'>;
	return { asked, events, useCase: new AnalyzeBriefUseCase(ai, { emit: (e) => void events.push(e) }) };
}

describe('analysing the brief', () => {
	it('refuses an empty brief before asking the AI anything', async () => {
		const { asked, events, useCase } = analyze();
		await expect(useCase.execute('   ')).rejects.toBeInstanceOf(EmptyBriefError);
		expect([asked, events]).toEqual([[], []]);
	});

	it('answers what the AI read in a written brief, and records that it was analysed', async () => {
		const { asked, events, useCase } = analyze();
		expect(await useCase.execute('Close the books in a day.')).toBe(analysis);
		expect(asked).toEqual(['Close the books in a day.']);
		expect(events.map((e) => e.type)).toEqual(['init.brief.analyzed']);
	});
});
