# 3D model licences

Every model in this folder is by **Quaternius** (https://quaternius.com) and is
released under **CC0 1.0 Universal** (public domain dedication,
https://creativecommons.org/publicdomain/zero/1.0/). No attribution is required;
we credit the author anyway. Each pack's own `License.txt` says CC0.

| File | Pack | Author | Licence | Source |
| --- | --- | --- | --- | --- |
| `people/men.glb` | Ultimate Modular Men (outfits Casual 2, Casual Hoodie, Suit, Beach, Worker) | Quaternius | CC0 1.0 | https://quaternius.com/packs/ultimatemodularcharacters.html |
| `people/women.glb` | Ultimate Modular Women (outfits Casual, Formal, Suit, Punk, Worker) | Quaternius | CC0 1.0 | https://quaternius.com/packs/ultimatemodularwomen.html |
| `vehicles/cars.glb` | Cars (NormalCar1, NormalCar2, SUV, SportsCar, SportsCar2, Taxi, Cop) | Quaternius | CC0 1.0 | https://quaternius.com/packs/cars.html |
| `vehicles/cars-lod.glb` | The same cars, simplified for traffic | Quaternius | CC0 1.0 | https://quaternius.com/packs/cars.html |
| `props/furniture.glb` | Ultimate Furniture (beds, closets, desk, office chair, bookcase, sofas, chairs, tables, stools) | Quaternius | CC0 1.0 | https://quaternius.com/packs/ultimatefurniture.html |
| `props/furniture.glb` | Ultimate Home Interior (bathroom, kitchen units, fridge, couches, houseplants, lamps, shelves, tables, beds) | Quaternius | CC0 1.0 | https://quaternius.com/packs/ultimatehomeinterior.html |
| `props/transport.glb` | Public Transport (the bus) | Quaternius | CC0 1.0 | https://quaternius.com/packs/publictransport.html |

## How they were made

- **People:** the packs' "Individual Characters" glTF files, merged per pack
  into one skeleton with each outfit's Head, Body, Legs and Feet as separate
  skinned meshes (the rigs are identical, so the parts mix). Kept clips: Idle,
  Idle_Neutral, Walk, Run, Wave, Interact, Kick_Right, Punch_Right,
  HitRecieve, Death. Then `@gltf-transform` dedup, prune, weld, resample and
  quantize (KHR_mesh_quantization; no Draco or meshopt, so no decoder needed).
  The weapon props were dropped.
- **Cars:** the pack's FBX files, read with three.js's FBXLoader and written
  with GLTFExporter: centimetres to metres, Z-up to Y-up, the front towards
  +Z, each wheel on its own centre, the body colour's material renamed
  `Paint` (recoloured in game). Then `@gltf-transform` dedup, weld and
  quantize. `cars-lod.glb` drops the normals (flat-shaded in game), welds and
  runs meshoptimizer's simplifier (about 900 triangles a car).
- **Furniture:** the two packs' FBX files, read with FBXLoader (whose
  colours, written linear by Blender, are converted back) and written with
  GLTFExporter into one GLB of named models: metres, Y-up, front +Z,
  centred on the floor, one primitive per material. Then `@gltf-transform`
  dedup, weld and quantize. Fitted to each item's footprint in game, the
  fabric and kitchen colours recoloured by tier and finish.
- **Bus:** the Public Transport pack's FBX bus is untextured (every
  material is plain white): its materials are coloured by name (Top and
  Bottom the body, recoloured in game; Windows, Details, Bumper, Lights,
  tyres), then baked like the furniture. Motorbikes and kekes have no CC0
  Quaternius model and are built in code (three-kit/vehicles.ts).
