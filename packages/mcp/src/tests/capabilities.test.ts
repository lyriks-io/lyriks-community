import { expect, it, vi } from 'vitest'
import { getCapabilitiesHandler } from '../tools/capabilities.js'
import type { LyriksClient } from '../lyriks-client.js'

it('keeps canonical permission ids and sources while filtering before paging', async () => {
  const get = vi.fn().mockResolvedValue({ capabilities: [
    { capabilityId: 'feature-editor', capabilitySource: 'feature', label: 'Edit' },
    { capabilityId: 'screen:editor', capabilitySource: 'surface', label: 'Editor' },
  ] })
  const result = await getCapabilitiesHandler({ project_id: 'p', query: 'EDITOR', source: 'surface', limit: 1 }, { get } as unknown as LyriksClient)
  expect(result).toMatchObject({ total: 1, nextOffset: null, capabilities: [{ capabilityId: 'screen:editor', capabilitySource: 'surface', label: 'Editor' }] })
  expect(get).toHaveBeenCalledWith('/api/draft/users/capabilities?projectId=p')
})

it('finds a capability by its id or by its label', async () => {
  const get = vi.fn().mockResolvedValue({ capabilities: [
    { capabilityId: 'action:feat-members:invite', capabilitySource: 'feature', label: 'Add a colleague' },
    { capabilityId: 'surface:settings', capabilitySource: 'surface', label: 'Invite people' },
    { capabilityId: 'feature:billing', capabilitySource: 'feature', label: 'Billing' },
  ] })
  const result = (await getCapabilitiesHandler({ project_id: 'p', query: 'invite' }, { get } as unknown as LyriksClient)) as { capabilities: Array<{ capabilityId: string }> }
  expect(result.capabilities.map((c) => c.capabilityId)).toEqual(['action:feat-members:invite', 'surface:settings'])
})
