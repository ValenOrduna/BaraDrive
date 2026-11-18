"""Exportación sin guardar la escena. Ejecutar Blender con --python-exit-code 1."""
from collections import defaultdict
import hashlib
import json
from math import floor
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mapa_baradero.sector_juego import SECTOR_BOUNDS, TO_SECTOR

TILE_SIZE = 512
SURFACES = {"CALLES": "road", "CORDONES": "curb", "VEREDAS": "sidewalk", "TERRENO": "ground"}
BUILDINGS = {
    "EDIFICIOS", "ANCHORENA_COMERCIOS", "ANCHORENA_IGLESIA",
    "ESQUINA_RODRIGUEZ_ANCHORENA", "RODRIGUEZ_FACHADAS",
    "SANMARTIN_CAPRI_RADIO", "SANTA_MARIA_DE_ORO_FACHADAS",
}
DETAILS = BUILDINGS | {
    "ANCHORENA_URBANO", "ILUMINACION", "SEÑALES", "DELEGACION",
    "PLAZA_MITRE", "BARA_SANMARTIN_REALISTA",
    "DELEGACION_ASSET_ARBUSTO_GLTF", "PLAZA_ASSET_PALMERA_GLTF",
}
VEGETATION_PREFIXES = ("PLAZA_JACARANDA", "PLAZA_ARBOL", "SM_Arbol_CC0")
NEUTRAL = (0.42, 0.38, 0.31)
SURFACE_COLORS = {
    "road": (0.095, 0.091, 0.086), "curb": (0.42, 0.39, 0.33),
    "sidewalk": (0.31, 0.27, 0.22), "ground": (0.11, 0.15, 0.066),
}


def bounds_of(points):
    return tuple((min(p[i] for p in points), max(p[i] for p in points)) for i in range(3))


def bisect(bm, axis, value, keep_positive):
    point, normal = Vector(), Vector()
    point[axis] = value
    normal[axis] = 1 if keep_positive else -1
    bmesh.ops.bisect_plane(
        bm, geom=[*bm.verts, *bm.edges, *bm.faces], dist=0.000001,
        plane_co=point, plane_no=normal, clear_inner=True,
    )


def outside_sector(mesh):
    """Partir una sola vez por límite para conservar exactamente el empalme."""
    remainder = bmesh.new()
    remainder.from_mesh(mesh)
    for axis, (low, high) in enumerate(SECTOR_BOUNDS):
        for value, inside_positive in ((low, True), (high, False)):
            outside = remainder.copy()
            bisect(outside, axis, value, not inside_positive)
            if outside.faces:
                yield outside
            outside.free()
            bisect(remainder, axis, value, inside_positive)
    remainder.free()


def color(material):
    if material is None:
        return NEUTRAL
    shader = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if material.use_nodes else None
    rgb = shader.inputs["Base Color"].default_value[:3] if shader else material.diffuse_color[:3]
    # Limitar la paleta para agrupar fachadas cercanas en una sola llamada por color.
    return tuple(round(channel * 15) / 15 for channel in rgb)


class Tile:
    def __init__(self):
        self.batches = defaultdict(lambda: ([], []))

    def add(self, points, layer, rgb=None):
        vertices, faces = self.batches[layer, rgb]
        offset = len(vertices)
        vertices.extend(tuple(point) for point in points)
        faces.append(tuple(range(offset, len(vertices))))

    def export(self, path, collection, palette):
        counts = {"visual": 0, "collision": 0}
        objects = []
        for (layer, rgb), (vertices, faces) in self.batches.items():
            name = layer if rgb is not None else f"col_{layer}"
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata(vertices, [], faces)
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00005)
            bm.to_mesh(mesh)
            bm.free()
            mesh.calc_loop_triangles()
            if not mesh.loop_triangles:
                bpy.data.meshes.remove(mesh)
                continue
            obj = bpy.data.objects.new(name, mesh)
            collection.objects.link(obj)
            obj.select_set(True)
            objects.append(obj)
            if rgb is None:
                obj["surface"] = layer
                counts["collision"] += len(mesh.loop_triangles)
            else:
                obj["layer"] = layer
                if rgb not in palette:
                    material = bpy.data.materials.new(f"Color {rgb}")
                    material.diffuse_color = (*rgb, 1)
                    material.roughness = 0.94
                    palette[rgb] = material
                mesh.materials.append(palette[rgb])
                counts["visual"] += len(mesh.loop_triangles)
        bpy.ops.export_scene.gltf(
            filepath=str(path), export_format="GLB", use_selection=True,
            export_extras=True, export_yup=True, export_texcoords=False, export_materials="EXPORT",
        )
        for obj in objects:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.meshes.remove(mesh)
        return {"file": path.name, "bytes": path.stat().st_size, "triangles": counts}


def add_tree(tile, corners, jacaranda):
    """Proxy propio de copa y tronco, con la posición y el tamaño del original."""
    (x0, x1), (y0, y1), (z0, z1) = bounds_of(corners)
    center = Vector(((x0 + x1) / 2, (y0 + y1) / 2, z0))
    height = z1 - z0
    for crown, rgb in (
        (False, (0.18, 0.09, 0.04)),
        (True, (0.24, 0.12, 0.28) if jacaranda else (0.12, 0.25, 0.055)),
    ):
        bm = bmesh.new()
        if crown:
            bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1)
            scale = ((x1 - x0) / 2, (y1 - y0) / 2, height * 0.34)
            origin = center + Vector((0, 0, height * 0.66))
        else:
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=6,
                                 radius1=1, radius2=0.65, depth=2)
            scale = (height * 0.024, height * 0.024, height * 0.28)
            origin = center + Vector((0, 0, height * 0.28))
        for face in bm.faces:
            tile.add([origin + Vector(tuple(v.co[i] * scale[i] for i in range(3)))
                      for v in face.verts], "vegetation", rgb)
        bm.free()


def collect_routes(collection):
    routes = []
    for obj in sorted(collection.objects, key=lambda obj: obj.name):
        vertices = obj.data.vertices
        points = [
            TO_SECTOR @ obj.matrix_world @ ((vertices[i].co + vertices[i + 1].co) / 2)
            for i in range(0, len(vertices), 2)
        ]
        routes.append({
            "id": str(obj["osm_way_id"]),
            "name": obj.name.split("_", 2)[2],
            "points": [[round(p.x, 4), round(-p.y, 4)] for p in points],
        })
    return routes


def main(output):
    scene = bpy.context.scene
    source = bpy.data.collections["BARA_DRIVE_CALLES"]
    assert scene.unit_settings.scale_length == 1 and source["crs"] == "EPSG:32721"
    with open(bpy.data.filepath, "rb") as blend:
        source_hash = hashlib.file_digest(blend, "sha256").hexdigest()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tiles = defaultdict(Tile)
    seen = set()
    for collection_name in sorted(set(SURFACES) | DETAILS):
        for obj in bpy.data.collections[collection_name].objects:
            if obj.name in seen or obj.hide_render or obj.type not in {"MESH", "FONT"}:
                continue
            seen.add(obj.name)
            matrix = TO_SECTOR @ obj.matrix_world
            corners = [matrix @ Vector(corner) for corner in obj.bound_box]
            bounds = bounds_of(corners)
            center = [(lo + hi) / 2 for lo, hi in bounds]
            surface = SURFACES.get(collection_name)
            if surface is None and all(lo <= center[i] <= hi for i, (lo, hi) in enumerate(SECTOR_BOUNDS)):
                continue
            key = tuple(floor(center[i] / TILE_SIZE) for i in range(2))
            tile = tiles["ground" if surface == "ground" else f"{key[0]}_{key[1]}"]
            if obj.name.startswith(VEGETATION_PREFIXES):
                add_tree(tile, corners, obj.name.startswith("PLAZA_JACARANDA"))
                continue

            mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
            mesh.transform(matrix)
            mesh.update()
            materials = [color(mat) for mat in mesh.materials]
            if surface:
                if surface == "ground":
                    for face in mesh.polygons:
                        tile.add([mesh.vertices[i].co for i in face.vertices], surface)
                for part in outside_sector(mesh):
                    part.normal_update()
                    for face in part.faces:
                        points = [v.co for v in face.verts]
                        if surface != "ground" and (face.normal.z > 0.5 or
                                                    (surface == "curb" and face.normal.z >= -0.01)):
                            tile.add(points, surface)
                        if face.normal.z >= -0.01:
                            tile.add(points, surface, SURFACE_COLORS[surface])
            else:
                solid = (collection_name in BUILDINGS or obj.name in {
                    "DELEGACION_MUNICIPAL", "DELEGACION_LATERAL_RODRIGUEZ_REF",
                }) and bounds[2][1] - bounds[2][0] > 1.5 and obj.type == "MESH"
                layer = "building" if solid else "detail"
                for face in mesh.polygons:
                    points = [mesh.vertices[i].co for i in face.vertices]
                    rgb = materials[face.material_index] if face.material_index < len(materials) else NEUTRAL
                    tile.add(points, layer, rgb)
                    if solid and face.area > 0.025 and face.normal.z >= -0.01:
                        tile.add(points, "building")
            bpy.data.meshes.remove(mesh)

    output.mkdir(parents=True, exist_ok=True)
    export = bpy.data.collections.new("Teselas juego")
    scene.collection.children.link(export)
    bpy.ops.object.select_all(action="DESELECT")
    palette = {}
    chunks = [tile.export(output / f"{key}.glb", export, palette)
              for key, tile in sorted(tiles.items()) if tile.batches]
    manifest = {
        "source": Path(bpy.data.filepath).name, "sourceSha256": source_hash,
        "crs": source["crs"], "originLatLon": [source["origin_lat"], source["origin_lon"]],
        "originUtm": [source["origin_easting_m"], source["origin_northing_m"]],
        "tileSize": TILE_SIZE, "chunks": chunks, "routes": collect_routes(source),
    }
    (output / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(chunks)} teselas, {sum(c['bytes'] for c in chunks)} bytes")


if __name__ == "__main__":
    main(Path(sys.argv[sys.argv.index("--") + 1]))
