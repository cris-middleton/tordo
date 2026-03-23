"""
Storage abstraction — LocalStorageService (dev) or S3StorageService (prod).

Usage:
    storage = get_storage_service()
    key = storage.upload(file_bytes, "empresas/123/contrato.pdf", "application/pdf")
    url  = storage.get_download_url(key)
    storage.delete(key)
"""
from __future__ import annotations

import os
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from app.config import settings


@dataclass
class StoredFile:
    key: str       # storage key (relative path or S3 object key)
    bucket: str    # bucket name or LOCAL_STORAGE_PATH root
    size_bytes: int


class StorageService(ABC):
    @abstractmethod
    def upload(self, file_bytes: bytes, key: str, mime_type: str | None = None) -> StoredFile:
        """Persist bytes at `key` and return StoredFile metadata."""

    @abstractmethod
    def get_download_url(self, key: str) -> str:
        """Return a URL/path to download the file. May be a presigned URL or local path."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove the file from storage (best-effort, no error if missing)."""


class LocalStorageService(StorageService):
    """Stores files on the local filesystem. Intended for development only."""

    def __init__(self, base_path: str) -> None:
        self.base = Path(base_path)
        self.base.mkdir(parents=True, exist_ok=True)

    def upload(self, file_bytes: bytes, key: str, mime_type: str | None = None) -> StoredFile:
        dest = self.base / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(file_bytes)
        return StoredFile(key=key, bucket=str(self.base), size_bytes=len(file_bytes))

    def get_download_url(self, key: str) -> str:
        # The API serves local files via /api/files/{key} (registered in main.py)
        return f"/api/files/{key}"

    def delete(self, key: str) -> None:
        target = self.base / key
        if target.exists():
            target.unlink()


class S3StorageService(StorageService):
    """
    Stores files in AWS S3 or any S3-compatible endpoint (MinIO in dev).

    Set S3_ENDPOINT_URL=http://minio:9000 to point at a local MinIO instance.
    Set S3_ENDPOINT_URL_PUBLIC=http://localhost:9000 so presigned URLs are
    reachable from the browser (may differ from the internal Docker hostname).
    """

    def __init__(self, bucket: str, region: str, endpoint_url: str | None = None, endpoint_url_public: str | None = None) -> None:
        self.bucket = bucket
        self.region = region
        self.endpoint_url = endpoint_url            # internal URL (used for upload/delete)
        self.endpoint_url_public = endpoint_url_public or endpoint_url  # browser-facing URL

    def _client(self, public: bool = False):  # type: ignore[return]
        import boto3  # lazy import — not required in dev
        endpoint = self.endpoint_url_public if public else self.endpoint_url
        kwargs: dict = {"region_name": self.region}
        if endpoint:
            kwargs["endpoint_url"] = endpoint
        return boto3.client("s3", **kwargs)

    def upload(self, file_bytes: bytes, key: str, mime_type: str | None = None) -> StoredFile:
        import io
        extra = {"ContentType": mime_type} if mime_type else {}
        self._client().upload_fileobj(io.BytesIO(file_bytes), self.bucket, key, ExtraArgs=extra)
        return StoredFile(key=key, bucket=self.bucket, size_bytes=len(file_bytes))

    def get_download_url(self, key: str, expiry: int = 3600) -> str:
        return self._client(public=True).generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expiry,
        )

    def delete(self, key: str) -> None:
        try:
            self._client().delete_object(Bucket=self.bucket, Key=key)
        except Exception:
            pass


def make_document_key(empresa_id: str, filename: str) -> str:
    """Generate a unique storage key for a company document."""
    safe_name = Path(filename).name  # strip directory traversal
    uid = uuid.uuid4().hex[:8]
    return f"empresas/{empresa_id}/{uid}_{safe_name}"


def get_storage_service() -> StorageService:
    """Factory — returns the configured storage backend."""
    if settings.storage_backend == "s3":
        if not settings.aws_bucket:
            raise RuntimeError("AWS_BUCKET must be set when STORAGE_BACKEND=s3")
        return S3StorageService(
            bucket=settings.aws_bucket,
            region=settings.aws_region,
            endpoint_url=settings.s3_endpoint_url,
            endpoint_url_public=settings.s3_endpoint_url_public,
        )
    return LocalStorageService(base_path=settings.local_storage_path)
