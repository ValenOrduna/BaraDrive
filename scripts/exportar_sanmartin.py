"""Run inside Blender, passing the repo root and output GLB after --."""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

repo, output = map(Path, sys.argv[sys.argv.index("--") + 1:])
sys.path.insert(0, str(repo / "scripts"))
from mapa_baradero.calle_juego import shop_details, street_surfaces
from mapa_baradero.fachadas_juego import opening_details, prepare_texture, vary_plaster
from mapa_baradero.sector_juego import LENGTH as length, SECTOR_BOUNDS as bounds, TO_SECTOR as transform

source = bpy.context.scene
assert source.unit_settings.scale_length == 1
osm = ET.parse(repo / "datos_osm/baradero_centro.osm").getroot()
for way_id, node_id in (("228161407", "2367942995"), ("601167979", "2367942960")):
    for street in (way_id, "228161668"):
        assert osm.find(f"way[@id='{street}']/nd[@ref='{node_id}']") is not None

textures = {p.name: p for p in (repo / "mapa/recursos/sanmartin").rglob("*") if p.is_file()}
for image in list(bpy.data.images):
    if not image.packed_file and image.name in textures:
        local = bpy.data.images.load(str(textures[image.name]))
        local.colorspace_settings.name = image.colorspace_settings.name
        prepare_texture(local, image.name)
        local.pack()
        image.user_remap(local)

# The source PBR builder leaves some shaders disconnected from an output.
for material in bpy.data.materials:
    if not material.use_nodes or "bara_license" not in material:
        continue
    tree = material.node_tree
    if not any(node.type == "OUTPUT_MATERIAL" for node in tree.nodes):
        shader = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
        material_output = tree.nodes.new("ShaderNodeOutputMaterial")
        tree.links.new(shader.outputs["BSDF"], material_output.inputs["Surface"])
    if material.name.lower() in ("mat_sm_asfalto", "mat_sm_vereda", "mat_sm_cesped"):
        continue
    for node in tree.nodes:
        if node.type == "NORMAL_MAP":
            node.inputs["Strength"].default_value *= 0.55

layers = {"CALLES": "road", "CORDONES": "curb", "VEREDAS": "sidewalk", "TERRENO": "ground"}
details = ("BARA_SANMARTIN_REALISTA", "EDIFICIOS", "ILUMINACION",
           "SANMARTIN_CAPRI_RADIO", "SANTA_MARIA_DE_ORO_FACHADAS")
depsgraph = bpy.context.evaluated_depsgraph_get()
export = bpy.data.collections.new("San Martín export")
source.collection.children.link(export)

def clip(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for axis, (lo, hi) in enumerate(bounds):
        for value, sign in ((lo, 1), (hi, -1)):
            plane = Vector((0, 0, 0))
            normal = plane.copy()
            plane[axis], normal[axis] = value, sign
            bmesh.ops.bisect_plane(
                bm, geom=[*bm.verts, *bm.edges, *bm.faces], dist=0.00001,
                plane_co=plane, plane_no=normal, clear_inner=True,
            )
    bm.to_mesh(mesh)
    bm.free()

def add(name, mesh, matrix=None, surface=None, layer=None):
    obj = bpy.data.objects.new(name, mesh)
    export.objects.link(obj)
    if matrix is not None:
        obj.matrix_world = matrix
    if surface:
        obj["surface"] = surface
    if layer:
        obj["layer"] = layer
    return obj

def proxy(name, lo, hi, surface):
    corners = [(x, y, z) for z in (lo[2], hi[2]) for y in (lo[1], hi[1]) for x in (lo[0], hi[0])]
    faces = [(0,2,3,1), (4,5,7,6), (0,1,5,4), (1,3,7,5), (3,2,6,7), (2,0,4,6)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(corners, [], faces)
    add(name, mesh, surface=surface)

def surface_collision(obj, surface):
    # Keep the driving surface and curb risers. Drop undersides, UVs and materials.
    mesh = obj.data
    vertices = [v.co for v in mesh.vertices]
    faces = [list(poly.vertices) for poly in mesh.polygons
             if poly.normal.z >= -0.01 and (surface == "curb" or poly.normal.z > 0.5)]
    collision = bpy.data.meshes.new(f"col_{obj.name}")
    collision.from_pydata(vertices, [], faces)
    bm = bmesh.new()
    bm.from_mesh(collision)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
    bm.to_mesh(collision)
    bm.free()
    add(collision.name, collision, surface=surface)

def import_tree(filename, prefix=None):
    bpy.ops.import_scene.gltf(filepath=str(repo / "referencias/arboles" / filename))
    parts = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"
             and (prefix is None or obj.name.startswith(prefix))]
    coords = [part.matrix_world @ vertex.co for part in parts for vertex in part.data.vertices]
    base = min(v.z for v in coords)
    height = max(v.z for v in coords) - base
    feet = [v for v in coords if v.z < base + height * 0.05]
    anchor = Vector((sum(v.x for v in feet) / len(feet), sum(v.y for v in feet) / len(feet), base))
    normalize = Matrix.Scale(1 / height, 4) @ Matrix.Translation(-anchor)
    result = []
    for part in parts:
        part.modifiers.new("Reducir árbol para el juego", "DECIMATE").ratio = 0.6
        bpy.context.view_layer.update()
        mesh = bpy.data.meshes.new_from_object(part.evaluated_get(depsgraph))
        mesh.transform(normalize @ part.matrix_world)
        result.append(mesh)
    return result

tree_meshes = {
    "SM_Arbol_CC0_": import_tree("arbol.glb"),
    "SM_Palmera_CC0_": import_tree("palmera.glb", ("Bark_2_", "Leaf_2_")),
}
for collection_name in (*layers, *details):
    for obj in bpy.data.collections[collection_name].objects:
        if obj.hide_render or obj.type not in {"MESH", "FONT"}:
            continue
        matrix = transform @ obj.matrix_world
        corners = [matrix @ Vector(corner) for corner in obj.bound_box]
        lo = [min(p[i] for p in corners) for i in range(3)]
        hi = [max(p[i] for p in corners) for i in range(3)]
        if any(hi[i] < bounds[i][0] or lo[i] > bounds[i][1] for i in range(2)):
            continue
        tree = next((meshes for prefix, meshes in tree_meshes.items()
                     if obj.name.startswith(prefix)), None)
        if tree:
            position = matrix.translation
            position.z = lo[2]
            placement = Matrix.Translation(position) @ Matrix.Scale(hi[2] - lo[2], 4)
            for idx, mesh in enumerate(tree):
                add(f"{obj.name}_{idx + 1}", mesh, placement, layer="vegetation")
            continue
        mesh = bpy.data.meshes.new_from_object(
            obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph,
        )
        surface = layers.get(collection_name)
        if surface or collection_name == "EDIFICIOS":
            mesh.transform(matrix)
            clip(mesh)
            matrix = None
        if not mesh.polygons:
            continue
        if collection_name == "BARA_SANMARTIN_REALISTA" and obj.type == "MESH":
            vary_plaster(mesh, obj.name)
            if obj.get("bara_source_photo") and "Mobiliario" not in obj.name:
                trim = opening_details(obj, mesh)
                if trim is not None:
                    add(trim.name, trim, matrix, layer=collection_name)
        mesh.update()
        visual = add(obj.name, mesh, matrix, layer=surface or collection_name)
        if surface:
            surface_collision(visual, surface)
        if not surface and obj.type == "MESH" and hi[2] > 2 and (
            (collection_name == "BARA_SANMARTIN_REALISTA" and
             not obj.get("bara_asset") and not any(
                 part in obj.name for part in ("Mobiliario", "Portal", "Patio"))) or
            collection_name in {"EDIFICIOS", "SANMARTIN_CAPRI_RADIO", "SANTA_MARIA_DE_ORO_FACHADAS"}
        ):
            # Bounds in avenue coordinates. Keep proxies outside the through lanes.
            if lo[0] >= 4 or hi[0] <= -4:
                proxy(f"col_{obj.name}", lo, hi, "building")

# Entrada de chapa gris en avsanmartin2.png. Aproximación de la transición
# de calzada a vereda, alineada con el portón a 38,6 m de Malabia.
# El trazado de la calzada y los demás cordones conservan sus cotas.
mesh = bpy.data.meshes.new("Acceso al portón gris")
mesh.from_pydata(
    [(3.50, 35.6, 0.012), (3.50, 40.4, 0.012),
     (3.96, 41.4, 0.151), (3.96, 34.6, 0.151),
     (4.12, 41.4, 0.151), (4.12, 34.6, 0.151)],
    [], [(0, 3, 2, 1), (3, 5, 4, 2)],
)
mesh.materials.append(bpy.data.materials["MAT_SM_Vereda"])
uv = mesh.uv_layers.new(name="UVMap")
for loop in mesh.loops:
    x, y, _ = mesh.vertices[loop.vertex_index].co
    uv.data[loop.index].uv = x / 2, y / 2
mesh.update()
surface_collision(add(mesh.name, mesh, layer="curb"), "curb")

for x in (-48, 48):
    proxy(f"col_limite_lateral_{x}", (x-.25,-30,-.1), (x+.25,length+30,2), "boundary")
for y in (-30, length+30):
    proxy(f"col_limite_longitudinal_{y:.0f}", (-48,y-.25,-.1), (48,y+.25,2), "boundary")

street_surfaces(add)
shop_details(add, export, depsgraph)

spawn = bpy.data.objects.new("spawn", None)
export.objects.link(spawn)
spawn.location = (2.35, 24.5, 0.52)

bpy.ops.object.select_all(action="DESELECT")
for obj in export.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                          export_extras=True, export_yup=True,
                          export_image_format="WEBP", export_image_quality=82)
triangles = 0
for obj in export.objects:
    if obj.type != "MESH":
        continue
    obj.data.calc_loop_triangles()
    triangles += len(obj.data.loop_triangles)
print(f"Tramo: {length:.2f} m, {len(export.objects)} objetos, {triangles} triángulos, {output.stat().st_size} bytes")
