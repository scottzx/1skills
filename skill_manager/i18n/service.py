from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class TranslationService:
    def __init__(self, locales_dir: Path) -> None:
        self._messages: dict[str, dict[str, Any]] = {}
        for file_path in locales_dir.glob("*.json"):
            lang = file_path.stem
            self._messages[lang] = json.loads(file_path.read_text(encoding="utf-8"))

    def translate(self, key: str, lang: str, **kwargs: Any) -> str:
        messages = self._messages.get(lang) or self._messages.get("en", {})
        parts = key.split(".")
        value: Any = messages
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part, key)
            else:
                return key
        if isinstance(value, str):
            return value.format(**kwargs) if kwargs else value
        return key

    @property
    def supported_languages(self) -> list[str]:
        return list(self._messages.keys())