# SVGnester

A fast, browser-based SVG nesting tool for CNC routing, laser cutting, and plasma cutting. Automatically arranges parts on your sheet to minimize material waste — no install, no login.

## Features

- Genetic algorithm + Simulated Annealing optimization
- No-Fit Polygon (NFP) collision detection with IndexedDB caching
- Multi-sheet packing
- Grain direction alignment for wood/material grain
- Fill Empty Space mode for maximum utilization
- Pan & zoom preview with per-iteration live updates
- SVG export with sheet outlines

## Usage

1. Prepare a single SVG file containing both your **sheet** (the material boundary) and all your **parts** (shapes to cut) as separate closed paths
2. Drop the file into SVGnester
3. Click the sheet shape to select it
4. Configure settings and click **Start Nesting**
5. Download the result SVG when satisfied

## Development

```bash
npm install
npm run dev
```

Requires Node 18+.

## Tech Stack

- React 18 + TypeScript
- Vite + Web Workers
- styled-components
- clipper-lib (polygon offsetting)
- simplify-js (polygon simplification)

## Credits

SVGnester is inspired by and partially derived from
[SVGnest](https://github.com/Jack000/SVGnest) by Jack Qiao (MIT License).
The NFP geometry core, bezier linearization, and placement algorithm
build on that foundational work.

## License

MIT — see [LICENSE](./LICENSE)
