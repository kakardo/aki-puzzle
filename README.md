# ZenPiece

A jigsaw puzzle app with a calm, minimal feel. Upload any image, cut it into pieces, and assemble it at your own pace. Built to be played solo or together with friends online.

---

## What it does

- Upload any image and have it automatically cut into jigsaw pieces
- Drag and drop pieces to assemble the puzzle
- Play together with friends in real time (coming soon)

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
- [ ] Image upload
- [ ] Automatic piece generation with tab and blank connectors
- [ ] Drag, rotate, and snap pieces into place
- [ ] Puzzle completion detection

### Phase 2 - Multiplayer
- [ ] Shared puzzle rooms via a link
- [ ] Real-time piece movement synced across players
- [ ] Player presence (see who is active)

## License

ZenPiece is free software, released under the [GNU General Public License v3.0](LICENSE).
