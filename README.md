# ZenPiece

A jigsaw puzzle app with a calm, minimal feel. Upload any image, cut it into pieces, and assemble it at your own pace. Built to be played solo or together with friends online.

---

## What it does

- Upload any image and have it automatically cut into jigsaw pieces
- Choose how many pieces (4 to 500)
- Drag pieces onto the board — they snap into place when close enough
- Pieces that share an edge lock together and move as a group
- Zoom in to work on detail, pan around the board freely
- Adjust zoom speed and piece quality in Settings

## Controls

| Input | Action |
|---|---|
| Drag piece | Move piece or group |
| Drag background | Pan |
| Scroll wheel | Zoom to cursor |
| Q | Zoom out |
| E | Zoom in |
| R | Reset zoom |

## Settings

| Setting | Options | Default |
|---|---|---|
| Zoom step | 1.05× to 2.00× | 1.25× |
| Piece quality | Normal (1×), Sharp (2×), Auto | Auto |

Piece quality controls the canvas resolution pieces are rendered at. Auto matches the image's native pixel density, giving the sharpest possible result without wasting memory.

## Vision

ZenPiece is built around one idea: puzzles should be relaxing. No timers by default, no pressure. Just you, an image you love, and the satisfying click of pieces falling into place.

The multiplayer goal is to let you share a puzzle room with friends so you can work on the same board together, wherever you are.

## Tech stack

- **Frontend:** React + TypeScript + Vite
- **Canvas / interaction:** Konva.js
- **Multiplayer (planned):** Node.js + Socket.io

## Getting started

```bash
npm install
npm run dev
```

## Roadmap

### Phase 1 - Single player
- [x] Image upload
- [x] Automatic piece generation with tab and blank connectors
- [x] Drag and snap pieces into place
- [x] Group locking when adjacent pieces connect
- [x] Puzzle completion detection
- [x] Zoom and pan
- [x] Piece quality setting
- [ ] Piece rotation

### Phase 2 - Multiplayer
- [ ] Shared puzzle rooms via a link
- [ ] Real-time piece movement synced across players
- [ ] Player presence (see who is active)

## License

ZenPiece is free software, released under the [GNU General Public License v3.0](LICENSE).
