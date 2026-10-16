# SPDX-License-Identifier: AGPL-3.0-only
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1 :]
root, out, width, samples = Path(args[0]), args[1], int(args[2]), int(args[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
rects = json.loads((root / "rects.json").read_text())
screenshot = bpy.data.images.load(str(root / "chat3x.png"))
base_image = bpy.data.images.load(str(root / "chat3x-base.png"))
view_w, view_h = screenshot.size[0] / 3, screenshot.size[1] / 3
scale = 7.2 / view_w
panel_w, panel_h = view_w * scale, view_h * scale
popped_rows = [5, 6, 9, 10, 11, 12, 13]

scene = bpy.context.scene


def linear(value):
    value = value.lstrip("#")
    srgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in srgb) + (1,)


def glass(name, color, roughness=0.16):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = linear(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Coat Weight"].default_value = 1.0 if roughness < 0.3 else 0.35
    bsdf.inputs["Coat Roughness"].default_value = 0.05 if roughness < 0.3 else 0.3
    bsdf.inputs["Specular IOR Level"].default_value = 0.6
    return mat


def screen_material(name, image, emission):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Cubic"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = emission
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Specular IOR Level"].default_value = 0.15
    return mat


def slab(name, size_x, size_y, thickness, bevel, mat, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size_x, size_y, thickness)
    bpy.ops.object.transform_apply(scale=True)
    modifier = obj.modifiers.new("bevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = 8
    modifier.limit_method = "ANGLE"
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    if parent:
        obj.parent = parent
    return obj


def face(name, size_x, size_y, mat, z, parent):
    bpy.ops.mesh.primitive_plane_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size_x, size_y, 1)
    bpy.ops.object.transform_apply(scale=True)
    obj.location.z = z
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


rig = bpy.data.objects.new("rig", None)
scene.collection.objects.link(rig)

body = glass("panel", "#121214", 0.2)
slab("panel", panel_w + 0.18, panel_h + 0.18, 0.12, 0.06, body, rig)
face("panel-face", panel_w, panel_h, screen_material("panel-screen", base_image, 0.6), 0.0605, rig)

row_body = glass("row", "#1a1a1e", 0.18)
popped = [rects["rows"][i] for i in popped_rows]
for k, (x, y, w, h) in enumerate(popped):
    index = popped_rows[k]
    image = bpy.data.images.load(str(root / "rows" / f"row_{index:02d}.png"))
    holder = bpy.data.objects.new(f"row-{index}", None)
    scene.collection.objects.link(holder)
    holder.parent = rig
    pad = 0.05
    cx = (x + w / 2) * scale - panel_w / 2
    cy = panel_h / 2 - (y + h / 2) * scale
    lift = 0.3 + 0.11 * (len(popped) - 1 - k)
    holder.location = (cx - 0.03 * (len(popped) - 1 - k), cy, 0.06 + lift)
    slab(f"row-body-{index}", w * scale + pad * 2, h * scale + pad * 2, 0.07, 0.03, row_body, holder)
    face(f"row-face-{index}", w * scale, h * scale, screen_material(f"row-screen-{index}", image, 1.3), 0.0355, holder)

tile = glass("tile", "#0b0b0d", 0.38)
for i, (x, y, z, rz) in enumerate([(-8.4, 0.6, -0.25, 0), (-1.0, 9.2, -0.25, 0), (-9.6, 9.6, -0.25, 0), (8.8, 7.6, -0.25, 0), (8.6, -3.6, -0.25, 0), (-0.4, -10.6, -0.25, 0)]):
    obj = slab(f"tile-{i}", 7.6, 7.4, 0.14, 0.07, tile)
    obj.location = (x, y, z)
    obj.rotation_euler.z = math.radians(rz)
    obj.parent = rig

rig.rotation_euler = (0, 0, math.radians(-30))

world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = linear("#050507")
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0


def light(name, location, target, power, size_x, size_y, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.shape = "RECTANGLE"
    data.size = size_x
    data.size_y = size_y
    data.color = linear(color)[:3]
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.visible_camera = False
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()


light("strip", (-9, 3, 1.2), (0, 0, 0.3), 700, 18, 0.5, "#ffffff")
light("rim", (8, 6, 1.0), (0, 0, 0.3), 380, 14, 0.5, "#b9a9ff")
light("fill", (-6, -9, 5), (0, 0, 0), 60, 8, 8, "#ffffff")
light("accent", (0, -2, -2.5), (0, 0, 0), 80, 6, 6, "#7b5cff")

camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
scene.collection.objects.link(camera)
scene.camera = camera
target = Vector((0.1, -1.1, 0.6))
camera.location = (-2.6, -8.9, 4.9)
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = 42
camera.data.dof.use_dof = True
camera.data.dof.focus_distance = (target - camera.location).length
camera.data.dof.aperture_fstop = 2.4

scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for device in prefs.devices:
    device.use = True
scene.cycles.device = "GPU"
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.resolution_x = width
scene.render.resolution_y = round(width * 9 / 16)
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
