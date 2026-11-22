"""Pack a seamless, neutral albedo residual, OpenGL normal XY, and roughness."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def pack(src):
    maps = [Image.open(src / name).convert(mode).resize((512, 512), Image.Resampling.LANCZOS)
            for name, mode in [('Diffuse.jpg', 'L'), ('nor_gl.jpg', 'RGB'), ('Rough.jpg', 'L')]]
    # Wrap the convolution so that opposite edges have the same neighborhood.
    albedo = np.asarray(maps[0], dtype=np.float32) / 255
    padded = Image.fromarray(np.pad(np.asarray(maps[0]), 96, mode='wrap'))
    broad = np.asarray(padded.filter(ImageFilter.GaussianBlur(25)), dtype=np.float32)[96:-96, 96:-96] / 255
    residual = (albedo - broad) + .24 * (broad - np.mean(broad))
    strength = max(.065, np.percentile(np.abs(residual), 95))
    contrast = np.clip(.5 + .285 * residual / strength, 0, 1)
    normals = np.asarray(maps[1])
    roughness = np.asarray(maps[2])
    data = np.stack([np.rint(contrast*255).astype(np.uint8), normals[:, :, 0], normals[:, :, 1], roughness], axis=2)
    return Image.fromarray(data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    pack(args.source).save(args.target, optimize=True)
