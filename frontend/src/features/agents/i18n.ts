import { useLocalizedCopy, type CopyShape, type LocalizedCopy } from "../../i18n";

const englishAgentsCopy = {
  inUse: {
    title: "Agents in use",
    viewModeAria: "Agents in use view mode",
    searchPlaceholder: "Search by name, tag, description...",
    searchLabel: "Search agents in use",
    loading: "Loading agents in use",
    unableToLoad: "Unable to load agents in use.",
    emptyTitle: "No agents in use yet",
    emptyBody:
      "Review local agent files or install something from the marketplace to start controlling harness coverage here.",
    filterAria: (label: string) => `Filter: ${label}`,
    pills: {
      all: "All",
      enabled: "Enabled",
      allHarnesses: "Enabled on all",
      off: "Off",
    },
    viewModes: {
      grid: "Grid",
      board: "Board",
      matrix: "Matrix",
    },
  },
  review: {
    title: "Agents to review",
    subtitle: (count: number) =>
      count > 0
        ? `${count} agent${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} a review decision.`
        : "No local agent files need review across your harnesses.",
    adoptAllEligible: "Adopt all eligible",
    adoptingAllAgents: "Adopting all agents",
    searchPlaceholder: "Search agents to review...",
    searchLabel: "Search agents to review",
    loading: "Loading agents to review",
    unableToLoad: "Unable to load agents to review.",
    emptyTitle: "Nothing needs review",
    emptyBody:
      "Your local harness folders are either already in use through Skill Manager or currently empty. Install from the marketplace to add new agents.",
  },
  filters: {
    noMatchTitle: "No agents match the current filters.",
    noMatchBody: "Adjust the search or filter controls to bring agents back into view.",
    clearFilters: "Clear Filters",
  },
  bulk: {
    delete: "Delete",
    confirmTitle: (count: number) => `Delete ${count} agent${count === 1 ? "" : "s"}?`,
    confirmDescription: "This removes the Skill Manager copy and its symlinks from every harness.",
    confirmNote: "The source on disk outside the Skill Manager store is not touched.",
  },
  confirm: {
    removeTitle: "Remove agent from Skill Manager?",
    removeDescription: (agentName: string) =>
      `This removes ${agentName} from the Skill Manager store and restores local copies only for the harnesses that are currently enabled.`,
    restoreTo: (labels: readonly string[]) => `Will restore to: ${labels.join(", ")}`,
    remove: "Remove",
    removing: "Removing",
    deleteTitle: "Delete agent from Skill Manager?",
    deleteDescription: (agentName: string) =>
      `This will remove ${agentName} from the shared store and delete its links from all harnesses.`,
    cannotUndo: "This action cannot be undone.",
    affectedHarnesses: (labels: readonly string[]) => `Affected harnesses: ${labels.join(", ")}`,
    delete: "Delete",
    deletingAgent: "Deleting agent",
  },
  detail: {
    unableToLoad: "Unable to load agent",
    close: "Close agent details",
    tryAgain: "Try selecting the agent again, or return to the list and reopen it.",
    sourceLinksAria: (label: string) => `Source links for ${label}`,
    openAgentFile: "Open Agent File",
    loading: "Loading",
    about: "About",
    noDescription: "No description provided.",
    loadingDocument: "Loading document",
    noDocument: "No agent document is available for this entry.",
    harnesses: "Harnesses",
    locations: "Locations",
    storeNote:
      "Skill Manager Store is the canonical physical package. Tool locations are symlinks to it when enabled.",
    addToSkillManager: "Add to Skill Manager",
    managingAgent: "Managing agent",
    deleteAgent: "Delete Agent",
    canonicalPhysicalPackage: "Canonical physical package",
    symlinkToStore: "Symlink to Skill Manager Store",
    moreActions: (name: string) => `More actions for ${name}`,
    removeFromSkillManager: "Remove from Skill Manager",
    delete: "Delete",
    enableOnAll: "Enable on all",
    enableOnAllAria: "Enable on all harnesses",
    disableEverywhere: "Disable everywhere",
    inUseList: "Agents in use list",
    reviewList: "Agents to review list",
  },
} as const;

export type AgentsCopy = CopyShape<typeof englishAgentsCopy>;

export const agentsCopy = {
  en: englishAgentsCopy,
  "zh-CN": {
    inUse: {
      title: "使用中的 Agent",
      viewModeAria: "使用中的 Agent 视图模式",
      searchPlaceholder: "按名称、标签或描述搜索...",
      searchLabel: "搜索使用中的 Agent",
      loading: "正在加载使用中的 Agent",
      unableToLoad: "无法加载使用中的 Agent。",
      emptyTitle: "还没有使用中的 Agent",
      emptyBody: "确认本地 Agent 文件，或从商城安装内容，然后在这里控制 harness 覆盖范围。",
      filterAria: (label: string) => `筛选：${label}`,
      pills: {
        all: "全部",
        enabled: "已启用",
        allHarnesses: "所有 harness 已启用",
        off: "关闭",
      },
      viewModes: {
        grid: "网格",
        board: "看板",
        matrix: "矩阵",
      },
    },
    review: {
      title: "待确认的 Agent",
      subtitle: (count: number) =>
        count > 0 ? `${count} 个 Agent 需要确认。` : "没有本地 Agent 文件需要在 harness 间确认。",
      adoptAllEligible: "采用全部可用项",
      adoptingAllAgents: "正在采用全部 Agent",
      searchPlaceholder: "搜索待确认的 Agent...",
      searchLabel: "搜索待确认的 Agent",
      loading: "正在加载待确认的 Agent",
      unableToLoad: "无法加载待确认的 Agent。",
      emptyTitle: "没有需要确认的内容",
      emptyBody:
        "你的本地 harness 文件夹要么已通过 Skill Manager 使用，要么当前为空。可以从商城安装新的 Agent。",
    },
    filters: {
      noMatchTitle: "没有 Agent 匹配当前筛选。",
      noMatchBody: "调整搜索或筛选条件，让 Agent 重新显示。",
      clearFilters: "清除筛选",
    },
    bulk: {
      delete: "删除",
      confirmTitle: (count: number) => `删除 ${count} 个 Agent？`,
      confirmDescription: "这会移除 Skill Manager 副本以及所有 harness 中的符号链接。",
      confirmNote: "Skill Manager 存储之外的磁盘来源不会被修改。",
    },
    confirm: {
      removeTitle: "从 Skill Manager 移除此 Agent？",
      removeDescription: (agentName: string) =>
        `这会从 Skill Manager 存储中移除 ${agentName}，并且只为当前已启用的 harness 恢复本地副本。`,
      restoreTo: (labels: readonly string[]) => `将恢复到：${labels.join(", ")}`,
      remove: "移除",
      removing: "移除中",
      deleteTitle: "从 Skill Manager 删除此 Agent？",
      deleteDescription: (agentName: string) =>
        `这会从共享存储中移除 ${agentName}，并删除所有 harness 中的链接。`,
      cannotUndo: "此操作无法撤销。",
      affectedHarnesses: (labels: readonly string[]) => `受影响的 harness：${labels.join(", ")}`,
      delete: "删除",
      deletingAgent: "正在删除 Agent",
    },
    detail: {
      unableToLoad: "无法加载 Agent",
      close: "关闭 Agent 详情",
      tryAgain: "请重新选择此 Agent，或回到列表后再次打开。",
      sourceLinksAria: (label: string) => `${label} 的来源链接`,
      openAgentFile: "打开 Agent 文件",
      loading: "正在加载",
      about: "简介",
      noDescription: "没有提供描述。",
      loadingDocument: "正在加载文档",
      noDocument: "此条目没有可用的 Agent 文档。",
      harnesses: "Harness",
      locations: "位置",
      storeNote: "Skill Manager Store 是规范的实体包。启用时，工具位置会以符号链接指向它。",
      addToSkillManager: "添加到 Skill Manager",
      managingAgent: "正在管理 Agent",
      deleteAgent: "删除 Agent",
      canonicalPhysicalPackage: "规范实体包",
      symlinkToStore: "指向 Skill Manager Store 的符号链接",
      moreActions: (name: string) => `${name} 的更多操作`,
      removeFromSkillManager: "从 Skill Manager 移除",
      delete: "删除",
      enableOnAll: "全部启用",
      enableOnAllAria: "在所有 harness 上启用",
      disableEverywhere: "全部停用",
      inUseList: "使用中的 Agent 列表",
      reviewList: "待确认的 Agent 列表",
    },
  },
} satisfies LocalizedCopy<AgentsCopy>;

export function useAgentsCopy(): AgentsCopy {
  return useLocalizedCopy(agentsCopy);
}
