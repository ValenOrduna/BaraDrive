"""Small export-only street details reconstructed from the local photographs."""
import math
import random

import bpy
from mathutils import Matrix, Vector

from mapa_baradero.common import make_material


class Details:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.materials = []
        self.indices = []

    def face(self, vertices, material):
        if material not in self.materials:
            self.materials.append(material)
        i = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.append(tuple(range(i, i + len(vertices))))
        self.indices.append(self.materials.index(material))

    def slab(self, x0, x1, y0, y1, z, material):
        self.face([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], material)

    def mesh(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        for material in self.materials:
            mesh.materials.append(material)
        for face, index in zip(mesh.polygons, self.indices):
            face.material_index = index
        mesh.update()
        return mesh


def street_surfaces(add):
    rng = random.Random(385)
    details = Details()
    white = make_material(bpy, "Pintura vial envejecida", (0.52, 0.49, 0.42), .89)
    asphalt = make_material(bpy, "Parche de asfalto reparado", (0.13, 0.123, 0.111), .93)
    sealant = make_material(bpy, "Sellado de junta", (0.15, 0.137, 0.116), .91)
    cast_iron = make_material(bpy, "Hierro fundido en calzada", (0.12, 0.105, 0.088), .77, .24)
    rib = make_material(bpy, "Relieve de hierro", (0.16, 0.14, 0.117), .72, .18)
    joints = make_material(bpy, "Junta de loseta", (0.245, 0.223, 0.179), .94)
    stones = [make_material(bpy, f"Loseta reparada {i}", color, .9) for i, color in enumerate([
        (.34, .307, .25), (.39, .35, .30), (.28, .255, .215),
    ])]

    # Approach markings at Santa María de Oro. Broken ends leave exposed asphalt.
    for x in range(-3, 4):
        for section in range(6):
            y = 128.55 + section * .26
            half = rng.uniform(.17, .215)
            details.slab(x - half, x + half, y, y + rng.uniform(.21, .263), .016, white)
    for span in range(8):
        x = span * .44 + .08
        details.slab(x, x + rng.uniform(.39, .446), 127.58, 127.76, .016, white)

    for x, y in [(2.9, 24), (-1.15, 53), (1.9, 89), (2.8, 116)]:
        ring = [(x + math.cos(i * math.tau / 18) * .34,
                 y + math.sin(i * math.tau / 18) * .34, .021) for i in range(18)]
        details.face(ring, cast_iron)
        for offset in (-.19, -.12, -.05, .02, .09, .16):
            half = math.sqrt(.274 ** 2 - offset ** 2)
            details.slab(x - half, x + half, y + offset, y + offset + .012, .024, rib)
        for offset in (-.09, .09):
            details.slab(x + offset, x + offset + .032, y - .018, y + .018, .026, asphalt)

    for x, y in [(-1.9, 17), (1.75, 33), (-.8, 46), (.5, 67), (-1.9, 78), (1.8, 102), (-.4, 120)]:
        radius = rng.uniform(.29, .56)
        vertices = []
        for i in range(9):
            angle = math.tau * i / 9
            scale = radius * rng.uniform(.72, 1.2)
            vertices.append((x + scale * math.cos(angle), y + scale * 1.9 * math.sin(angle), .015))
        details.face(vertices, asphalt)

    for station in (22.3, 49.6, 79.3, 114.6):
        y = station
        for i in range(9):
            x = -3.7 + i * .84
            shift = rng.uniform(-.22, .22)
            width = rng.uniform(.010, .024)
            details.face([(x, y - width, .014), (x + .84, y + shift - width, .014),
                          (x + .84, y + shift + width, .014), (x, y + width, .014)], sealant)
            y += shift

    for side in (-1, 1):
        x0, x1 = sorted((side * 4.26, side * 5.46))
        for station in (17, 23, 42, 52, 63, 77, 89, 102, 120):
            y = station + rng.uniform(-.3, .3)
            details.slab(x0, x1, y, y + .018, .152, joints)
            for i in range(2):
                x = x0 + .19 + i * .43
                y2 = y + .04 + rng.uniform(.02, .15)
                details.slab(x, x + .37, y2, y2 + .38, .152, rng.choice(stones))
    add("Detalles de calzada y vereda", details.mesh("Detalles de calzada y vereda"), layer="road-detail")


def shop_details(add, collection, depsgraph):
    awnings = Details()
    edge = make_material(bpy, "Lona azul en borde", (.14, .23, .31), .94)
    binding = make_material(bpy, "Ribete claro de toldo", (.53, .54, .49), .95)
    red = make_material(bpy, "Chapa roja letrero Capri", (.48, .048, .036), .65)
    salmon = make_material(bpy, "Chapa roja del patio", (.34, .095, .036), .82)
    lettering = make_material(bpy, "Letras claras de comercio", (.85, .79, .65), .74)

    # Fachada roja con toldos azules, av.sanmartin.png. Se mantienen los vanos de origen.
    for center in (91, 97, 103, 109.5):
        for i in range(14):
            y = center - 2.3 + 4.6 * i / 14
            end = center - 2.3 + 4.6 * (i + 1) / 14
            mid = (y + end) * .5
            awnings.face([(4.912, y, 2.78), (4.912, end, 2.78), (4.912, end, 2.66),
                          (4.912, mid, 2.57), (4.912, y, 2.66)], edge)
            awnings.face([(4.908, y, 2.64), (4.908, mid, 2.55),
                          (4.908, end, 2.64), (4.908, end, 2.664),
                          (4.908, mid, 2.574), (4.908, y, 2.664)], binding)
            # Ribs follow the pitch of the existing cloth.
            awnings.face([(4.94, y, 2.813), (5.99, y, 3.561),
                          (5.99, y + .022, 3.561), (4.94, y + .022, 2.813)], edge)
    add("Costuras y cenefas de los toldos azules", awnings.mesh("Costuras y cenefas de los toldos azules"),
        layer="storefront")

    def sign(name, words, position, width, height, normal, material):
        normal = Vector(normal)
        up = Vector((0, 0, 1))
        right = up.cross(normal)
        point = Vector(position)
        panel = Details()
        panel.face([point - right * width / 2 - up * height / 2,
                    point + right * width / 2 - up * height / 2,
                    point + right * width / 2 + up * height / 2,
                    point - right * width / 2 + up * height / 2], material)
        add(name, panel.mesh(name), layer="storefront")
        font = bpy.data.curves.new(name, "FONT")
        font.body = words
        font.align_x, font.align_y = "CENTER", "CENTER"
        font.size = height * .67
        font.extrude = .001
        font.materials.append(lettering)
        text = bpy.data.objects.new(name, font)
        collection.objects.link(text)
        bpy.context.view_layer.update()
        mesh = bpy.data.meshes.new_from_object(text.evaluated_get(depsgraph))
        placement = Matrix((right, up, normal)).transposed().to_4x4()
        placement.translation = point + normal * .018
        add(f"Letras {name}", mesh, placement, layer="storefront")
        bpy.data.objects.remove(text, do_unlink=True)

    # The corner fascia goes on the anchored Capri building beyond Santa María de Oro.
    sign("Bandera de Capri", "CAPRI", (-5.94, 146.8, 4.04), 1.48, .46, (0, -1, 0), red)
    # Patiodecomidas1.png documents the words, while the business name is unclear.
    sign("Patio de comidas, letrero", "SANDWICH", (-7.76, -20, 2.05), 2.25, .63, (1, 0, 0), salmon)
