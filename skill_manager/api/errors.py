from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from skill_manager.errors import MARKETPLACE_UNAVAILABLE_MESSAGE, MarketplaceUpstreamError, MutationError


def _get_lang(request: Request) -> str:
    accept_lang = request.headers.get("Accept-Language", "en")
    primary = accept_lang.split(",")[0].split(";")[0].strip()
    if primary.startswith("zh"):
        return "zh-CN"
    return "en"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def handle_http_error(request: Request, exc: HTTPException) -> JSONResponse:
        lang = _get_lang(request)
        translator = request.app.state.translator
        if isinstance(exc.detail, str):
            message = translator.translate("errors.requestFailed", lang)
            for key_suffix, template_key in [
                ("unknown skill ref", "errors.unknownSkillRef"),
                ("unknown slash command", "errors.unknownSlashCommand"),
                ("unknown marketplace item", "errors.unknownMarketplaceItem"),
                ("unknown MCP server", "errors.unknownMcpServer"),
                ("unknown CLI", "errors.unknownCLI"),
            ]:
                if key_suffix in str(exc.detail):
                    message = str(exc.detail)
                    break
            else:
                if str(exc.detail) != message:
                    message = str(exc.detail)
        else:
            message = translator.translate("errors.requestFailed", lang)
        return JSONResponse(status_code=exc.status_code, content={"error": message})

    @app.exception_handler(MutationError)
    async def handle_mutation_error(request: Request, exc: MutationError) -> JSONResponse:
        lang = _get_lang(request)
        translator = request.app.state.translator
        message = str(exc)
        if message == MARKETPLACE_UNAVAILABLE_MESSAGE:
            message = translator.translate("marketplace.unavailable", lang)
        return JSONResponse(status_code=exc.status, content={"error": message})

    @app.exception_handler(MarketplaceUpstreamError)
    async def handle_marketplace_upstream_error(request: Request, exc: MarketplaceUpstreamError) -> JSONResponse:
        lang = _get_lang(request)
        translator = request.app.state.translator
        return JSONResponse(
            status_code=exc.status,
            content={"error": translator.translate("marketplace.unavailable", lang)},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        lang = _get_lang(request)
        translator = request.app.state.translator
        errors = exc.errors()
        if not errors:
            return JSONResponse(
                status_code=422,
                content={"error": translator.translate("errors.invalidRequest", lang)},
            )
        first = errors[0]
        msg = first.get("msg", "Invalid request.") if isinstance(first, dict) else "Invalid request."
        loc = first.get("loc", ()) if isinstance(first, dict) else ()
        field_path = ".".join(str(part) for part in loc if part != "body")
        if field_path:
            message = translator.translate("errors.fieldValidation", lang, field_path=field_path, msg=msg)
        else:
            message = msg
        return JSONResponse(status_code=422, content={"error": message})
