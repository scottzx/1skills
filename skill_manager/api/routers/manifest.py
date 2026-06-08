"""
Manifest endpoint — exposes 1skills' navigation surface as a `ModuleManifest`
JSON for the host (1agents main app).

The host reads this to render counts in the unified sidebar and to know
which routes the iframe can display. The contract is the same one defined
in the host's `html/src/modules/module-types.ts` — this endpoint is the
Python-side producer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from skill_manager.application import BackendContainer
from skill_manager.api.deps import get_container

router = APIRouter(prefix="/api")


@router.get("/manifest")
def get_manifest(container: BackendContainer = Depends(get_container)) -> dict[str, object]:
    """Return the live module manifest with up-to-date counts."""
    skills_page = container.skills_queries.list_skills()
    summary = skills_page.get("summary", {}) if isinstance(skills_page, dict) else {}
    in_use_skills = int(summary.get("managed", 0)) if isinstance(summary, dict) else 0
    needs_review_skills = int(summary.get("unmanaged", 0)) if isinstance(summary, dict) else 0

    mcp_payload = container.mcp_queries.list_servers()
    mcp_managed = 0
    mcp_unmanaged = 0
    if isinstance(mcp_payload, dict):
        mcp_managed = len(mcp_payload.get("managed", []) or [])
        # Unmanaged entries may be under different keys depending on schema; fall back to 0.

    slash_payload = container.slash_command_queries.list_commands()
    slash_total = 0
    slash_review = 0
    if isinstance(slash_payload, dict):
        commands = slash_payload.get("commands") or []
        slash_total = len(commands) if isinstance(commands, list) else 0
        review_cmds = slash_payload.get("reviewCommands") or []
        slash_review = len(review_cmds) if isinstance(review_cmds, list) else 0

    return {
        "moduleId": "skills",
        "version": 1,
        "entryPath": "/overview",
        "topLinks": [
            {"key": "overview", "to": "/overview", "label": "概览", "iconKey": "overview"},
        ],
        "groups": [
            {
                "key": "skills",
                "label": "技能",
                "iconKey": "skills",
                "count": in_use_skills + needs_review_skills,
                "links": [
                    {
                        "key": "skills-use",
                        "to": "/skills/use",
                        "label": "使用中",
                        "count": in_use_skills,
                    },
                    {
                        "key": "skills-review",
                        "to": "/skills/review",
                        "label": "待审阅",
                        "count": needs_review_skills,
                        "badge": "review",
                    },
                    {
                        "key": "skills-scan-config",
                        "to": "/scan-config",
                        "label": "扫描配置",
                    },
                ],
            },
            {
                "key": "slash-commands",
                "label": "Slash 命令",
                "iconKey": "slash-commands",
                "count": slash_total,
                "links": [
                    {
                        "key": "slash-commands-use",
                        "to": "/slash-commands/use",
                        "label": "使用中",
                        "count": slash_total,
                    },
                    {
                        "key": "slash-commands-review",
                        "to": "/slash-commands/review",
                        "label": "待审阅",
                        "count": slash_review,
                        "badge": "review",
                    },
                ],
            },
            {
                "key": "mcp",
                "label": "MCP",
                "iconKey": "mcp",
                "count": mcp_managed + mcp_unmanaged,
                "links": [
                    {
                        "key": "mcp-use",
                        "to": "/mcp/use",
                        "label": "使用中",
                        "count": mcp_managed,
                    },
                    {
                        "key": "mcp-review",
                        "to": "/mcp/review",
                        "label": "待审阅",
                        "count": mcp_unmanaged,
                        "badge": "review",
                    },
                ],
            },
            {
                "key": "marketplace",
                "label": "市场",
                "iconKey": "marketplace",
                "links": [
                    {"key": "marketplace-skills", "to": "/marketplace", "label": "技能"},
                    {"key": "marketplace-mcp", "to": "/marketplace/mcp", "label": "MCP"},
                    {"key": "marketplace-clis", "to": "/marketplace/clis", "label": "CLI"},
                ],
            },
        ],
        "headerActions": [
            {"key": "refresh", "label": "刷新", "iconKey": "refresh"},
        ],
    }
