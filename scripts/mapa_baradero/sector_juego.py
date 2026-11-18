"""Referencia métrica compartida por San Martín y las teselas del centro."""
from mathutils import Matrix, Vector

MALABIA = Vector((-151.885922, -59.961532, 0))
SANTA_MARIA = Vector((-74.294606, 52.695926, 0))
LENGTH = (SANTA_MARIA - MALABIA).length
FORWARD = (SANTA_MARIA - MALABIA).normalized()
RIGHT = Vector((FORWARD.y, -FORWARD.x, 0))
TO_SECTOR = Matrix((RIGHT, FORWARD, Vector((0, 0, 1)))).to_4x4() @ Matrix.Translation(-MALABIA)
SECTOR_BOUNDS = ((-55, 55), (-33, LENGTH + 35))
