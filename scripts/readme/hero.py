# SPDX-License-Identifier: AGPL-3.0-only
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
root, out, width, samples = args[0], args[1], int(args[2]), int(args[3])
icon_svg = str(Path(__file__).resolve().parents[2] / "assets/public/branding/meowcord-icon.svg")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def hex_color(value):
    value = value.lstrip("#")
    srgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in srgb) + (1,)


def material(name, color, roughness=0.4, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_color(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = 0.08
    return mat


white = material("cat", "#ffffff", 0.3, 0.2)


def make_icon(color, size, location, rotation):
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=icon_svg)
    parts = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    rect = max(parts, key=lambda o: o.dimensions.x * o.dimensions.y)
    factor = size / rect.dimensions.x
    corners = [rect.matrix_world @ Vector(c) for c in rect.bound_box]
    center = sum(corners, Vector()) / 8
    holder = bpy.data.objects.new("icon", None)
    scene.collection.objects.link(holder)
    tile = material(f"tile-{color}", color, 0.32, 0.7)
    for part in parts:
        part.parent = holder
        part.location = (part.location - center) * factor
        part.scale = (factor, factor, factor)
        curve = part.data
        curve.dimensions = "2D"
        curve.fill_mode = "BOTH"
        curve.resolution_u = 24
        curve.materials.clear()
        if part is rect:
            curve.extrude = 0.075 * size / factor
            curve.bevel_depth = 0.03 * size / factor
            curve.bevel_resolution = 8
            curve.materials.append(tile)
        else:
            curve.extrude = 0.02 * size / factor
            curve.bevel_depth = 0.008 * size / factor
            curve.bevel_resolution = 4
            curve.offset = 0
            part.location.z = 0.11 * size
            curve.materials.append(white)
    holder.location = location
    holder.rotation_euler = [math.radians(a) for a in rotation]
    return holder


def screen(image_path, location, rotation, height):
    image = bpy.data.images.load(image_path)
    aspect = image.size[0] / image.size[1]
    w = height * aspect
    bpy.ops.mesh.primitive_cube_add(size=1)
    body = bpy.context.object
    body.scale = (w + 0.12, height + 0.12, 0.08)
    bevel = body.modifiers.new("bevel", "BEVEL")
    bevel.width = 0.05
    bevel.segments = 6
    body.data.materials.append(material("bezel", "#16131f", 0.35, 0.5))
    bpy.ops.mesh.primitive_plane_add(size=1)
    face = bpy.context.object
    face.scale = (w, height, 1)
    face.location.z = 0.041
    bpy.context.view_layer.update()
    face.parent = body
    face.matrix_parent_inverse = body.matrix_world.inverted()
    mat = bpy.data.materials.new("screen")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Cubic"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.85
    bsdf.inputs["Roughness"].default_value = 0.12
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    face.data.materials.append(mat)
    body.location = location
    body.rotation_euler = [math.radians(a) for a in rotation]
    return body


screen(f"{root}/discovery.png", (2.55, 2.1, 0.55), (90, 0, -22), 2.7)
screen(f"{root}/chat.png", (-2.5, 1.4, 0.05), (90, 0, 20), 2.7)

make_icon("#7B5CFF", 1.75, (0.15, -2.1, -0.05), (90 - 8, 0, -14))
for color, size, location, rotation in [
    ("#F2668B", 0.55, (-3.1, -0.9, 1.45), (74, 12, 26)),
    ("#3BA55D", 0.45, (3.15, -0.6, -1.25), (96, -10, -30)),
    ("#FAA61A", 0.32, (0.3, -3.3, 1.75), (70, 18, -8)),
    ("#2D9CDB", 0.32, (-1.65, -2.2, -1.2), (100, -14, 20)),
    ("#1ABC9C", 0.3, (-3.6, -0.4, -1.55), (84, 6, 40)),
]:
    make_icon(color, size, location, rotation)

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 7, 0), rotation=(math.radians(90), 0, 0))
bpy.context.object.data.materials.append(material("backdrop", "#1b1630", 0.9))

world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = hex_color("#0d0b16")
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0


def light(name, location, target, power, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.size = size
    data.color = hex_color(color)[:3]
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()


light("key", (-5, -7, 5), (0, 0, 0), 1400, 6, "#fff4ea")
light("fill", (6, -6, -1), (0, 0, 0), 450, 6, "#c9c0ff")
light("rim", (0, 4, 5), (0, -1, 0), 900, 4, "#9d85ff")
light("glow", (0, 3.5, -3), (0, 7, 0.5), 2200, 22, "#5b3fd6")

camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.location = (0.3, -10.5, 1.4)
camera.rotation_euler = (Vector((0, 0.4, 0.15)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = 42
camera.data.dof.use_dof = True
camera.data.dof.focus_distance = (Vector((0.15, -2.1, -0.05)) - camera.location).length
camera.data.dof.aperture_fstop = 4.5

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
scene.render.resolution_y = width // 2
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
