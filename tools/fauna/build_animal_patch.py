"""Build original side profiles for the regional animal patch with Pillow."""
from base64 import b64encode
import json
from pathlib import Path

from PIL import Image, ImageDraw

GAME = Path(__file__).resolve().parents[2] / "game"
SIZE = (192, 112)
SCALE = 3


def canvas():
    art = Image.new("RGBA", tuple(n * SCALE for n in SIZE))
    draw = ImageDraw.Draw(art)

    def polygon(points, fill):
        draw.polygon([(x * SCALE, y * SCALE) for x, y in points], fill=fill)

    def oval(rect, fill):
        draw.ellipse([p * SCALE for p in rect], fill=fill)

    return art, polygon, oval


def osprey():
    art, poly, oval = canvas()
    poly([(0,43),(17,33),(24,30),(51,32),(68,45),(106,47),(144,58),(185,73),
          (190,86),(175,89),(137,79),(120,95),(75,96),(51,85),(36,65),
          (20,61),(12,49),(8,55)], "#f1ece1")
    poly([(50,36),(77,43),(104,45),(139,54),(178,69),(190,83),(157,82),
          (131,74),(100,80),(71,79),(58,69),(75,62)], "#634b40")
    poly([(56,50),(78,44),(115,49),(146,62),(130,69),(96,65),(72,61)], "#766054")
    poly([(13,45),(29,40),(48,45),(61,53),(65,61),(54,58),(42,51),(26,49)], "#443932")
    poly([(1,43),(17,38),(19,43),(11,47),(8,55),(5,55),(6,47)], "#393d39")
    oval((23,40,32,49), "#b98d3c")
    oval((25,42,30,47), "#201f1d")
    poly([(70,87),(84,90),(81,100),(94,102),(95,106),(76,104),(71,96)], "#a69b83")
    return art


def cormorant():
    art, poly, oval = canvas()
    poly([(0,29),(18,24),(24,13),(40,12),(54,17),(62,26),(60,38),(52,54),
          (63,60),(91,44),(113,48),(138,60),(157,75),(189,85),(189,92),
          (161,94),(139,87),(122,96),(84,99),(58,92),(42,76),(37,61),
          (43,38),(30,34),(15,33),(5,37)], "#353434")
    poly([(65,63),(80,52),(114,48),(136,59),(152,72),(132,83),(96,83),(73,75)], "#56514a")
    poly([(20,22),(36,23),(46,33),(46,41),(36,38),(29,30),(11,31)], "#c07f2e")
    poly([(1,29),(19,25),(31,26),(25,31),(12,32),(5,37)], "#8a7661")
    oval((33,21,41,29), "#71a9a4")
    oval((35,23,40,27), "#171b1a")
    poly([(101,89),(110,95),(105,104),(118,106),(116,111),(98,107),(98,99)], "#474442")
    return art


def killdeer():
    art, poly, oval = canvas()
    poly([(2,40),(19,36),(26,22),(43,20),(55,26),(62,39),(77,45),(105,43),
          (132,49),(151,62),(190,72),(185,79),(151,82),(126,91),(88,93),
          (61,89),(41,72),(31,56),(18,48),(2,44)], "#e4dccc")
    poly([(51,36),(67,45),(101,44),(132,49),(151,62),(189,73),(150,75),
          (126,70),(103,65),(71,65),(58,60)], "#816c55")
    poly([(52,44),(60,49),(65,57),(61,65),(53,61),(48,54),(44,49)], "#292725")
    poly([(64,61),(73,64),(78,70),(76,80),(67,86),(57,80),(63,73)], "#302d29")
    poly([(21,37),(34,32),(48,32),(47,39),(34,43),(24,42)], "#674d3c")
    poly([(0,41),(19,36),(22,41),(18,45),(2,44)], "#353331")
    oval((33,32,44,43), "#a45337")
    oval((35,34,42,41), "#25201c")
    poly([(97,89),(103,89),(104,104),(112,108),(110,111),(99,108)], "#ad9684")
    return art


def write_species(key, painter):
    art = painter().resize(SIZE, Image.Resampling.LANCZOS)
    filename = f"fauna-{key}.webp"
    art.save(GAME / filename, lossless=True, method=6)
    alpha = art.getchannel("A")
    depth = []
    for row in range(31):
        for col in range(49):
            x = round(col / 48 * (SIZE[0] - 1))
            y = round(row / 30 * (SIZE[1] - 1))
            # Thickness approaches zero toward the silhouette. The image
            # alpha still supplies fine details of the outline.
            opacity = alpha.getpixel((x, y))
            closure = min(alpha.getpixel((max(0, min(SIZE[0]-1, x+dx)),
                                           max(0, min(SIZE[1]-1, y+dy))))
                          for dx, dy in ((0, 0), (-5, 0), (5, 0), (0, -5), (0, 5)))
            depth.append(round(.25 * opacity + .75 * closure))
    return ["birds", SIZE[1] / SIZE[0], [0, 0, 1, 1], b64encode(bytes(depth)).decode(), filename]


if __name__ == "__main__":
    species = {key: write_species(key, painter) for key, painter in (
        ("osprey", osprey), ("double-crested-cormorant", cormorant), ("killdeer", killdeer))}
    path = GAME / "fauna-shapes.js"
    marker = "// Original regional animal patch silhouettes."
    existing = path.read_text().split(marker, 1)[0].rstrip()
    path.write_text(existing + "\n" + marker + "\nObject.assign(window.faunaShapes," +
                    json.dumps(species, separators=(",", ":")) + ");\n")
