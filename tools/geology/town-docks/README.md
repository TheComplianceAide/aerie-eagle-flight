# Wolfeboro and Meredith waterfront surveys

The game uses metres east and south of its Lake Winnipesaukee origin in UTM zone 19N. The NH GRANIT 2021–2022 orthophoto fixes the quays, roadway, parking, roof plates and public walkways in that coordinate system. The 2015 point cloud supplies the shape and height of eight downtown roofs. Horizontal lidar returns at the edge of a roof can belong to a lower cornice or neighboring car. Within three recognizable waterfront blocks, the fitter separates the main planes from their annexes and fits the interiors of each plane. The game shares the reconstructed roof field with flight contact.

Regenerate the bank outlines, ground meshes, crown and footprint records with the [lake-banks instructions](../lake-banks/README.md). Then run the municipal bake from the repository root with that cache and the generated lake habitat data.

```sh
python tools/geology/town-docks/bake.py --cache /tmp/aerie-lake-inputs --game game
```

The baker verifies the recorded SHA-256 for each photograph. It uses Requests, NumPy, SciPy, Pillow, scikit-image, Shapely and pyproj. The raw public source URLs are in [sources.json](sources.json). An existing directory of verified photographs can be supplied with `--photos`.

The ODbL street and park geometries in [street-cover.json](street-cover.json) include their source way IDs. The derived clearance field removes generated boulders from streets and maintained lawns. Boats, upholstery and parked vehicle body styles represent a summer visit. Moorings are anchored to registered fingers. Individual hulls pitch, roll and rise with local wind chop. Dock construction and the modern lake-facing decks use the town and engineering references listed in the [scenery credits](../../../game/atlas-credits.txt). These surveys and photos span different years.
