import re

with open("apps/api/app/routers/media.py", "r") as f:
    content = f.read()

new_code = """
import httpx

@router.post("/{media_id}/enhance", response_model=MediaUploadOut, status_code=201)
async def enhance_media(
    media_id: uuid.UUID,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    media = await db.scalar(
        select(Media).where(Media.id == media_id, Media.artisan_id == artisan.id)
    )
    if not media:
        raise AppError("NOT_FOUND", "Media not found", 404)
        
    if media.kind != "image_raw":
        raise AppError("BAD_REQUEST", "Only image_raw can be enhanced", 400)

    # 1. Fetch original image bytes
    backend = storage_service.get_storage()
    try:
        data = backend.get(media.storage_key)
    except Exception as e:
        raise AppError("STORAGE_ERROR", "Could not read original media", 502)

    # 2. Call ML service
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            headers = {"X-ML-Token": settings.ml_service_token} if settings.ml_service_token else {}
            # We send as multipart
            files = {"file": ("image.jpg", data, media.mime or "image/jpeg")}
            res = await client.post(f"{settings.ml_service_url.rstrip('/')}/enhance", files=files, headers=headers)
            
            if res.status_code != 200:
                raise AppError("ML_ERROR", f"ML enhancement failed: {res.text}", 502)
                
            enhanced_bytes = res.content
    except httpx.RequestError as e:
        raise AppError("ML_ERROR", f"ML service unreachable: {e}", 502)

    # 3. Store enhanced image
    new_kind = "image_enhanced"
    new_mime = "image/jpeg"
    new_ext = "jpg"
    
    new_key = backend.put(
        enhanced_bytes,
        prefix=f"{new_kind}/{artisan.id}",
        ext=new_ext,
        kind=new_kind,
        content_type=new_mime,
    )
    
    width, height = _image_dimensions(enhanced_bytes)
    
    enhanced_media = Media(
        artisan_id=artisan.id,
        kind=new_kind,
        storage_key=new_key,
        storage_backend=backend.name,
        mime=new_mime,
        width=width,
        height=height,
        parent_id=media.id,
        meta={"size_bytes": len(enhanced_bytes)},
    )
    db.add(enhanced_media)
    await db.flush()
    await db.refresh(enhanced_media)

    return MediaUploadOut(
        id=enhanced_media.id,
        kind=enhanced_media.kind,
        url=backend.url(new_key, new_kind),
        mime=new_mime,
        width=width,
        height=height,
        size_bytes=len(enhanced_bytes),
    )

"""

# Insert before the serve_local route
content = content.replace("@router.get(\"/local/{key:path}\"", new_code + "\n@router.get(\"/local/{key:path}\"")
with open("apps/api/app/routers/media.py", "w") as f:
    f.write(content)

