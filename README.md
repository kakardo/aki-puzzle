# ZenPiece

Upload a photo, cut it into jigsaw pieces, and solve it in the browser.

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## How it works

1. Click **Choose picture** and pick an image.
2. Set how many pieces you want, then click **Start puzzling**.
3. Zoom in to work on the puzzle. Pieces snap together when you get them close enough.
4. Pieces that connect lock into a group and move together from that point on.

Your image and settings are saved between sessions.

## Controls

| Input | Action |
|---|---|
| Drag piece | Move piece or group |
| Drag background | Pan |
| Scroll wheel | Zoom to cursor |
| `Q` | Zoom out |
| `E` | Zoom in |
| `R` | Reset zoom |
| `W` `A` `S` `D` | Pan |

## Settings

Open the menu (top left) and choose **Settings**.

| Setting | Options | Default |
|---|---|---|
| Zoom step | 1.05x to 2.00x | 1.25x |
| Piece quality | Normal (1x), Sharp (2x), Auto | Auto |
| WASD distance | 20 px to 300 px | 80 px |

Auto quality matches the image's native pixel density and is the right choice for most images. Lower settings speed up generation for very high piece counts.

## Piece counts

Presets: 75, 150, 300, 400, 500, 1000. You can also type any number between 2 and 10 000. The grid size shown below the input is the actual number of pieces that will be cut.

## Tech stack

- React + TypeScript + Vite
- Konva.js

## License

[GNU General Public License v3.0](LICENSE)
