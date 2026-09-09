import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // src/ee/tests exists only when the Enterprise overlay is linked in.
    include:     ['src/tests/**/*.test.ts', 'src/ee/tests/**/*.test.ts'],
    globals:     false,
    env: {
      JWT_SECRET:   'test-secret-for-vitest',
      API_BASE_URL: 'http://localhost:3000',
    },
  },
})
