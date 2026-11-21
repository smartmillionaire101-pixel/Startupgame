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
  quantize.
