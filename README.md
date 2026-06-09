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
5. Press `Tab` or use the menu to toggle a full-screen preview of the reference image.

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
| `Tab` | Toggle image preview |

## Settings

Open the menu (top left) and choose **Settings**.

| Setting | Options | Default |
|---|---|---|
| Zoom step | 1.05x to 2.00x | 1.25x |
| Piece quality | 1x, 2x, 4x, Auto | 4x |
| WASD distance | 20 px to 300 px | 80 px |
| Knob size | 40 to 128 | 116 |
| Piece style | Standard, Artsy | Standard |
| Piece spacing | 0 px to 32 px | 8 px |
| Progress | Off, %, Count, Count+Total | Count+Total |
| Show % | On, Off | Off |

Auto quality matches the image's native pixel density and is the right choice for most images. Lower settings speed up generation for very high piece counts.

Knob size is typed in as a number. The maximum of 128 is the point where the knobs reach the edge of the piece, so anything larger would be clipped. Changing it re-cuts the pieces straight away.

Piece spacing controls the gap between scattered pieces at the start of a puzzle. Changing it mid-puzzle reshuffles unlocked pieces; a confirmation appears if any piece has already been moved.

The progress counter is shown below the menu button and in the open menu. Count+Total displays the number of locked pieces and the total, e.g. `85/500`. Show % adds the percentage in parentheses, e.g. `85/500 (17%)`.

## Piece counts

Presets: 75, 150, 300, 400, 500, 1000. You can also type any number between 2 and 10 000. The grid size shown below the input is the actual number of pieces that will be cut.

## How the pieces are cut

The cutting logic lives in `src/pieces.ts`. A few notes on the design:

**Two passes.** `generatePieceLayout` does the maths first: the grid, each
piece's position, and the shape of its four edges, with no pixels touched. Then
`renderPiece` draws one piece at a time. Splitting it this way lets the drawing
run in small batches, so building a large puzzle does not freeze the page.

**Shared edges.** A `tabGrid` holds a random plus or minus one for every inner
grid line. A piece takes its edge from that grid; its neighbour takes the same
value with the sign flipped. So if one side bulges out, the other caves in by
the matching curve, and the whole image tiles. Outer edges are flat.

**One curve for all four sides.** An edge is drawn once in a local frame (`s`
along the edge, `o` outward) and placed onto the real side with a small
transform. The tab direction is just a sign on the outward part, so a hole is
the same curve as the knob, mirrored. That is why a knob always fits its hole.

**The knob shape.** Each tab is set by seven points: a base on each side, a
narrow waist low down, the two widest points of the bulb, and a rounded top.
The waist sits below the widest point, so the bulb overhangs the neck, which is
what makes pieces feel like they lock rather than just touch. The points are
joined with a Catmull-Rom spline (`smoothBeziers`), which runs a smooth line
through all of them and flattens out where the tab meets the straight edge.

## How the pieces are placed and shuffled

Once the shapes are known, `generatePieceLayout` decides where each piece starts
on the table. This happens in two independent steps: building the set of resting
spots, and deciding which piece goes in each one.

**Building the slots.** The four rectangles around the assembled image (above,
below, left, right) are treated as strips. Each strip is packed with a regular
grid of slots sized to one piece plus its padding, so pieces never overlap at
the start. For very high piece counts the strips grow beyond the visible stage,
which keeps the spacing even instead of cramming everything into a thin border.
Every slot also stores its distance from the puzzle area, and each strip is
sorted nearest first. Filling from the front of that order means the ring of
pieces closest to the image fills before the outer rows, which is the oval
look around the frame. Because distance also grows toward the corners, each
individual row fills from its centre outward.

**Keeping the scatter balanced.** A piece count rarely divides cleanly into full
rows, so the outermost ring is usually left part filled. Filling the strips
independently would empty all the pieces into one side first, leaving a full top
row and a nearly bare bottom one. To avoid that, every slot is paired with its
180 degree rotation about the puzzle centre, so the layout is point symmetric:
the top pairs with the bottom flipped left to right, and the left pairs with the
right flipped top to bottom. A unit holds both partners and they are always
placed together as one, ordered by distance. The fill stops before it would
overshoot into a half filled pair, so the chosen set is always fully symmetric.
When the pieces run out partway through the last ring, any spill is balanced
across the centre: a nub on the top-left is matched bottom-right, and a spill on
one side is matched on the far side, flipped top to bottom.

**Tidying the outer edge.** Filling by distance still leaves pieces stranded out
past the rest. After the units are chosen, a short cleanup pass looks for two
kinds of stray: a filled slot with fewer than two filled neighbours, counted
across all strips, which is a lone tip; and a slot on the outer front of a run
that is far shorter than the line just inside it, which is a nub sitting on top
of a full row. The second test is relative, comparing a run to its inner
neighbour, so a sharp two or three piece nub is caught while a gradual oval taper
is left alone. Each stray is moved inward to the nearest empty notch, an open
slot that already has two filled neighbours, so it plugs a gap in the edge
instead of poking out of it. The move is done a whole unit at a time, so the
point symmetry is preserved, and because every move trades a far slot for a
nearer one the pass cannot loop and settles in a few rounds.

**The odd piece.** When the piece count is odd, one slot has no rotation partner.
Rather than let it sit alone against a flat edge, it is dropped onto the open
slot that touches the most filled neighbours, breaking ties toward the nearest,
so it tucks into the end of a row. The result keeps the soft oval without lone
pieces on its rim.

**Decoupling order from position.** The slot list is fixed and always consumed
front to back, so the visible pattern never changes. What changes is which piece
lands in each slot. The pieces are built in grid order (row by row, column by
column), then an index array is shuffled with a Fisher-Yates shuffle before any
slot is assigned. Fisher-Yates walks the array from the end, swapping each entry
with a randomly chosen earlier one, which produces a uniform permutation in a
single linear pass with no bias toward any starting arrangement.

**Breaking the neighbour correlation.** The earlier version assigned slots in grid order, so piece
`(0,0)` took the nearest slot, `(1,0)` the next nearest, and so on. Because
adjacent slots in the sorted list sit physically close, grid neighbours kept
landing next to each other and the scatter looked only half mixed. Shuffling the
assignment breaks the correlation between a piece's place in the image and its
place on the table, so neighbouring pieces are spread across the whole layout
while the slot pattern itself stays identical. Any leftover pieces beyond the
last slot fall back to a random point on the stage.

## Tech stack

- React + TypeScript + Vite
- Konva.js

## License

[GNU General Public License v3.0](LICENSE)
