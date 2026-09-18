import { describe, expect, it } from 'vitest'
import { createTestUser, deleteTestUser } from './setup/testClient'

describe('test harness smoke test', () => {
  it('can create, sign in as, and delete a disposable test user', async () => {
    const user = await createTestUser('REQUESTER')
    expect(user.id).toBeTruthy()

    const { data, error } = await user.client.auth.getSession()
    expect(error).toBeNull()
    expect(data.session?.user.id).toBe(user.id)

    await deleteTestUser(user.id)
  })
})
