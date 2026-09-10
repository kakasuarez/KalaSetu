import json
import math
import os
import struct
import tempfile
from pathlib import Path
from typing import List

import httpx

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.responses import Response

try:
    from dotenv import load_dotenv
    # Load .env from repo root or parent directories
    for env_path in [".env", "../.env", "../../.env"]:
        if os.path.exists(env_path):
            load_dotenv(env_path)
            break
except Exception:
    pass

from loaders import get_whisper
from pipeline import process_image

TOKEN = os.getenv("ML_SERVICE_TOKEN", "")
STABILITY_API_KEY = os.getenv("STABILITY_API_KEY", "")
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
HF_3D_SPACE = os.getenv("HF_3D_SPACE", "stabilityai/TripoSR")

app = FastAPI(title="KalaSetu ML")


def auth(x_ml_token: str = Header(default="", alias="X-ML-Token")):
    if TOKEN and x_ml_token != TOKEN:
        raise HTTPException(401, "bad token")


def detect_mime_type(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    return "image/jpeg"


def generate_multi_view_3d(image_list: List[bytes]) -> bytes:
    """Generate a prism GLB with each face textured by a different product image.

    The number of faces equals the number of images (min 3 for a valid prism).
    Each face is a rectangle mapped with one product photo, so the viewer sees
    a different angle of the product on each face as they rotate it 360°.
    """
    n_faces = max(len(image_list), 3)
    # Duplicate images cyclically if fewer than 3
    images = []
    for i in range(n_faces):
        images.append(image_list[i % len(image_list)])

    half_h = 0.5  # half-height of the prism
    radius_val = 0.45  # radius of the circumscribed circle

    # ---- Build per-face geometry ----
    all_positions: List[float] = []
    all_uvs: List[float] = []
    all_indices: List[int] = []
    vertex_offset = 0

    for i in range(n_faces):
        angle0 = 2 * math.pi * i / n_faces
        angle1 = 2 * math.pi * (i + 1) / n_faces

        x0 = radius_val * math.cos(angle0)
        z0 = radius_val * math.sin(angle0)
        x1 = radius_val * math.cos(angle1)
        z1 = radius_val * math.sin(angle1)

        # Four corners of this face (CCW winding for outward normal)
        # bottom-left, bottom-right, top-right, top-left
        all_positions.extend([
            x0, -half_h, z0,
            x1, -half_h, z1,
            x1,  half_h, z1,
            x0,  half_h, z0,
        ])

        # UV mapping: full image on each face
        all_uvs.extend([
            0.0, 1.0,
            1.0, 1.0,
            1.0, 0.0,
            0.0, 0.0,
        ])

        # Two triangles per face
        base = vertex_offset
        all_indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])
        vertex_offset += 4

    # Also add top and bottom caps (untextured, use first image)
    # Top cap
    top_center_idx = vertex_offset
    all_positions.extend([0.0, half_h, 0.0])
    all_uvs.extend([0.5, 0.5])
    vertex_offset += 1
    for i in range(n_faces):
        angle = 2 * math.pi * i / n_faces
        x = radius_val * math.cos(angle)
        z = radius_val * math.sin(angle)
        all_positions.extend([x, half_h, z])
        all_uvs.extend([0.5 + 0.5 * math.cos(angle), 0.5 + 0.5 * math.sin(angle)])
        vertex_offset += 1

    for i in range(n_faces):
        next_i = (i + 1) % n_faces
        all_indices.extend([top_center_idx, top_center_idx + 1 + next_i, top_center_idx + 1 + i])

    # Bottom cap
    bot_center_idx = vertex_offset
    all_positions.extend([0.0, -half_h, 0.0])
    all_uvs.extend([0.5, 0.5])
    vertex_offset += 1
    for i in range(n_faces):
        angle = 2 * math.pi * i / n_faces
        x = radius_val * math.cos(angle)
        z = radius_val * math.sin(angle)
        all_positions.extend([x, -half_h, z])
        all_uvs.extend([0.5 + 0.5 * math.cos(angle), 0.5 + 0.5 * math.sin(angle)])
        vertex_offset += 1

    for i in range(n_faces):
        next_i = (i + 1) % n_faces
        all_indices.extend([bot_center_idx, bot_center_idx + 1 + i, bot_center_idx + 1 + next_i])

    # ---- Pack binary data ----
    pos_bytes = b"".join(struct.pack("<fff", *all_positions[i:i+3]) for i in range(0, len(all_positions), 3))
    uv_bytes = b"".join(struct.pack("<ff", *all_uvs[i:i+2]) for i in range(0, len(all_uvs), 2))
    idx_bytes = b"".join(struct.pack("<H", i) for i in all_indices)

    def pad4(b: bytes) -> bytes:
        while len(b) % 4 != 0:
            b += b"\x00"
        return b

    pos_bytes = pad4(pos_bytes)
    uv_bytes = pad4(uv_bytes)
    idx_bytes = pad4(idx_bytes)

    # Compute bounding box
    xs = all_positions[0::3]
    ys = all_positions[1::3]
    zs = all_positions[2::3]

    # ---- Build glTF structure ----
    # Each side face gets its own material/texture, caps share material 0
    buffer_views = []
    accessors = []
    meshes_primitives = []
    materials = []
    textures = []
    gltf_images = []

    n_vertices = vertex_offset
    n_indices = len(all_indices)

    # Buffer views for geometry (shared across all primitives)
    bv_pos = 0
    buffer_views.append({"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes), "target": 34962})
    bv_uv = 1
    buffer_views.append({"buffer": 0, "byteOffset": len(pos_bytes), "byteLength": len(uv_bytes), "target": 34962})
    bv_idx = 2
    buffer_views.append({"buffer": 0, "byteOffset": len(pos_bytes) + len(uv_bytes), "byteLength": len(idx_bytes), "target": 34963})

    # Accessors for positions and UVs (shared)
    acc_pos = 0
    accessors.append({
        "bufferView": bv_pos, "byteOffset": 0, "componentType": 5126,
        "count": n_vertices, "type": "VEC3",
        "max": [max(xs), max(ys), max(zs)],
        "min": [min(xs), min(ys), min(zs)],
    })
    acc_uv = 1
    accessors.append({
        "bufferView": bv_uv, "byteOffset": 0, "componentType": 5126,
        "count": n_vertices, "type": "VEC2",
        "max": [1.0, 1.0], "min": [0.0, 0.0],
    })

    # Image buffer views start after geometry
    geom_size = len(pos_bytes) + len(uv_bytes) + len(idx_bytes)
    img_offset = geom_size
    padded_images = []
    for img_data in images:
        padded = pad4(img_data)
        padded_images.append((padded, len(img_data)))

    next_bv = 3
    for idx_img, (padded, orig_len) in enumerate(padded_images):
        buffer_views.append({"buffer": 0, "byteOffset": img_offset, "byteLength": orig_len})
        gltf_images.append({"bufferView": next_bv, "mimeType": detect_mime_type(images[idx_img])})
        textures.append({"source": idx_img})
        materials.append({
            "name": f"Face{idx_img}",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": idx_img},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.4,
            },
            "doubleSided": True,
        })
        img_offset += len(padded)
        next_bv += 1

    # Create one primitive per side face (each with its own material)
    # and one for top cap and one for bottom cap
    next_acc = 2
    for i in range(n_faces):
        # Each side face has 6 indices starting at i*6
        face_start = i * 6
        accessors.append({
            "bufferView": bv_idx, "byteOffset": face_start * 2,
            "componentType": 5123, "count": 6, "type": "SCALAR",
            "max": [max(all_indices[face_start:face_start+6])],
            "min": [min(all_indices[face_start:face_start+6])],
        })
        meshes_primitives.append({
            "attributes": {"POSITION": acc_pos, "TEXCOORD_0": acc_uv},
            "indices": next_acc,
            "material": i % len(images),
        })
        next_acc += 1

    # Top cap indices
    top_start = n_faces * 6
    top_count = n_faces * 3
    if top_count > 0:
        accessors.append({
            "bufferView": bv_idx, "byteOffset": top_start * 2,
            "componentType": 5123, "count": top_count, "type": "SCALAR",
            "max": [max(all_indices[top_start:top_start+top_count])],
            "min": [min(all_indices[top_start:top_start+top_count])],
        })
        meshes_primitives.append({
            "attributes": {"POSITION": acc_pos, "TEXCOORD_0": acc_uv},
            "indices": next_acc,
            "material": 0,
        })
        next_acc += 1

    # Bottom cap indices
    bot_start = top_start + top_count
    bot_count = n_faces * 3
    if bot_count > 0:
        accessors.append({
            "bufferView": bv_idx, "byteOffset": bot_start * 2,
            "componentType": 5123, "count": bot_count, "type": "SCALAR",
            "max": [max(all_indices[bot_start:bot_start+bot_count])],
            "min": [min(all_indices[bot_start:bot_start+bot_count])],
        })
        meshes_primitives.append({
            "attributes": {"POSITION": acc_pos, "TEXCOORD_0": acc_uv},
            "indices": next_acc,
            "material": 0,
        })
        next_acc += 1

    # Assemble binary buffer
    bin_buffer = pos_bytes + uv_bytes + idx_bytes
    for padded, _ in padded_images:
        bin_buffer += padded

    gltf = {
        "asset": {"version": "2.0", "generator": "KalaSetu-3D-MultiView"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": meshes_primitives}],
        "materials": materials,
        "textures": textures,
        "images": gltf_images,
        "buffers": [{"byteLength": len(bin_buffer)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_buffer)
    header = struct.pack("<4sII", b"glTF", 2, total_len)
    json_chunk = struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
    bin_chunk = struct.pack("<I4s", len(bin_buffer), b"BIN\x00") + bin_buffer

    return header + json_chunk + bin_chunk


async def generate_triposr_3d(image_bytes: bytes) -> bytes | None:
    """Generate a genuine 3D mesh GLB from an image using TripoSR Space."""
    token = HF_API_TOKEN or os.getenv("HF_API_TOKEN", "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    space_host = "https://stabilityai-triposr.hf.space"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # 1. Upload image to space
            files = {"files": ("product.png", image_bytes, "image/png")}
            up_res = await client.post(f"{space_host}/upload", files=files, headers=headers, timeout=30.0)
            if up_res.status_code != 200:
                return None
            up_data = up_res.json()
            file_path = up_data[0] if isinstance(up_data, list) else up_data

            # 2. Call preprocess with background removal enabled
            prep_payload = {
                "data": [
                    {"path": file_path, "meta": {"_type": "gradio.FileData"}},
                    True,  # remove_background = True
                    0.85,  # foreground_ratio
                ]
            }
            prep_call = await client.post(f"{space_host}/call/preprocess", json=prep_payload, headers=headers, timeout=30.0)
            if prep_call.status_code != 200:
                return None
            prep_event_id = prep_call.json().get("event_id")

            # Stream result of preprocess
            prep_file = None
            async with client.stream("GET", f"{space_host}/call/preprocess/{prep_event_id}", headers=headers, timeout=60.0) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        try:
                            d = json.loads(line[5:].strip())
                            if isinstance(d, list) and len(d) > 0:
                                prep_file = d[0]
                        except Exception:
                            pass

            if not prep_file:
                return None

            # 3. Call generate
            gen_payload = {
                "data": [
                    prep_file,
                    128,  # marching cubes resolution
                ]
            }
            gen_call = await client.post(f"{space_host}/call/generate", json=gen_payload, headers=headers, timeout=30.0)
            if gen_call.status_code != 200:
                return None
            gen_event_id = gen_call.json().get("event_id")

            # Stream result of generate
            glb_path = None
            async with client.stream("GET", f"{space_host}/call/generate/{gen_event_id}", headers=headers, timeout=120.0) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        try:
                            d = json.loads(line[5:].strip())
                            if isinstance(d, list) and len(d) > 1:
                                glb_info = d[1]
                                glb_path = glb_info.get("path")
                        except Exception:
                            pass

            if not glb_path:
                return None

            # 4. Download GLB
            dl_url = f"{space_host}/file={glb_path}"
            dl_res = await client.get(dl_url, headers=headers, timeout=60.0)
            if dl_res.status_code == 200 and len(dl_res.content) > 1000:
                return dl_res.content

    except Exception:
        return None

    return None


def generate_cutout_3d(image_bytes: bytes) -> bytes:
    """Generate a clean 3D silhouette cutout GLB with alpha transparency.
    Unlike a grey box, this has no solid background or rectangular borders.
    """
    mime_type = detect_mime_type(image_bytes)

    # Calculate aspect ratio if possible
    aspect_w, aspect_h = 0.45, 0.65
    try:
        from PIL import Image
        import io
        with Image.open(io.BytesIO(image_bytes)) as pil_img:
            w, h = pil_img.size
            if w > 0 and h > 0:
                ratio = w / h
                if ratio > 1:
                    aspect_w = 0.6
                    aspect_h = 0.6 / ratio
                else:
                    aspect_w = 0.6 * ratio
                    aspect_h = 0.6
    except Exception:
        pass

    half_w = aspect_w / 2.0
    half_h = aspect_h / 2.0
    depth = 0.04  # slim 3D relief depth

    positions = [
        # Front (+Z)
        -half_w, -half_h,  depth,   half_w, -half_h,  depth,   half_w,  half_h,  depth,  -half_w,  half_h,  depth,
        # Back (-Z)
         half_w, -half_h, -depth,  -half_w, -half_h, -depth,  -half_w,  half_h, -depth,   half_w,  half_h, -depth,
        # Left (-X)
        -half_w, -half_h, -depth,  -half_w, -half_h,  depth,  -half_w,  half_h,  depth,  -half_w,  half_h, -depth,
        # Right (+X)
         half_w, -half_h,  depth,   half_w, -half_h, -depth,   half_w,  half_h, -depth,   half_w,  half_h,  depth,
    ]
    uvs = [
        0.0, 1.0,  1.0, 1.0,  1.0, 0.0,  0.0, 0.0,
        0.0, 1.0,  1.0, 1.0,  1.0, 0.0,  0.0, 0.0,
        0.0, 1.0,  1.0, 1.0,  1.0, 0.0,  0.0, 0.0,
        0.0, 1.0,  1.0, 1.0,  1.0, 0.0,  0.0, 0.0,
    ]
    indices = []
    for f in range(4):
        base = f * 4
        indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    pos_bytes = b"".join(struct.pack("<fff", *positions[i:i+3]) for i in range(0, len(positions), 3))
    uv_bytes = b"".join(struct.pack("<ff", *uvs[i:i+2]) for i in range(0, len(uvs), 2))
    idx_bytes = b"".join(struct.pack("<H", i) for i in indices)

    def pad4(b: bytes) -> bytes:
        while len(b) % 4 != 0:
            b += b"\x00"
        return b

    pos_bytes = pad4(pos_bytes)
    uv_bytes = pad4(uv_bytes)
    idx_bytes = pad4(idx_bytes)
    img_padded = pad4(image_bytes)

    offset_pos = 0
    len_pos = len(pos_bytes)
    offset_uv = offset_pos + len_pos
    len_uv = len(uv_bytes)
    offset_idx = offset_uv + len_uv
    len_idx = len(idx_bytes)
    offset_img = offset_idx + len_idx

    bin_buffer = pos_bytes + uv_bytes + idx_bytes + img_padded

    gltf = {
        "asset": {"version": "2.0", "generator": "KalaSetu-3D-Cutout"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [
            {
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "TEXCOORD_0": 1},
                        "indices": 2,
                        "material": 0,
                    }
                ]
            }
        ],
        "materials": [
            {
                "name": "ProductCutoutMaterial",
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.3,
                },
                "alphaMode": "MASK",
                "alphaCutoff": 0.1,
                "doubleSided": True,
            }
        ],
        "textures": [{"source": 0}],
        "images": [{"bufferView": 3, "mimeType": mime_type}],
        "buffers": [{"byteLength": len(bin_buffer)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": offset_pos, "byteLength": len_pos, "target": 34962},
            {"buffer": 0, "byteOffset": offset_uv, "byteLength": len_uv, "target": 34962},
            {"buffer": 0, "byteOffset": offset_idx, "byteLength": len_idx, "target": 34963},
            {"buffer": 0, "byteOffset": offset_img, "byteLength": len(image_bytes)},
        ],
        "accessors": [
            {
                "bufferView": 0, "byteOffset": 0, "componentType": 5126, "count": 16, "type": "VEC3",
                "max": [half_w, half_h, depth], "min": [-half_w, -half_h, -depth],
            },
            {
                "bufferView": 1, "byteOffset": 0, "componentType": 5126, "count": 16, "type": "VEC2",
                "max": [1.0, 1.0], "min": [0.0, 0.0],
            },
            {
                "bufferView": 2, "byteOffset": 0, "componentType": 5123, "count": 24, "type": "SCALAR",
                "max": [15], "min": [0],
            },
        ],
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_buffer)
    header = struct.pack("<4sII", b"glTF", 2, total_len)
    json_chunk = struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
    bin_chunk = struct.pack("<I4s", len(bin_buffer), b"BIN\x00") + bin_buffer

    return header + json_chunk + bin_chunk


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/enhance")
async def enhance(
    file: UploadFile = File(...),
    backdrop: str = Form("white"),
    _=Header(default="", alias="X-ML-Token"),
):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")

    try:
        out_bytes = process_image(data, backdrop=backdrop)
    except Exception as e:
        raise HTTPException(500, f"Processing failed: {e}")

    return Response(content=out_bytes, media_type="image/jpeg")


def generate_instantmesh_3d(image_bytes: bytes) -> bytes | None:
    """Generate a high-quality multi-view 3D textured mesh using TencentARC/InstantMesh."""
    token = HF_API_TOKEN or os.getenv("HF_API_TOKEN", "")
    try:
        from gradio_client import Client, handle_file

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            client = Client("TencentARC/InstantMesh", token=token if token else None)

            # Step 1: Preprocess with background removal
            prep_image = client.predict(
                input_image=handle_file(tmp_path),
                do_remove_background=True,
                api_name="/preprocess",
            )

            # Step 2: Multi-view generation
            mvs_image = client.predict(
                input_image=handle_file(prep_image),
                sample_steps=75,
                sample_seed=42,
                api_name="/generate_mvs",
            )

            # Step 3: High-quality 3D mesh reconstruction
            obj_path, glb_path = client.predict(api_name="/make3d")

            if glb_path and os.path.exists(glb_path):
                with open(glb_path, "rb") as gf:
                    content = gf.read()
                    if len(content) > 1000:
                        return content
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    except Exception as e:
        print(f"InstantMesh generation error: {e}")
        return None

    return None


@app.post("/generate3d")
async def generate_3d(
    file: UploadFile | None = File(default=None),
    files: List[UploadFile] = File(default=[]),
    _=Header(default="", alias="X-ML-Token"),
):
    """Generates a high quality 3D GLB model from product image(s).

    Uses TencentARC/InstantMesh for multi-view textured 3D mesh reconstruction,
    with TripoSR and alpha-cutout silhouette 3D fallbacks.
    """
    all_images: List[bytes] = []

    for f in files:
        data = await f.read()
        if data:
            all_images.append(data)

    if file is not None:
        data = await file.read()
        if data:
            all_images.append(data)

    if not all_images:
        raise HTTPException(400, "No image files provided")

    primary_img = all_images[0]

    # 1. Try TencentARC/InstantMesh for high-fidelity textured 3D mesh
    instantmesh_glb = generate_instantmesh_3d(primary_img)
    if instantmesh_glb:
        return Response(content=instantmesh_glb, media_type="model/gltf-binary")

    # 2. Try Hugging Face TripoSR
    triposr_glb = await generate_triposr_3d(primary_img)
    if triposr_glb:
        return Response(content=triposr_glb, media_type="model/gltf-binary")

    # 3. Fallback: Multi-view or Clean 3D silhouette cutout
    if len(all_images) > 1:
        try:
            multiview_glb = generate_multiview_3d(all_images)
            if multiview_glb:
                return Response(content=multiview_glb, media_type="model/gltf-binary")
        except Exception:
            pass

    cutout_glb = generate_cutout_3d(primary_img)
    return Response(content=cutout_glb, media_type="model/gltf-binary")


@app.post("/transcribe")
def transcribe(
    file: UploadFile = File(...),
    lang: str = Form("hi"),
    _=Header(default="", alias="X-ML-Token"),
):
    data = file.file.read()
    if not data:
        raise HTTPException(400, "Empty file")

    suffix = os.path.splitext(file.filename or "")[1] or ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name

    try:
        segments, info = get_whisper().transcribe(
            path,
            language=None if lang in ("", "auto") else lang,
            vad_filter=True,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    finally:
        os.unlink(path)

    return {
        "text": text,
        "engine": "faster-whisper",
        "language": getattr(info, "language", None) or lang,
    }