import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderPlus, Plus, X } from "lucide-react";

import { applyImport, scanImportFolders } from "../../api/import-client";
import type { ImportFolderDto } from "../../api/import-types";
import { invalidateSkillsQueries } from "../../api/invalidation";
import { useSkillsCopy } from "../../i18n";
import { useToast } from "../../../../components/Toast";
import { usePortalContainer } from "../../../../lib/portal-container";

interface ImportFolderModalProps {
  open: boolean;
  onClose: () => void;
}

export function ImportFolderModal({ open, onClose }: ImportFolderModalProps) {
  const copy = useSkillsCopy().inUse.importModal;
  const { toast } = useToast();
  const portalContainer = usePortalContainer();
  const queryClient = useQueryClient();

  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const scan = useQuery({
    queryKey: ["skills", "import-scan", customFolders],
    queryFn: () => scanImportFolders(customFolders),
    enabled: open,
    staleTime: 0,
  });

  const folders = scan.data?.folders ?? [];
  const importable = useMemo(
    () => folders.flatMap((f) => f.skills.filter((s) => !s.inStore).map((s) => s.sourcePath)),
    [folders],
  );

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleFolder = (folder: ImportFolderDto) => {
    const paths = folder.skills.filter((s) => !s.inStore).map((s) => s.sourcePath);
    const allSelected = paths.length > 0 && paths.every((p) => selected.has(p));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of paths) {
        if (allSelected) next.delete(p);
        else next.add(p);
      }
      return next;
    });
  };

  const addFolder = () => {
    const trimmed = newFolder.trim();
    if (!trimmed || customFolders.includes(trimmed)) {
      setNewFolder("");
      return;
    }
    setCustomFolders((prev) => [...prev, trimmed]);
    setNewFolder("");
  };

  const removeFolder = (path: string) => {
    setCustomFolders((prev) => prev.filter((f) => f !== path));
  };

  const importMutation = useMutation({
    mutationFn: () => applyImport([...selected]),
    onSuccess: async (result) => {
      await invalidateSkillsQueries(queryClient);
      await scan.refetch();
      setSelected(new Set());
      toast(copy.importedToast(result.imported.length));
      if (result.failures.length > 0) {
        toast(copy.failedToast);
      }
      if (result.failures.length === 0) {
        onClose();
      }
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : copy.failedToast);
    },
  });

  const selectedCount = selected.size;
  const hasAnyImportable = importable.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <Dialog.Portal container={portalContainer || undefined}>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="import-modal" aria-describedby={undefined}>
          <Dialog.Title className="import-modal__title">
            <FolderPlus size={18} />
            {copy.title}
          </Dialog.Title>
          <Dialog.Description className="import-modal__desc">{copy.description}</Dialog.Description>
          <Dialog.Close asChild>
            <button type="button" className="import-modal__close" aria-label={copy.cancel}>
              <X size={18} />
            </button>
          </Dialog.Close>

          <div className="import-modal__addrow">
            <input
              type="text"
              className="import-modal__input"
              value={newFolder}
              placeholder={copy.addFolderPlaceholder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFolder();
                }
              }}
              aria-label={copy.addFolderLabel}
            />
            <button type="button" className="import-modal__addbtn" onClick={addFolder}>
              <Plus size={14} />
              {copy.add}
            </button>
          </div>

          <div className="import-modal__body">
            {scan.isLoading ? (
              <p className="import-modal__hint">{copy.scanning}</p>
            ) : scan.isError ? (
              <p className="import-modal__hint import-modal__hint--error">{copy.loadError}</p>
            ) : folders.length === 0 || folders.every((f) => f.skills.length === 0 && !f.error) ? (
              <p className="import-modal__hint">{copy.emptyAll}</p>
            ) : (
              folders.map((folder) => (
                <FolderSection
                  key={folder.path}
                  folder={folder}
                  selected={selected}
                  onToggleSkill={toggle}
                  onToggleFolder={() => toggleFolder(folder)}
                  onRemove={folder.isDefault ? undefined : () => removeFolder(folder.path)}
                  copy={copy}
                />
              ))
            )}
          </div>

          <div className="import-modal__footer">
            <Dialog.Close asChild>
              <button type="button" className="import-modal__cancel">
                {copy.cancel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="import-modal__import"
              disabled={selectedCount === 0 || importMutation.isPending || !hasAnyImportable}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? copy.importing : copy.importSelected(selectedCount)}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface FolderSectionProps {
  folder: ImportFolderDto;
  selected: Set<string>;
  onToggleSkill: (path: string) => void;
  onToggleFolder: () => void;
  onRemove?: () => void;
  copy: ReturnType<typeof useSkillsCopy>["inUse"]["importModal"];
}

function FolderSection({
  folder,
  selected,
  onToggleSkill,
  onToggleFolder,
  onRemove,
  copy,
}: FolderSectionProps) {
  const importableSkills = folder.skills.filter((s) => !s.inStore);
  const hasImportable = importableSkills.length > 0;

  return (
    <section className="import-folder">
      <header className="import-folder__head">
        <div className="import-folder__path" title={folder.path}>
          {folder.displayPath}
        </div>
        <div className="import-folder__meta">
          {folder.linkedCount > 0 ? (
            <span className="import-folder__note">{copy.linkedSkipped(folder.linkedCount)}</span>
          ) : null}
          {hasImportable ? (
            <button type="button" className="import-folder__selectall" onClick={onToggleFolder}>
              {copy.selectAll}
            </button>
          ) : null}
          {onRemove ? (
            <button type="button" className="import-folder__remove" onClick={onRemove} aria-label={copy.remove}>
              <X size={14} />
            </button>
          ) : null}
        </div>
      </header>

      {!folder.exists ? (
        <p className="import-folder__empty">{copy.folderMissing}</p>
      ) : folder.error ? (
        <p className="import-folder__empty">{folder.error}</p>
      ) : folder.skills.length === 0 ? (
        <p className="import-folder__empty">{copy.folderEmpty}</p>
      ) : (
        <ul className="import-folder__list">
          {folder.skills.map((skill) => {
            const isSelected = selected.has(skill.sourcePath);
            return (
              <li
                key={skill.sourcePath}
                className={`import-skill${skill.inStore ? " import-skill--disabled" : ""}${
                  isSelected ? " import-skill--selected" : ""
                }`}
              >
                <label className="import-skill__label">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={skill.inStore}
                    onChange={() => onToggleSkill(skill.sourcePath)}
                  />
                  <span className="import-skill__name">{skill.name}</span>
                  {skill.description ? (
                    <span className="import-skill__desc">{skill.description}</span>
                  ) : null}
                </label>
                {skill.inStore ? (
                  <span className="import-skill__badge">
                    <Check size={12} />
                    {copy.alreadyImported}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
