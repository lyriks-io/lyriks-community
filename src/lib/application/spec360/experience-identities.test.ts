import { describe, expect, it } from 'vitest';
import { createEmptyExperienceDraft, createJourney, createStep } from '$domain/experience';
import { experienceView } from './experience';

describe('Experience reads unique stored identities [criterion:3d3a5e99]', () => {
 it('reads a repeated journey and step id once without rewriting the authored records', () => {
  const draft = createEmptyExperienceDraft('p');
  const journey = createJourney('core', 0, { id: 'j', name: 'Checkout' });
  const step = createStep('j', 0, { id: 's', name: 'Pay' });
  draft.journeys = [journey, structuredClone(journey)];
  draft.steps = [step, structuredClone(step)];
  const before = structuredClone(draft);
  expect(experienceView(draft).journeys).toEqual([{ id: 'j', name: 'Checkout', description: '', steps: ['Pay'] }]);
  expect(draft).toEqual(before);
 });
 it('keeps distinct paths and steps even when their visible names are identical', () => {
  const draft = createEmptyExperienceDraft('p');
  draft.journeys = [createJourney('core', 0, { id: 'j1', name: 'Checkout' }), createJourney('core', 1, { id: 'j2', name: 'Checkout' })];
  draft.steps = [createStep('j1', 0, { id: 's1', name: 'Confirm' }), createStep('j1', 1, { id: 's2', name: 'Confirm' }), createStep('j2', 0, { id: 's3', name: 'Choose a different route' })];
  expect(experienceView(draft).journeys.map(j => [j.id, j.steps])).toEqual([['j1', ['Confirm', 'Confirm']], ['j2', ['Choose a different route']]]);
 });
});
