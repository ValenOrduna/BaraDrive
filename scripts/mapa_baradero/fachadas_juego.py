"""Read-only refinements to the photographic façades for the GLB export."""
import math
import random

import bpy
import numpy as np

from mapa_baradero.common import make_material

PLASTER_PREFIX = "grey_plaster_MAT_SM_"


def prepare_texture(image, name):
    if not name.startswith("grey_plaster_"):
        return
    image.scale(768, 768)
    if not name.startswith(PLASTER_PREFIX):
        return
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgb = pixels.reshape((-1, 4))[:, :3]
    mean = rgb.mean(axis=0)
    # The baked original is nearly black in game. Match the blue paint
    # visible around the white arches in avsanmartin2.png.
    tint = (0.28, 0.39, 0.49) if name.endswith("_azul.png") else mean
    # Large weathered patches and runoff cross the texture at different scales.
    # Integer harmonics keep the pattern continuous at tile edges.
    width, height = image.size
    x, y = np.meshgrid(np.arange(width) / width, np.arange(height) / height)
    coarse = np.sin(math.tau * (x + 2 * y)) * np.cos(math.tau * (2 * x - y))
    streaks = np.maximum(0, np.sin(math.tau * (7 * x + y)) + 0.38 * coarse - .71)
    stains = np.maximum(0, coarse * .75 + np.sin(math.tau * (3 * x + 2 * y)) * .25 - .28)
    grime = .045 * coarse - .058 * streaks - .059 * stains
    if name.endswith("_piedra.png"):
        row = np.floor(y * 11)
        horizontal = np.minimum((y * 11) % 1, 1 - (y * 11) % 1) < .023
        staggered = (x * 6 + (row % 2) * .5) % 1
        mortar = horizontal | (np.minimum(staggered, 1 - staggered) < .017)
        grime -= mortar * .095
    rgb[:] = np.clip(tint + (rgb - mean) * 0.43 + grime.reshape(-1, 1), 0, 1)
    image.pixels.foreach_set(pixels)
    image.update()


def vary_plaster(mesh, name):
    uv = mesh.uv_layers.active
    if not uv:
        return
    rng = random.Random(name)
    scale = rng.uniform(0.45, 0.64)
    angle = rng.uniform(-0.12, 0.12)
    a, b = scale * math.cos(angle), scale * math.sin(angle)
    offset_u, offset_v = rng.random(), rng.random()
    slots = {
        i for i, mat in enumerate(mesh.materials)
        if mat and mat.node_tree and any(
            node.type == "TEX_IMAGE" and node.image and PLASTER_PREFIX in node.image.name
            for node in mat.node_tree.nodes
        )
    }
    for face in mesh.polygons:
        if face.material_index in slots:
            for index in face.loop_indices:
                u, v = uv.data[index].uv
                uv.data[index].uv = (u * a - v * b + offset_u, u * b + v * a + offset_v)


def opening_details(obj, mesh):
    slots = {mat.name.split(".")[0]: i for i, mat in enumerate(mesh.materials) if mat}
    apertures = {
        "MAT_SM_sombra": ("Madera pintada", (0.14, 0.105, 0.078), 0.68),
        "MAT_SM_vidrio": ("Vidriera azul gris", (0.11, 0.16, 0.19), 0.29),
        "MAT_SM_porton": ("Chapa gris galvanizada", (0.30, 0.34, 0.36), 0.50),
    }
    for slot, (name, rgb, roughness) in apertures.items():
        if slot in slots:
            mesh.materials[slots[slot]] = make_material(bpy, name, rgb, roughness, 0.05)

    frame = make_material(bpy, "Marco gris de vidriera", (0.28, 0.32, 0.33), 0.58)
    panel = make_material(bpy, "Madera con moldura", (0.20, 0.155, 0.11), 0.68)
    handle = make_material(bpy, "Herraje bronce mate", (0.32, 0.22, 0.11), 0.52, 0.2)
    base = make_material(bpy, "Zócalo granito", (0.19, 0.20, 0.19), 0.88)
    materials = (frame, panel, handle, base)
    vertices, faces, indices = [], [], []

    def box(x, y, z, depth, width, height, material):
        i = len(vertices)
        vertices.extend(
            (x + dx * depth / 2, y + dy * width / 2, z + dz * height / 2)
            for dz in (-1, 1) for dy in (-1, 1) for dx in (-1, 1)
        )
        faces.extend(tuple(i + j for j in face) for face in (
            (0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
            (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6),
        ))
        indices.extend([materials.index(material)] * 6)

    # The source generator models each opening as a solid front at x ≈ ±6.10 m.
    # Use its original planar faces as anchors before evaluating bevel modifiers.
    if obj.get("bara_source_photo"):
        for face in obj.data.polygons:
            mat = obj.data.materials[face.material_index]
            slot = mat.name.split(".")[0] if mat else ""
            x, y, z = face.center
            if slot not in {"MAT_SM_sombra", "MAT_SM_vidrio"} or not 5.98 <= abs(x) <= 6.12:
                continue
            if face.normal.x * x > -5.8 or face.area < 0.8:
                continue
            corners = [obj.data.vertices[i].co for i in face.vertices]
            width = max(v.y for v in corners) - min(v.y for v in corners)
            height = max(v.z for v in corners) - min(v.z for v in corners)
            direction = face.normal.x
            x += direction * 0.027
            if slot == "MAT_SM_vidrio":
                for offset in (-0.25, 0, 0.25):
                    box(x, y + width * offset, z, 0.04, 0.045, height, frame)
                box(x, y, z + height * 0.31, 0.04, width, 0.04, frame)
                box(x, y, z - height * 0.43, 0.035, width, height * 0.14, frame)
            else:
                # Pilastras y arcos conservados, con hoja, panel y herraje dentro del vano.
                for offset in (-0.30, 0.30):
                    box(x, y + width * offset, z, 0.04, 0.045, height * 0.83, panel)
                for offset in (-0.41, -0.10, 0.41):
                    box(x, y, z + height * offset, 0.04, width * 0.65, 0.055, panel)
                box(x + direction * 0.032, y + width * 0.23, z - height * 0.14,
                    0.026, 0.035, 0.19, handle)

        if obj.name.startswith(("SM_Casa_Izquierda", "SM_Arcos_Azules", "SM_Muro_Porton_Gris")):
            # Zócalo bajo el umbral, como en avsanmartin2.png y avsanmartin3.png.
            x = -6.12 if "Izquierda" in obj.name or "Arcos" in obj.name else 6.12
            low, high = min(v.co.y for v in obj.data.vertices), max(v.co.y for v in obj.data.vertices)
            box(x, (low + high) / 2, 0.22, 0.10, high - low, 0.16, base)

    if not faces:
        return None
    detail = bpy.data.meshes.new(f"{obj.name}_detalle")
    detail.from_pydata(vertices, [], faces)
    for mat in materials:
        detail.materials.append(mat)
    for face, index in zip(detail.polygons, indices):
        face.material_index = index
    detail.update()
    return detail
