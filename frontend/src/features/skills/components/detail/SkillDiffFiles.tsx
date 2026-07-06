import type { useSkillsCopy } from "../../i18n";
import type { SkillDiffFile, SkillDiffFileStatus } from "../../api/types";

export function SkillDiffFileBlock({
  file,
  copy,
}: {
  file: SkillDiffFile;
  copy: ReturnType<typeof useSkillsCopy>["versioning"];
}) {
  return (
    <div className="skill-diff-file">
      <div className="skill-diff-file__header">
        <span className="skill-diff-file__path">{file.path}</span>
        <span className={`skill-diff-file__status skill-diff-file__status--${file.status}`}>
          {diffStatusLabel(file.status, copy)}
        </span>
      </div>
      {file.diff ? (
        <pre className="skill-diff-file__body">
          {file.diff.split("\n").map((line, index) => (
            <div key={index} className={`skill-diff-line ${diffLineClassName(line)}`}>
              {line}
            </div>
          ))}
        </pre>
      ) : (
        <p className="skill-versions__empty">{copy.noChanges}</p>
      )}
    </div>
  );
}

function diffLineClassName(line: string): string {
  if (line.startsWith("@@")) return "skill-diff-line--hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "skill-diff-line--meta";
  if (line.startsWith("+")) return "skill-diff-line--add";
  if (line.startsWith("-")) return "skill-diff-line--del";
  return "skill-diff-line--ctx";
}

function diffStatusLabel(status: SkillDiffFileStatus, copy: ReturnType<typeof useSkillsCopy>["versioning"]): string {
  switch (status) {
    case "added":
      return copy.statusAdded;
    case "removed":
      return copy.statusRemoved;
    case "modified":
      return copy.statusModified;
    default:
      return status;
  }
}
