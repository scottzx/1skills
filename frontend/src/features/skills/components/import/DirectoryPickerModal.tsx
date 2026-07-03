import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Folder, Home } from "lucide-react";

import { Modal } from "../../../../components/ui/Modal";
import { listDirectories } from "../../api/import-client";
import { useSkillsCopy } from "../../i18n";

interface DirectoryPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

/**
 * A lightweight folder-tree picker: lists sub-directories via the 1agents Go
 * server (list-directories) and lets the user navigate and pick a folder to
 * feed into the import scan. Mirrors the 1agents DirPickerModal, scoped down.
 */
export function DirectoryPickerModal({ open, onClose, onSelect }: DirectoryPickerModalProps) {
  const copy = useSkillsCopy().inUse.importModal.picker;
  const [path, setPath] = useState("~");
  const [input, setInput] = useState("~");

  // Reset to home each time the picker opens.
  useEffect(() => {
    if (open) {
      setPath("~");
      setInput("~");
    }
  }, [open]);

  const dirs = useQuery({
    queryKey: ["skills", "list-directories", path],
    queryFn: () => listDirectories(path),
    enabled: open,
    staleTime: 0,
  });

  const currentPath = dirs.data?.currentPath ?? path;

  const go = (next: string) => {
    setPath(next);
    setInput(next);
  };

  const goParent = () => {
    const trimmed = currentPath.replace(/\/+$/, "");
    const parent = trimmed.slice(0, trimmed.lastIndexOf("/")) || "/";
    go(parent);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={copy.title}
      size="md"
      footer={
        <div className="dialog-actions">
          <button
            type="button"
            className="btn confirm-dialog__button confirm-dialog__button--cancel"
            onClick={onClose}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className="btn confirm-dialog__button confirm-dialog__button--primary"
            onClick={() => {
              onSelect(currentPath);
              onClose();
            }}
          >
            {copy.select}
          </button>
        </div>
      }
    >
      <div className="dirpick-toolbar">
        <button type="button" className="dirpick-iconbtn" onClick={() => go("~")} aria-label={copy.home}>
          <Home size={15} />
        </button>
        <button type="button" className="dirpick-iconbtn" onClick={goParent} aria-label={copy.parent}>
          <ArrowUp size={15} />
        </button>
        <input
          type="text"
          className="import-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go(input.trim() || "~");
            }
          }}
          aria-label={copy.pathLabel}
        />
      </div>

      <div className="dirpick-list">
        {dirs.isLoading ? (
          <p className="import-hint">{copy.loading}</p>
        ) : dirs.isError ? (
          <p className="import-hint import-hint--error">{copy.error}</p>
        ) : (dirs.data?.directories.length ?? 0) === 0 ? (
          <p className="import-hint">{copy.empty}</p>
        ) : (
          dirs.data!.directories.map((dir) => (
            <button
              key={dir.path}
              type="button"
              className="dirpick-item"
              onClick={() => go(dir.path)}
              title={dir.path}
            >
              <Folder size={15} />
              <span className="dirpick-item__name">{dir.name}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
