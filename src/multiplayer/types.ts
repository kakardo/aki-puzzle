import type { Groups, NetPiece } from './protocol'

// Callbacks PuzzleBoard registers with the hook. Incoming high-frequency
// events (piece_dragged) are dispatched straight to these without touching
// React state; the board applies them imperatively to Konva nodes.
export type RemoteHandlers = {
  onRemoteGrab(playerId: string, color: string, groupPieceIds: string[]): void
  onRemoteDrag(pieceId: string, x: number, y: number): void
  onRemoteDrop(pieces: NetPiece[], groups: Groups): void
  onRemoteRelease(pieceId: string): void
  onPlayerLeft(playerId: string): void
  onGrabDenied(pieceId: string): void
}

// Outgoing calls the board makes during the drag lifecycle. All of them are
// no-ops while not connected, so the board calls them unconditionally.
export type MultiplayerSendApi = {
  sendGrab(pieceId: string): void
  sendDrag(pieceId: string, x: number, y: number): void
  sendDrop(pieceId: string, pieces: NetPiece[], groups: Groups): void
  sendRelease(pieceId: string): void
}

// Everything PuzzleBoard needs for a multiplayer session, bundled into one
// optional prop so solo play passes nothing at all.
export type BoardMultiplayer = {
  role: 'host' | 'guest'
  seed: number
  // Generation viewport. Guests must lay out with the host's dimensions so
  // world coordinates match; the host passes null and reports its own size
  // back through onGenerated.
  genWidth: number | null
  genHeight: number | null
  // Snapshot to apply after generation (guests and rejoins); null for a
  // fresh host board.
  initialPieces: NetPiece[] | null
  initialGroups: Groups
  initialHeld: Record<string, { playerId: string; color: string }> // pieceId keyed
  api: MultiplayerSendApi
  setRemoteHandlers(h: RemoteHandlers | null): void
  // Lets the hook snapshot the live board, used by the host to restore the
  // session after a server restart.
  setBoardStateProvider(fn: (() => { pieces: NetPiece[]; groups: Groups }) | null): void
  // Host only: fired once the board has generated and scattered the pieces.
  onGenerated?: (pieces: NetPiece[], genWidth: number, genHeight: number) => void
}
