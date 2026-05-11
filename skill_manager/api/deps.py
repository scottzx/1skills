from __future__ import annotations

from pathlib import Path

from fastapi import Request

from skill_manager.application import BackendContainer


def get_container(request: Request) -> BackendContainer:
    return request.app.state.container  # type: ignore[no-any-return]


def get_frontend_dist(request: Request) -> Path | None:
    return request.app.state.frontend_dist  # type: ignore[no-any-return]


def get_language(request: Request) -> str:
    """Detect the request language from Accept-Language header."""
    accept_lang = request.headers.get("Accept-Language", "en")
    primary = accept_lang.split(",")[0].split(";")[0].strip()
    if primary.startswith("zh"):
        return "zh-CN"
    return "en"
