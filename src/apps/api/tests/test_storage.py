"""
Storage backend behaviour.

The Cloudinary resource_type mapping is asserted here because it is the kind of
detail that is easy to get wrong and hard to debug later: audio uploads as
"video", not "raw".
"""
from __future__ import annotations

import pytest

from app.errors import AppError
from app.services import storage as storage_service


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        ("image_raw", "image"),
        ("image_enhanced", "image"),
        ("mockup", "image"),
        ("card", "image"),
        # Cloudinary treats audio as a degenerate video so it can transcode it.
        ("audio", "video"),
        ("video", "video"),
        ("glb", "raw"),
    ],
)
def test_resource_type_mapping(kind, expected):
    assert storage_service.resource_type_for(kind) == expected


def test_size_caps_follow_the_free_plan():
    assert storage_service.max_bytes_for("image_raw") == 10 * 1024 * 1024
    assert storage_service.max_bytes_for("glb") == 10 * 1024 * 1024
    assert storage_service.max_bytes_for("video") == 100 * 1024 * 1024
    # Audio maps to video, so it gets the generous cap.
    assert storage_service.max_bytes_for("audio") == 100 * 1024 * 1024


def test_oversize_upload_raises_a_readable_error():
    with pytest.raises(AppError) as exc:
        storage_service.check_size(b"0" * (11 * 1024 * 1024), "image_raw")
    assert exc.value.code == "FILE_TOO_LARGE"
    assert exc.value.status == 413
    assert "11.0 MB" in exc.value.message


def test_local_backend_round_trip(local_storage):
    key = local_storage.put(b"hello artisan", prefix="image_raw/x", ext="jpg",
                            kind="image_raw", content_type="image/jpeg")
    assert local_storage.get(key) == b"hello artisan"
    assert key.endswith(".jpg")

    local_storage.delete(key)
    with pytest.raises(AppError):
        local_storage.get(key)


def test_local_backend_refuses_path_traversal(local_storage):
    """A key like ../../.env must not escape the media root."""
    with pytest.raises(AppError):
        local_storage.get("../../../.env")


def test_local_url_uses_the_configured_public_base(local_storage, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "local_storage_public_base",
                        "http://192.168.1.40:8000", raising=False)
    url = local_storage.url("image_raw/abc/def.jpg")
    # Must be an absolute URL: the phone cannot resolve a relative path.
    assert url == "http://192.168.1.40:8000/media/local/image_raw/abc/def.jpg"


def test_unknown_backend_is_a_config_error(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "storage_backend", "dropbox", raising=False)
    storage_service.reset_storage()
    try:
        with pytest.raises(AppError) as exc:
            storage_service.get_storage()
        assert exc.value.code == "CONFIG_ERROR"
    finally:
        storage_service.reset_storage()
