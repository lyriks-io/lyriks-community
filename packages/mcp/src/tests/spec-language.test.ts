import { describe, expect, it } from 'vitest'
import type { LyriksClient } from '../lyriks-client.js'
import { withSpecLanguage } from '../tools/spec-language.js'
import { readBehaviorFeatureHandler } from '../tools/behavior.js'

const reading = { language: 'fr', declared: true, generated: 'fr', notice: null }

const client = (answers: Record<string, unknown>): LyriksClient =>
  ({
    get: async (path: string) => {
      if (path in answers) return answers[path]
      throw new Error(`404 ${path}`)
    },
  }) as unknown as LyriksClient

describe('withSpecLanguage', () => {
  it('puts the language of the project the answer names beside it', async () => {
    const lyriks = client({ '/api/projects/big-island/language': reading })
    const asked = '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
    const answer = await withSpecLanguage({ id: asked, kernel_project_id: 'big-island' }, lyriks, asked)
    expect(answer).toMatchObject({ kernel_project_id: 'big-island', specLanguage: reading })
  })

  it('asks the platform with the slug when the project was asked by its slug', async () => {
    const lyriks = client({ '/api/projects/big-island/language': reading })
    const answer = await withSpecLanguage({ projectId: 'uuid-free', summary: {} }, lyriks, 'big-island')
    expect(answer).toMatchObject({ specLanguage: reading })
  })

  it('follows the link a summary of a back project carries', async () => {
    const lyriks = client({ '/api/projects/big-island/language': reading })
    const asked = '0b6f2c1e-8d4a-4c3b-9e2f-1a2b3c4d5e6f'
    const answer = await withSpecLanguage(
      { projectId: asked, kernel_project_id: 'big-island', source_project_id: null, summary: {} },
      lyriks,
      asked,
    )
    expect(answer).toMatchObject({ specLanguage: reading })
  })

  it('leaves the answer as it is when the platform does not know the language', async () => {
    const answer = await withSpecLanguage({ id: 'p' }, client({}), 'p')
    expect(answer).toEqual({ id: 'p' })
  })
})

describe('get_behavior_feature carries the language of the spec', () => {
  const feature = { id: 'feat-a', name: 'A', surfaces: [{ id: 's1', name: 'S', actions: [{ id: 'a1', name: 'Go', rules: [] }] }] }
  const lyriks = {
    get: async () => ({ snapshot: { feature }, statements: {}, specLanguage: reading }),
  } as unknown as LyriksClient

  it('in the table of contents, one element and the index keys', async () => {
    for (const args of [{ summary: true }, { action_id: 'a1' }, { index_keys: true }, { paths: ['snapshot.feature.name'] }]) {
      const answer = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-a', ...args }, lyriks)
      expect(answer).toMatchObject({ specLanguage: reading })
    }
  })
})
