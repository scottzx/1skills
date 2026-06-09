from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from skill_manager.application import BackendContainer

from .errors import install_error_handlers
from .routers import health, manifest, marketplace, mcp, scan, settings, skills, slash_commands

# SPA caching: hashed assets are content-addressed, so they can be cached
# forever. The HTML entry point must always be revalidated, otherwise a
# browser with a stale index.html will request assets whose hash no longer
# exists on disk — the SPA fallback would then return index.html as JS and
# the module loader rejects it with "Expected a JavaScript-or-Wasm module
# script" (MIME type "text/html").
_IMMUTABLE_ASSET_CACHE = "public, max-age=31536000, immutable"
_NO_CACHE_HTML = "no-cache, must-revalidate"

_ASSET_EXTENSIONS = {
    ".js", ".mjs", ".css", ".svg", ".png", ".jpg", ".jpeg",
    ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".otf",
    ".map", ".json", ".txt", ".webmanifest",
}


def _looks_like_asset(path: str) -> bool:
    dot = path.rfind(".")
    slash = path.rfind("/")
    return dot > slash and dot != -1 and path[dot:].lower() in _ASSET_EXTENSIONS


def create_app(
    container: BackendContainer,
    *,
    frontend_dist: Path | None = None,
) -> FastAPI:
    app = FastAPI(title="skill-manager", docs_url=None, redoc_url=None, openapi_url="/api/openapi.json")
    app.state.container = container
    app.state.frontend_dist = frontend_dist if frontend_dist is not None and frontend_dist.exists() else None
    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(manifest.router)
    app.include_router(settings.router)
    app.include_router(skills.router)
    app.include_router(slash_commands.router)
    app.include_router(marketplace.router)
    app.include_router(mcp.router)
    app.include_router(scan.router)

    @app.get("/{full_path:path}", include_in_schema=False, response_model=None)
    def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"error": f"unknown api path: /{full_path}"})
        dist = app.state.frontend_dist
        if dist is None:
            return HTMLResponse("<html><body><h1>skill-manager</h1><p>Frontend build missing.</p></body></html>")

        requested = (dist / full_path).resolve() if full_path else dist / "index.html"
        dist_root = dist.resolve()
        if full_path and str(requested).startswith(str(dist_root)) and requested.exists() and requested.is_file():
            # Hashed assets are content-addressed — safe to cache forever.
            # Anything in /assets/ is built by Vite and content-hashed;
            # anything else (favicon, etc.) gets the no-cache policy.
            cache = _IMMUTABLE_ASSET_CACHE if full_path.startswith("assets/") else _NO_CACHE_HTML
            return FileResponse(requested, headers={"Cache-Control": cache})

        # Asset path that no longer exists on disk (stale hash from a prior
        # build). Don't return index.html — that triggers "text/html" MIME
        # errors in the module loader. Return 404 so the browser can move on.
        if _looks_like_asset(full_path):
            return HTMLResponse(status_code=404, content="not found")

        # Route paths without an extension are SPA routes — fall back to
        # index.html. Cache-Control: no-cache so the next reload picks up
        # the latest hashed asset URLs.
        index_path = dist / "index.html"
        if index_path.exists():
            return FileResponse(index_path, headers={"Cache-Control": _NO_CACHE_HTML})
        return HTMLResponse("<html><body><h1>skill-manager</h1><p>Frontend build missing.</p></body></html>", status_code=404)

    return app
