from __future__ import annotations

from pathlib import Path

from skill_manager.errors import MutationError

from ..skills.document_utils import strip_frontmatter
from ..skills.identity import SourceDescriptor
from .inventory import AgentInventory, InventoryEntry
from .package import AgentParseError, parse_agent_file
from .presenters import agent_detail_payload, agents_page_payload, source_status_payload
from .read_models import AgentsReadModelService


class AgentsQueryService:
    def __init__(self, read_models: AgentsReadModelService) -> None:
        self.read_models = read_models

    def health(self) -> dict[str, object]:
        snapshot = self.read_models.snapshot()
        return {
            "ok": True,
            "app": "skill-manager",
            "readOnly": False,
            "harnessCount": len(snapshot.harness_scans),
        }

    def list_agents(self) -> dict[str, object]:
        return agents_page_payload(self.inventory())

    def get_agent_detail(self, agent_ref: str) -> dict[str, object] | None:
        inventory = self.inventory()
        entry = inventory.find(agent_ref)
        if entry is None:
            return None
        agent_file = self.resolve_detail_agent_file(entry)
        return agent_detail_payload(
            entry,
            columns=inventory.columns,
            document_markdown=_read_agent_body(agent_file),
            source_links=None,
        )

    def get_agent_source_status(self, agent_ref: str) -> dict[str, object] | None:
        entry = self.inventory().find(agent_ref)
        if entry is None:
            return None
        # Agents have no upstream source, so there is never an update available.
        return source_status_payload(None)

    def agent_status_from_path(self, agent_ref: str, source_path: str) -> dict[str, object]:
        """Read-only status of a workspace's own agent copy at source_path, keyed
        by its file name (from agent_ref). Mirrors ``skill_status_from_path`` but
        for a single ``<name>.md`` file:

        - inStore=False → a custom / local-only agent the user dropped into the
          workspace; a push would *create* it (differs=True by convention).
        - inStore=True, differs=True/False → a store-backed agent, modified or
          in-sync with its baseline.
        """
        package_dir = Path(agent_ref.rsplit(":", 1)[-1]).name
        src = Path(source_path)
        src_exists = src.is_file()
        name, description = Path(package_dir).stem, ""
        if src_exists:
            try:
                pkg = parse_agent_file(
                    src,
                    default_source=SourceDescriptor(kind="workspace", locator=f"workspace:{package_dir}"),
                )
                name = pkg.declared_name or name
                description = pkg.description
            except AgentParseError:
                pass
        store = self.read_models.store
        store_file = store.root / package_dir
        in_store = store_file.is_file()
        differs = True
        if in_store and src_exists:
            differs = store.differs_from(package_dir, src)
        return {
            "inStore": in_store,
            "differs": differs,
            "exists": src_exists,
            "name": name,
            "description": description,
        }

    def inventory(self) -> AgentInventory:
        snapshot = self.read_models.snapshot()
        return AgentInventory.from_snapshot(
            store_scan=snapshot.store_scan,
            harness_scans=self.read_models.visible_scans(snapshot),
        )

    def require_entry(self, agent_ref: str) -> InventoryEntry:
        entry = self.inventory().find(agent_ref)
        if entry is None:
            raise MutationError(f"unknown agent ref: {agent_ref}", status=404)
        return entry

    def resolve_detail_agent_file(self, entry: InventoryEntry) -> Path | None:
        if entry.package_path is not None and entry.package_path.is_file():
            return entry.package_path
        for sighting in entry.detail_sightings():
            if sighting.path is not None and sighting.path.is_file():
                return sighting.path
        return None


def _read_agent_body(agent_file: Path | None) -> str | None:
    if agent_file is None or not agent_file.is_file():
        return None
    document = agent_file.read_text(encoding="utf-8").strip()
    if not document:
        return None
    return strip_frontmatter(document)
