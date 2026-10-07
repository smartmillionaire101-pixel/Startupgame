# Wave 9: Real cities and real homes, in 3D

## Player feedback after Wave 8

The player compared the game with a real aerial photograph of San Francisco and with another life-sim's 3D house.

- The UI still looks like block houses, and it does not feel like an actual city.
- Buildings must look like real buildings, not blocks. That applies to every city.
- The inside of a house or building should look like the reference: a real 3D home seen from above, with walls, floors, furniture, lights and a garage.

## What the reference photo has that we lack

1. **Every building.** Today we draw 6,000 outlines in a small core. A real city is tens of thousands of buildings packed edge to edge, to the horizon.
2. **Real building forms.** Towers have setbacks, crowns, glass curtain walls and window grids. Low-rise buildings have pale stucco or brick, flat roofs, rooftop plant and bay windows. Today we draw coloured prisms.
3. **Light.** The sun casts shadows, glass reflects the sky, and haze grows with distance (atmospheric perspective). Today everything is lit flat.
4. **Ground.** SF's hills, the Bay's deep blue water with a sheen, piers, freeways on viaducts, trees along streets and in parks.
5. **Camera.** A low aerial perspective: three-quarter view, perspective foreshortening and a horizon. Today we use an orthographic isometric view.

## Plan

### A. City data at full density (`scripts/osm`, built by the GitHub Action)

**Buildings over the whole `wide` area**, not just `core`:
- Footprint and height (`height`, or `building:levels` × 3.2 m, or an estimate from the building type and the zone).
- `roof:shape`, `building:material` and `building:colour` when tagged.
- Type (commercial, residential, office…).

**Storage**
- Buildings are quantised and stored in binary tiles of 1 km × 1 km: `apps/web/public/geo/<city>/b-<x>_<y>.bin`, plus an `index.json`.
- Tiles are fetched lazily by the viewport, never bundled into JS.

**Terrain**
- A small elevation grid per city (from the AWS Terrarium tiles), so that SF, Kigali and Nairobi have their hills.

**Trees**
- Points sampled in parks and along residential streets.

### B. A WebGL city renderer (three.js), replacing the canvas/SVG map

Same `CityLayout`, places, paths, rides and presence as today. Only the drawing changes.

**Camera**
- Perspective aerial camera.
- Drag to pan, pinch or wheel to zoom, two-finger or right-drag to rotate and tilt.
- It follows the avatar.

**Buildings**
- Footprints are extruded and merged into a few draw calls per tile.
- Shaders give them:
  - window grids scaled to real floor heights;
  - lit windows at night;
  - glass towers that reflect the sky;
  - stucco, brick or concrete colours by type and zone;
  - roof caps and rooftop boxes;
  - setbacks for tall towers.
- Detail falls away with distance (LOD).

**Landmarks**
- Real 3D models built in code at their real positions:
  - San Francisco: Golden Gate Bridge with its towers and cables, Bay Bridge, Transamerica Pyramid, Salesforce Tower, Coit Tower.
  - Lagos: Third Mainland Bridge, Lekki–Ikoyi Link Bridge.
  - London: Tower Bridge, the Shard, London Eye, the Gherkin.
  - Dubai: Burj Khalifa, Burj Al Arab.
  - Cairo Tower, KICC (Nairobi), the Kigali Convention Centre, the Cotton Tree (Freetown), Hillbrow Tower (Johannesburg), and others.

**Ground, water and roads**
- Terrain mesh.
- Water with a fresnel sheen and waves.
- Roads with lane markings, and viaducts for motorways.
- Instanced trees.
- Cars moving along the road graph.

**Light and sky**
- Sun and sky from the game clock (day, dusk, night).
- Shadow maps near the camera.
- Distance haze, so the far city fades the way it does in the photo.

**Game layer**
- The game's own places stand out: a label and a glow on their real building.
- People and the avatar are 3D characters.

**Phones**
- It must run smoothly on a mid-range phone: instancing, merged geometry, tile culling and a quality setting.
- It falls back to today's 2D map when WebGL is unavailable.

### C. Real 3D interiors (three.js): homes and venues

**Home**
- A 3D bird's-eye home like the reference: walls cut away and rooms separated (bedroom, living room, kitchen, bathroom, study or games room, garage).
- Floors (tile or parquet), lamps casting light and soft shadows.
- The avatar walks through it; a tap moves them.
- Home acts (sleep, shower, cook, watch TV, invite) play out in 3D.

**Buy mode**
- Place and rotate the furniture you own, from the catalogue.
- What players own maps onto 3D models.

**Venues**
- Café, restaurant, club, gym, barber, office, bank, cinema and the rest get 3D rooms with their props.
- Wave 8's activity scripts drive the 3D avatar: sitting in the barber chair, eating at a table, dancing.

**Models**
- Built in code from primitives: no external assets needed, so everything ships with the app.

### Checks

- `npm run check`: engine untouched, tests for the data decoding and the layout glue.
- The E2E suite updated for the WebGL map, which keeps accessible names on places and buttons. Playwright's Chromium runs WebGL through SwiftShader.
- Screenshots of every city compared with real aerial photos, and iterated on until they read as the real city.
