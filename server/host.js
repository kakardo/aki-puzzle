// ZenPiece host launcher. Serves the built app and the multiplayer server on
// one port, tries to open that port on the router with UPnP, and prints a
// link to share. Everyone (host included) plays in a browser; joiners install
// nothing. Run with: npm run host
//
// If UPnP is unavailable it falls back to printing the one port-forward rule
// to add by hand. Over the internet this needs a real public IP from your
// provider; some connections are behind carrier-grade NAT where no port
// forwarding works.

import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PORT } from './protocol.js'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Vite writes a vite.config.*.timestamp-*.mjs temp next to the config while it
// bundles it, and normally deletes it. A build cut short can leave one behind.
// The build always finishes before we get here, so sweep up any strays now to
// keep the project root clean.
function cleanViteTemps() {
  try {
    for (const name of fs.readdirSync(rootDir)) {
      if (/^vite\.config\..*\.timestamp-.*\.mjs$/.test(name)) {
        try { fs.unlinkSync(path.join(rootDir, name)) } catch {}
      }
    }
  } catch {}
}

const PORT = Number(process.env.PORT) || DEFAULT_PORT
// A short numeric code so a stranger who stumbles onto the open port cannot
// drop into your game. It travels in the share link as ?code=... so friends
// never have to type it.
const CODE = process.env.ZENPIECE_ROOM_CODE || String(Math.floor(1000 + Math.random() * 9000))

process.env.PORT = String(PORT)
process.env.ZENPIECE_ROOM_CODE = CODE

function lanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return null
}

async function openPort() {
  try {
    const mod = await import('nat-upnp')
    const createClient = (mod.default ?? mod).createClient
    const client = createClient()
    await new Promise((resolve, reject) => {
      client.portMapping({ public: PORT, private: PORT, ttl: 0, description: 'ZenPiece' }, err => (err ? reject(err) : resolve()))
    })
    const ip = await new Promise((resolve, reject) => {
      client.externalIp((err, addr) => (err ? reject(err) : resolve(addr)))
    })
    try { client.close() } catch {}
    return { ok: true, ip }
  } catch {
    return { ok: false }
  }
}

// Tidy any leftover Vite config temp files before starting.
cleanViteTemps()

// Start the combined server. It reads PORT and ZENPIECE_ROOM_CODE from the
// environment set above.
await import('./index.js')

const lan = lanIp()
const upnp = await openPort()

const line = '======================================================'
console.log('')
console.log(line)
console.log(' ZenPiece is hosting')
console.log(line)
console.log(` Room code: ${CODE}`)
if (lan) console.log(` Same Wi-Fi:        http://${lan}:${PORT}/?code=${CODE}`)
if (upnp.ok && upnp.ip) {
  console.log(` Over the internet: http://${upnp.ip}:${PORT}/?code=${CODE}`)
  console.log('')
  console.log(' Share the internet link. Your friend just opens it in a browser.')
} else {
  console.log('')
  console.log(' Could not open the port automatically (UPnP is off or unsupported).')
  console.log(` To play over the internet, forward external port ${PORT} to this`)
  console.log(` computer${lan ? ` (${lan}:${PORT})` : ''} in your router settings, then share:`)
  console.log(`   http://YOUR_PUBLIC_IP:${PORT}/?code=${CODE}`)
  console.log(' Find YOUR_PUBLIC_IP by searching "what is my ip" in a browser.')
}
console.log(line)
console.log(' Keep this window open while you play. Close it to end the session.')
console.log('')
