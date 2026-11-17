import { afterEach, describe, expect, it } from 'vitest'
import type { LyriksClient } from '../lyriks-client.js'
import { proveProjectRulesHandler, whatIfProjectHandler } from '../tools/behavior.js'

// The oracle's two questions about a project's rules reach the platform as
// asked, and every rule comes back with the link a person opens on it.
describe('the oracle on the project rules', () => {
  const before = process.env.PUBLIC_BASE_URL
  afterEach(() => {
    process.env.PUBLIC_BASE_URL = before
  })

  it('asks for the named rules and makes each rule link whole', async () => {
    process.env.PUBLIC_BASE_URL = 'https://studio.example'
    const asked: string[] = []
    const lyriks = {
      get: async (path: string) => {
        asked.push(path)
        return { ok: true, rules: [{ invariantId: 'pi-1', verdict: 'broken', href: '/projects/shop/infrastructure?tab=model&view=rules&rule=choice%3Af1' }] }
      },
    } as unknown as LyriksClient
    const answer = (await proveProjectRulesHandler({ project_id: 'shop', invariant_ids: ['pi-1', 'pi-2'], max_steps: 4 }, lyriks)) as {
      rules: { href: string }[]
    }
    expect(asked).toEqual(['/api/behavior/project/rules?projectId=shop&invariantId=pi-1&invariantId=pi-2&maxSteps=4'])
    expect(answer.rules[0]!.href).toBe('https://studio.example/projects/shop/infrastructure?tab=model&view=rules&rule=choice%3Af1')
  })

  it('sends a change to the rules as a what-if and saves nothing', async () => {
    process.env.PUBLIC_BASE_URL = 'https://studio.example'
    const posted: { path: string; body: unknown }[] = []
    const lyriks = {
      post: async (path: string, body: unknown) => {
        posted.push({ path, body })
        return { persisted: false, rules: [{ href: '/projects/shop/features?tab=rules' }] }
      },
    } as unknown as LyriksClient
    const operations = [{ kind: 'remove_project_invariant', invariantId: 'pi-1' }]
    const answer = (await whatIfProjectHandler({ project_id: 'shop', operations }, lyriks)) as { rules: { href: string }[] }
    expect(posted).toEqual([{ path: '/api/behavior/project/what-if', body: { projectId: 'shop', operations } }])
    expect(answer.rules[0]!.href).toBe('https://studio.example/projects/shop/features?tab=rules')
  })
})
