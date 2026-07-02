import type { ClientMessage, ServerMessage } from './protocol'
import { DEFAULT_PORT } from './protocol'

// The rest of the client talks to this interface, never to WebSocket
// directly. Internet play later is either the same server reached at a
// different address (no code change at all) or another implementation of
// this interface (e.g. WebRTC behind a signalling server).
export interface Transport {
  connect(address: string): Promise<void>
  send(msg: ClientMessage): void
  onMessage(cb: (msg: ServerMessage) => void): void
  onClose(cb: (reason: 'error' | 'closed') => void): void
  close(): void
}

// Accepts "192.168.1.23", "192.168.1.23:8421", "localhost", or a full
// ws:// url, and returns a complete WebSocket url.
export function normalizeAddress(input: string): string {
  let addr = input.trim()
  if (addr.startsWith('ws://') || addr.startsWith('wss://')) return addr
  if (!/:\d+$/.test(addr)) addr = `${addr}:${DEFAULT_PORT}`
  return `ws://${addr}`
}

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null
  private messageCb: ((msg: ServerMessage) => void) | null = null
  private closeCb: ((reason: 'error' | 'closed') => void) | null = null
  private closedByUs = false

  connect(address: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(normalizeAddress(address))
      this.ws = ws
      this.closedByUs = false
      let opened = false

      ws.onopen = () => {
        opened = true
        resolve()
      }
      ws.onmessage = e => {
        if (!this.messageCb) return
        let msg: ServerMessage
        try {
          msg = JSON.parse(e.data as string)
        } catch {
          return
        }
        if (msg && typeof msg.type === 'string') this.messageCb(msg)
      }
      ws.onerror = () => {
        if (!opened) reject(new Error('Could not connect'))
      }
      ws.onclose = () => {
        if (!opened) {
          reject(new Error('Could not connect'))
          return
        }
        if (!this.closedByUs && this.closeCb) this.closeCb('closed')
      }
    })
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  onMessage(cb: (msg: ServerMessage) => void) {
    this.messageCb = cb
  }

  onClose(cb: (reason: 'error' | 'closed') => void) {
    this.closeCb = cb
  }

  close() {
    this.closedByUs = true
    this.ws?.close()
    this.ws = null
  }
}
