import { expect, it, vi } from 'vitest'
import { getCapabilitiesHandler } from '../tools/capabilities.js'
import type { LyriksClient } from '../lyriks-client.js'

it('keeps canonical permission ids, sources and verbs while filtering before paging', async () => {
  const get = vi.fn().mockResolvedValue({ capabilities: [
    { capabilityId: 'feature-editor', capabilitySource: 'feature', label: 'Edit', actions: ['view'] },
    { capabilityId: 'screen:editor', capabilitySource: 'surface', label: 'Editor', actions: ['view', 'update'] },
  ] })
  const result = await getCapabilitiesHandler({ project_id: 'p', query: 'EDITOR', source: 'surface', limit: 1 }, { get } as unknown as LyriksClient)
  expect(result).toMatchObject({ total: 1, nextOffset: null, capabilities: [{ capabilityId: 'screen:editor', capabilitySource: 'surface', actions: ['view', 'update'] }] })
  expect(get).toHaveBeenCalledWith('/api/draft/users/capabilities?projectId=p')
})
