import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev only: remind that the dev server does not host multiplayer games, and
// point at the host program. Runs on serve, never on build.
function multiplayerNote() {
  return {
    name: 'zenpiece-multiplayer-note',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          console.log('\n  This dev server is for development only and does not host games.')
          console.log('  For multiplayer, run "npm run host" and open the link it prints.\n')
        }, 120)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), multiplayerNote()],
})
