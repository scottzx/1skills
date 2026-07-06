export {
  useDeleteSkillMutation,
  useManageAllSkillsMutation,
  useManageSkillMutation,
  usePendingConflictsQuery,
  useSetSkillHarnessesMutation,
  useSkillDetailQuery,
  useSkillsListQuery,
  useSkillSourceStatusQuery,
  useToggleSkillMutation,
  useUnmanageSkillMutation,
  useUpdateSkillMutation,
} from "./api/queries";
export { invalidateSkillsQueries } from "./api/invalidation";
export { skillsKeys } from "./api/keys";
export type {
  HarnessCell,
  HarnessColumn,
  SkillListRow,
  SkillsWorkspaceData,
} from "./model/types";

export const skillsRoutes = {
  inUse: "/skills/use",
  needsReview: "/skills/review",
  conflicts: "/skills/conflicts",
  scanConfig: "/scan-config",
  marketplace: "/marketplace/skills",
} as const;
