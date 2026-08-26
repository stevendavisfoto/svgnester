# SVGnester

**Free, browser-based SVG nesting for CNC routing, laser cutting, and plasma cutting.**

SVGnester automatically arranges cut parts on your sheet material to minimize waste. It runs entirely in your browser — no install, no login, no data leaves your machine.

🔗 **[svgnester.com](https://www.svgnester.com)**

---

## What is nesting?

Nesting is the process of fitting as many cut parts as possible onto a sheet of material, leaving the least amount of scrap. It's a classic combinatorial optimization problem — the number of possible arrangements grows astronomically with part count, so SVGnester uses a genetic algorithm to search the space efficiently and improve placement with every iteration.

---

## How to use it

### 1. Prepare your SVG file

SVGnester expects a **single SVG file** that contains:

- **One sheet shape** — the boundary of your material (a rectangle, or any closed path)
- **All the parts** you want to cut — each as a separate closed path or shape

Most design tools (Inkscape, Illustrator, Fusion 360, etc.) can export multiple shapes to a single SVG. Make sure every shape is a **closed outline** — open paths, strokes without fills, text, and raster images are not supported.

### 2. Load the file

Drag and drop your SVG onto the app, or click the drop zone to browse.

### 3. Select your sheet

Click the shape in the preview that represents your sheet material. It will be highlighted and set as the bin. All other shapes become the parts to nest.

> **Tip:** The curve tolerance setting affects how accurately curved paths are approximated. Increase it if loading a complex SVG is slow.

### 4. Configure settings

| Setting             | Description                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Units**           | Switch between inches and millimeters. Affects display and defaults.                                                                  |
| **Curve tolerance** | How closely bezier curves are approximated (lower = more accurate, slower). Default 0.15 in / 1 mm.                                   |
| **Part gap**        | Minimum clearance between any two parts, edge to edge. Set to your tool's kerf width for laser cutting, or bit offset for CNC/plasma. |
| **Perimeter gap**   | Inset from the sheet edge — keeps parts away from the material boundary.                                                              |
| **Rotations**       | Number of rotation steps to try (e.g. 4 = 0°, 90°, 180°, 270°). More steps = better packing, slower iterations.                       |
| **Allow mirroring** | Let parts be flipped horizontally when that packs better.                                                                             |
| **Pack toward**     | Corner of the sheet that parts are packed toward (BL, BR, TL, TR).                                                                    |
| **Grain direction** | Constrain part orientation to horizontal or vertical, for materials with grain (wood, fabric, brushed metal).                         |
| **Grain tolerance** | How many degrees a part may deviate from the grain axis.                                                                              |
| **Explore concave** | Find placements tucked into concave notches. Improves density for L-shapes, crescents, etc. — at the cost of slower iterations.       |
| **Use holes**       | Allow parts to be placed inside holes in other parts.                                                                                 |
| **Quality**         | Fast / Balanced / Best — controls population size and mutation rate of the genetic algorithm.                                         |

### 5. Start nesting

Click **Start Nesting**. The preview updates live after each iteration as better placements are found. Let it run for **2–5 minutes** for most jobs — results comparable to commercial software.

Watch the stats panel:

- **Iterations** — generations of the genetic algorithm completed
- **Elapsed** — wall-clock time since the run started
- **Sheet utilization** — percentage of sheet area covered by parts
- **Parts placed** — how many of your parts fit in the current best arrangement
- **Sheets used** — how many copies of the sheet are needed

### 6. Fill empty space (optional)

After the main run has produced a good layout, click **Fill Empty Space**. This runs a separate iterative pass that greedily adds extra copies of your parts into any remaining open space across all sheets — one of each shape type per round — continuing until no more copies fit. Useful for maximizing offcut utilization.

### 7. Download

Click **Download SVG** to export the result. The output SVG contains all sheets with parts positioned and labeled, ready to send to your CAM software or cutting machine.

---

## Settings tips

**For laser cutting:**

- Set Part Gap to your laser's kerf width (typically 0.1–0.3 mm)
- Leave Perimeter Gap at 0 unless your machine needs edge clearance
- 4 rotations is usually sufficient for symmetric parts; use more for organic shapes

**For CNC routing:**

- Set Part Gap to your bit's diameter (or half-diameter if you prefer)
- Use Perimeter Gap to keep parts away from clamping areas
- Enable Grain Direction for wood parts to align grain correctly

**For plasma cutting:**

- Set Part Gap to your kerf + torch-to-material offset
- Higher Rotations (e.g. 8 or 16) often improve density for irregular shapes

**For best packing density:**

- Start with Quality = Balanced, run for a few minutes
- Enable Explore Concave if you have L-shapes or concave profiles
- Run Fill Empty Space after the main run to recover scrap-sized gaps

---

## Algorithm overview

SVGnester uses a **genetic algorithm** layered over **No-Fit Polygon (NFP)** collision detection:

1. **NFP computation** — For each pair of parts (and each rotation/mirror combination), SVGnester pre-computes the No-Fit Polygon: the set of all positions where part B, if placed relative to part A, would touch or overlap. This is the mathematically exact boundary of collision-free placement. NFPs are cached in **IndexedDB** so repeated runs with the same shapes are instant.

2. **First-Fit Decreasing** — Parts are sorted largest-first before placement. Larger parts constrain the layout more heavily; smaller parts then act like sand, filling the gaps left behind.

3. **Genetic Algorithm** — A population of candidate orderings is evolved across generations. Each individual represents a permutation of parts + rotation assignments. The fitness function is the total sheet area consumed by the placement. The algorithm keeps the best individuals, mutates others, and evaluates the population in parallel Web Workers.

4. **Simulated Annealing** — After each generation's placement, SA fine-tunes individual part positions to squeeze out additional utilization.

5. **Fill-in pass** — A separate greedy pass attempts to fit extra copies of each part type into remaining open space on any sheet, cycling through shape types to distribute copies evenly.

---

## Performance features

| Feature                     | What it does                                                                      |
| --------------------------- | --------------------------------------------------------------------------------- |
| **Web Workers**             | NFP computation and placement run off the main thread — the UI stays responsive   |
| **IndexedDB NFP cache**     | Expensive NFP results are persisted to disk; same shapes = instant restart        |
| **SharedArrayBuffer (SAB)** | Zero-copy data sharing between workers when COOP/COEP headers are present         |
| **WebGPU**                  | GPU-accelerated placement scoring when available in the browser                   |
| **Parse Worker**            | SVG tessellation runs in a dedicated worker to prevent UI freeze on complex files |

The stats panel shows which of these are active (✓ / ✗) in your browser.

---

## Browser compatibility

SVGnester runs in any modern browser. For best performance:

- **Chrome / Edge 113+** — full WebGPU + SAB support
- **Firefox 115+** — SAB support, no WebGPU
- **Safari 17+** — SAB support, WebGPU in development

The app degrades gracefully — missing WebGPU or SAB just means slightly slower iterations.

> **Note:** SVGnester is not optimized for mobile browsers. The interface requires a mouse or trackpad for pan/zoom and shape selection.

---

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/stevendavisfoto/svgnester.git
cd svgnester
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Build

```bash
npm run build
```

Output goes to `dist/`. Deploy that directory to any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

### Project structure

```
src/
├── App.tsx                   # Root component, state, engine wiring
├── core/
│   ├── nest-engine.ts        # GA/SA orchestration, worker pool
│   ├── svg-parser.ts         # SVG → NestPolygon (split main/worker)
│   ├── geometry.ts           # NFP math, bezier/arc linearization
│   └── nfp-worker-pool.ts    # NFP computation worker pool
├── workers/
│   ├── nfp.worker.ts         # NFP computation (one pair per message)
│   ├── placement.worker.ts   # Placement + fill-in pass
│   └── parse.worker.ts       # SVG tessellation (off main thread)
├── components/
│   ├── Controls/             # Settings sidebar
│   ├── SvgCanvas/            # Preview area with pan/zoom
│   ├── Stats/                # Stats bar
│   └── FileUpload/           # Drop zone
├── types/
│   └── index.ts              # NestConfig, NestPolygon, worker types
└── theme/
    └── colors.ts             # Design token definitions
```

### Tech stack

| Library               | Purpose                                 |
| --------------------- | --------------------------------------- |
| React 18 + TypeScript | UI framework                            |
| Vite                  | Build tool + worker bundling            |
| styled-components     | Component styles + theming              |
| clipper-lib           | Polygon offsetting (kerf/gap expansion) |
| simplify-js           | Polygon vertex reduction                |
| @phosphor-icons/react | Icons                                   |

---

## File format notes

**Input:** Any valid SVG containing closed `<path>`, `<rect>`, `<circle>`, `<ellipse>`, or `<polygon>` elements. Groups and nested transforms are supported. Maximum 500 elements; very complex paths are downsampled.

**Output:** An SVG with all sheets laid out side by side, each containing the nested parts at their final positions and rotations, with sheet outlines. Part labels identify each shape. Suitable for import into any CAM software.

---

## Credits

SVGnester is inspired by and substantially derived from [SVGnest](https://github.com/Jack000/SVGnest) by Jack Qiao (MIT License). The No-Fit Polygon geometry core, bezier and arc linearization routines, and the genetic algorithm placement strategy all build on that foundational work. Many thanks to Jack for open-sourcing the original.

---

## License

MIT — see [LICENSE](./LICENSE)
