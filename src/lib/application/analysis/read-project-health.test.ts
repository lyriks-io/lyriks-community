import { describe, expect, it, vi } from 'vitest';
import type { ProjectFeaturesDraft } from '$domain/features';
import type { ProjectFoundationDraft } from '$domain/foundation';
import { ReadProjectHealthUseCase, type AnalysisStateReader } from './read-project-health';
import type { CoherenceView } from './load-coherence-draft';

const features = { features: [{ id: 'f1', name: 'Slide the tiles', parentId: null, kind: 'feature' }] } as unknown as ProjectFeaturesDraft;
const coherence = { analysis: { gaps: [] } } as unknown as CoherenceView;
const foundation = (sourceMode: string) => ({ identity: { sourceMode } }) as unknown as ProjectFoundationDraft;
const loader = <T,>(value: T) => ({ execute: vi.fn().mockResolvedValue(value) });

const build = (sourceMode: string, analyses: AnalysisStateReader, audit = loader({ issues: [] })) =>
	new ReadProjectHealthUseCase(
		loader(coherence),
		audit,
		{ get: vi.fn().mockResolvedValue({}) },
		loader(features),
		loader(foundation(sourceMode)),
		analyses
	);

describe('ReadProjectHealthUseCase', () => {
	it('names an analysis left open in a project read from its code', async () => {
		const read = vi.fn().mockResolvedValue({ started: true, finalized: false, untraced: 2 });
		const health = await build('code_to_spec', { read }).execute('p');
		expect(read).toHaveBeenCalledWith('f1');
		expect(health.headline.blocking).toBe(1);
		expect(health.points[0].title).toBe('Analysis not finalized: Slide the tiles');
	});

	it('never asks the engine for a project written in Lyriks', async () => {
		const read = vi.fn();
		const health = await build('greenfield', { read }).execute('p');
		expect(read).not.toHaveBeenCalled();
		expect(health.headline.score).toBe(100);
	});

	it('adds no point for a reading it cannot have', async () => {
		const read = vi.fn().mockRejectedValue(new Error('engine down'));
		const audit = { execute: vi.fn().mockRejectedValue(new Error('audit failed')) };
		const health = await build('code_to_spec', { read }, audit).execute('p');
		expect(health.points).toEqual([]);
	});
});
