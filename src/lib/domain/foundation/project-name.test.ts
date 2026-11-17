import { describe, expect, it } from 'vitest';
import { projectNameStyled, styledProjectName } from './project-name';

describe('every project name opens on a capital [criterion:5a72e9ef]', () => {
	it('gives the first letter its capital, always', () => {
		expect(styledProjectName('test')).toBe('Test');
		expect(styledProjectName('notepad')).toBe('Notepad');
		expect(styledProjectName('repro-500-bug')).toBe('Repro-500-bug');
		expect(styledProjectName('eBay clone')).toBe('EBay clone');
		expect(styledProjectName('iOS app')).toBe('IOS app');
		expect(styledProjectName('"quoted" name')).toBe('"Quoted" name');
		expect(styledProjectName('école numérique')).toBe('École numérique');
	});

	it('reads every other letter as typed', () => {
		expect(styledProjectName('NOTEPAD ubdubhdeubheube')).toBe('NOTEPAD ubdubhdeubheube');
		expect(styledProjectName('TETRIS')).toBe('TETRIS');
		expect(styledProjectName('BrightDesk')).toBe('BrightDesk');
		expect(styledProjectName('N8N Baby')).toBe('N8N Baby');
		expect(styledProjectName('Signal for iOS')).toBe('Signal for iOS');
		expect(styledProjectName('Frais+')).toBe('Frais+');
	});

	it('trims the name and folds its spaces, and leaves an empty name empty', () => {
		expect(styledProjectName('  hotfix   check ')).toBe('Hotfix check');
		expect(styledProjectName('   ')).toBe('');
	});
});

describe('a rename says the name it kept [criterion:60d1fbca]', () => {
	it('names the name sent, the name kept and the style when they differ', () => {
		expect(projectNameStyled('linkding', 'Linkding')).toEqual({
			sent: 'linkding',
			kept: 'Linkding',
			reason: expect.stringContaining('Every project name opens on a capital')
		});
	});

	it('says nothing when the name was taken as typed, or none was sent', () => {
		expect(projectNameStyled('Linkding', 'Linkding')).toBeNull();
		expect(projectNameStyled('  Linkding ', 'Linkding')).toBeNull();
		expect(projectNameStyled('TETRIS', 'TETRIS')).toBeNull();
		expect(projectNameStyled('   ', 'Linkding')).toBeNull();
	});
});
