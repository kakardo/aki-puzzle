// Wire format shared between the client and the server. The server mirrors
// the constants in plain JS (server/protocol.js); keep the two in sync by
// hand when the protocol changes, and bump PROTOCOL_VERSION on breaking
// changes so old clients get a clear error instead of silent weirdness.

export const PROTOCOL_VERSION = 3
export const DEFAULT_PORT = 8421

// Fixed palette, assigned first free slot by the server. Mirrored in
// server/protocol.js.
export const PLAYER_COLORS = [
  '#e6532d', '#2d9be6', '#3fbf6f', '#e6b32d',
  '#a05de6', '#e65d9e', '#2dd5c4', '#8a8f3c',
]

export type Groups = Record<string, string>

// The slice of a piece that travels over the wire. Everything else (canvas,
// tabs, display size) is derived locally from the seed.
export type NetPiece = { id: string; x: number; y: number; locked: boolean }

export type Player = { id: string; name: string; color: string }

// Everything a joiner needs to cut the identical puzzle. genWidth/genHeight
// is the host's window size at generation time: piece sizes and the layout
// origin are derived from it, so every client must use these values, not
// their own window.
export type PuzzleConfig = {
  imageDataUrl: string
  cols: number
  rows: number
  seed: number
  knobSize: number
  pieceStyle: string
  pieceSpacing: number
  edgeStyle: string
  genWidth: number
  genHeight: number
}

export type NetSession = {
  config: PuzzleConfig
  pieces: NetPiece[]
  groups: Groups
  heldGroups: Record<string, string> // groupId -> playerId, drags in flight
}

export type ClientMessage =
  | { type: 'join'; protocolVersion: number; name: string; code?: string }
  | { type: 'create_session'; config: PuzzleConfig; pieces: NetPiece[]; groups: Groups }
  | { type: 'grab'; pieceId: string }
  | { type: 'drag'; pieceId: string; x: number; y: number }
  | { type: 'drop'; pieceId: string; pieces: NetPiece[]; groups: Groups }
  | { type: 'release'; pieceId: string }
  | { type: 'ping'; x: number; y: number }
  | { type: 'request_sync' }

export type ServerMessage =
  | { type: 'welcome'; playerId: string; color: string; players: Player[]; session: NetSession | null; lanAddresses: string[] }
  | { type: 'session_created'; session: NetSession }
  | { type: 'player_joined'; player: Player }
  | { type: 'player_left'; playerId: string }
  | { type: 'grab_granted'; pieceId: string }
  | { type: 'grab_denied'; pieceId: string; heldBy: string }
  | { type: 'piece_grabbed'; playerId: string; pieceId: string; groupPieceIds: string[] }
  | { type: 'piece_dragged'; playerId: string; pieceId: string; x: number; y: number }
  | { type: 'piece_dropped'; playerId: string; pieces: NetPiece[]; groups: Groups }
  | { type: 'piece_released'; playerId: string; pieceId: string }
  | { type: 'player_pinged'; playerId: string; x: number; y: number }
  | { type: 'error'; code: string; message: string }
