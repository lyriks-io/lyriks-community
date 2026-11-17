import { describe, expect, it } from 'vitest';
import { assemblePortfolio, type ProjectCard } from './index';
import { droppedOrder, inFolderOrder, isEmptyProject, projectFolders, UNFILED_FOLDER_NAME } from './project-folders';

function card(id: string, domainId: string | null, over: Partial<ProjectCard> = {}): ProjectCard {
	return {
		id,
		name: id.toUpperCase(),
		description: '',
		domainId,
		stage: 'ideation',
		coverageScore: 0,
		maturityScore: 0,
		readinessScore: 0,
		coherenceScore: 100,
		openIncoherences: 0,
		featureCount: 0,
		evolutionsInProgress: 0,
		lastSavedAt: null,
		sourceMode: null,
		...over
	};
}

const domain = (id: string, name: string, position: number | null = null) => ({ id, name, description: '', icon: '', createdAt: '', position });

describe('project folders', () => {
	it('reads each domain as a folder, from A to Z, and gathers unfiled projects last [criterion:4b3d2b4d]', () => {
		const view = assemblePortfolio(
			[domain('fin', 'Finance apps'), domain('arch', 'Archive')],
			[card('fac', 'fin', { featureCount: 12, stage: 'spec_in_progress' }), card('loose', null)]
		);
		expect(projectFolders(view)).toEqual([
			{ id: 'arch', name: 'Archive', position: null, projects: [] },
			{ id: 'fin', name: 'Finance apps', position: null, projects: [{ id: 'fac', name: 'FAC', featureCount: 12, empty: false }] },
			{ id: null, name: UNFILED_FOLDER_NAME, position: null, projects: [{ id: 'loose', name: 'LOOSE', featureCount: 0, empty: true }] }
		]);
	});

	it('reads the folders in the order they were dragged into, those nobody placed A to Z after them, No folder last [criterion:ddf5cc35]', () => {
		const view = assemblePortfolio(
			[domain('ops', 'Ops', 1), domain('arch', 'Archive'), domain('sales', 'Sales', 0), domain('beta', 'Beta')],
			[card('loose', null), card('z', 'sales'), card('a', 'sales')]
		);
		expect(projectFolders(view).map((f) => `${f.name}:${f.projects.map((p) => p.id).join(',')}`)).toEqual(['Sales:a,z', 'Ops:', 'Archive:', 'Beta:', 'No folder:loose']);
	});

	it('keeps No folder last and reads two folders at the same place A to Z', () => {
		const folders = [
			{ id: null, name: UNFILED_FOLDER_NAME, position: 0 },
			{ id: 'b', name: 'Beta', position: 0 },
			{ id: 'a', name: 'Alpha', position: 0 }
		];
		expect(inFolderOrder(folders).map((f) => f.id)).toEqual(['a', 'b', null]);
	});

	it('saves every folder top to bottom once one is dropped, and nothing for a drop outside the list [action:5ccc378f] [rule:a20195a8]', () => {
		const shown = [{ id: 'eng' }, { id: 'ops' }, { id: 'sales' }, { id: null }];
		// Sales dropped at the top: Engineering and Ops close up under it; No folder is never saved and never moves.
		expect(droppedOrder(shown, 'sales', 0)).toEqual(['sales', 'eng', 'ops']);
		expect(droppedOrder(shown, 'eng', 2)).toEqual(['ops', 'sales', 'eng']);
		expect(droppedOrder(shown, 'eng', 3)).toBeNull();
		expect(droppedOrder(shown, 'eng', -1)).toBeNull();
		expect(droppedOrder(shown, 'eng', 0)).toBeNull();
		expect(droppedOrder(shown, 'gone', 0)).toBeNull();
	});

	it('has no unfiled folder when every project is filed', () => {
		const view = assemblePortfolio([domain('fin', 'Finance')], [card('fac', 'fin')]);
		expect(projectFolders(view).map((f) => f.id)).toEqual(['fin']);
	});

	it('counts a project as empty only while nothing was written in it', () => {
		expect(isEmptyProject(card('a', null))).toBe(true);
		expect(isEmptyProject(card('a', null, { featureCount: 1 }))).toBe(false);
		expect(isEmptyProject(card('a', null, { evolutionsInProgress: 1 }))).toBe(false);
		expect(isEmptyProject(card('a', null, { stage: 'spec_in_progress' }))).toBe(false);
	});
});
