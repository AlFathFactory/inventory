import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function buildVersionPlugin(buildId: string): Plugin {
  const source = `${JSON.stringify({ buildId })}\n`
  return {
    name: 'inventory-build-version',
    configureServer(server) {
      server.middlewares.use('/version.json', (_request, response) => {
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store, max-age=0')
        response.end(source)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source })
    },
  }
}

export default defineConfig(() => {
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.GITHUB_SHA
    ?? `local-${Date.now()}`
  return {
    define: { __BUILD_ID__: JSON.stringify(buildId) },
    plugins: [react(), tailwindcss(), buildVersionPlugin(buildId)],
  }
})
