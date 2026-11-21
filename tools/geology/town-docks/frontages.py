"""Rectify the lake-facing Avery and Dockside fronts. Register actual roof colours."""

from PIL import Image


def bake_frontages(source, target, refs):
    photo = Image.open(source / "wolfeboro-fletcher2015.jpg").convert("RGB")

    # The bottom three feet of the quay are occluded in the July 2015 view.
    # Use upper clapboard and sampled lower cladding at the floor line.
    def rect(quad, w, h):
        s = photo.width / 1198
        return photo.transform(
            (w, h),
            Image.Transform.QUAD,
            tuple(x * s for pt in quad for x in pt),
            resample=Image.Resampling.BICUBIC,
        )

    avery = rect([(469, 349), (470.6, 462.3), (690, 464.2), (690, 350.5)], 1024, 528)
    diner = rect([(96, 439.5), (95.8, 467.9), (235.4, 469.9), (235, 441.1)], 1024, 225)
    im = Image.new("RGB", (1024, 1024), "#796e5b")
    im.paste(avery, (0, 0))
    im.paste(diner, (0, 562))
    # Reuse sampled in-plane cornice and sign detail in its own row.
    sign = rect([(143, 421), (143, 432.9), (184, 433), (184, 420.8)], 256, 82)
    im.paste(sign, (0, 818))
    im.save(target / "wolfeboro-waterfront-fronts.webp", quality=94, method=6)
    # A roof atlas has a world-space UV basis in metres, reusing one regional texture.
    m = refs["cate-park.jpg"]
    per = 2 * m["half"] / m["px"]
    x0 = m["cx"] - m["half"]
    z0 = m["cz"] - m["half"]
    src = Image.open(source / "cate-park.jpg").convert("RGB")
    bounds = [7225, -350, 7429.8, -196.4]
    im = src.transform(
        (1024, 768),
        Image.Transform.EXTENT,
        tuple((p - base) / per for p, base in zip(bounds, (x0, z0, x0, z0))),
        Image.Resampling.BICUBIC,
    )
    im.save(target / "wolfeboro-town-roofs.webp", quality=91, method=6)
