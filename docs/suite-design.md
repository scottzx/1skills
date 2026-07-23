# Skill Suites（套件）PRD 讨论稿

> Status: **PRD discussion**（以产品讨论为主，未开工实现）  
> Module: `modules/1skills`（skill-manager）  
> Example source: `…/media/.claude/skills` + 根目录 `suite.json`  
> MVP: **P1–P2**

---

## 0. 文档目的

把「单 skill → 套件」从概念收敛成可评审的 PRD：用户问题、产品原则、存储与身份、核心流程、P1/P2 边界、验收场景、开放问题。  
**不作为立即编码清单**；实现细节仅在需要支撑决策时出现。

---

## 1. 问题陈述

### 现状

- 1skills 的原子单位是**单个 Skill**（目录 + `SKILL.md`）。
- 安装 / 更新 / 卸载都按 skill 粒度进行。
- 一组协同发布、协同版本演进的 skill（例：media 下的 byted-mediakit\*、funasr-local、hybrid-video-workflow…）在系统里**没有「套」的概念**。

### 痛点

| 痛点 | 表现 |
|---|---|
| 安装碎 | 用户要逐个装 N 个相关 skill |
| 更新碎 | 无法「按套检查更新 / 按套讨论变更」 |
| 归属不清 | 看不出哪些 skill 属于同一发布单元 |
| 版本不同步 | 套内部分更新、部分未更新，协作语义被破坏 |

### 目标

引入 **Suite（套件）** 作为**发布与版本管理单位**；  
**Skill** 仍是 harness 绑定、扫描、enable/disable 的**运行时最小单元**。

---

## 2. 产品原则（已锁定）

| # | 原则 | 含义 |
|---|---|---|
| P-1 | **仅显式清单** | 源 skills 根目录必须有 `suite.json`。无清单 ≠ 套件。未列入 `skills[]` 的目录 = **独立 skill**。不做隐式「扫文件夹成套」。 |
| P-2 | **双根存储 + 副本** | 独立 skill 与套件成员**物理分根**；纳入套件 = **复制**，不是软链共享。 |
| P-3 | **更新必讨论** | 套件更新禁止静默覆盖。先出 plan，经 **1acp 人机讨论**，再按 decision apply。 |
| P-4 | **多归属靠副本** | 同一 skill 可进多个 suite；每个 suite 一份副本，可独立演进。 |
| P-5 | **MVP = P1–P2** | P1 打通后端与更新闭环（API 可手动 decision）；P2 补齐前端套件体验与 1acp 接线。 |

---

## 3. 用户与核心用例

### 3.1 角色

- **开发者 / 创作者**：维护源仓库里的 `suite.json` + 多个 skill 目录。
- **使用者**：在 1skills 中安装套件、按套更新、在 harness 里启用成员 skill。
- **讨论代理（1acp）**：在更新时协助人审阅 diff、给出 apply decision。

### 3.2 核心用例（按优先级）

| ID | 用例 | MVP |
|---|---|---|
| U1 | 从本地路径安装套件（含 `suite.json`） | P1 |
| U2 | 列出已安装套件与成员 | P1 |
| U3 | 查看套件详情（版本、源、成员 revision） | P1 |
| U4 | 准备套件更新 plan（成员级 diff） | P1 |
| U5 | 应用更新 decision（仅批准项落盘） | P1 |
| U6 | 卸载套件（删 suite 树，不动独立 skill） | P1 |
| U7 | 同名 skill：独立包与套件副本并存 | P1 |
| U8 | 同一 skill 进入两个 suite（双副本） | P1 |
| U9 | 从 GitHub 源安装套件 | P1（可次优先） |
| U10 | UI：套件列表 / 详情 / 成员折叠 | P2 |
| U11 | UI：更新 plan 可视化 + 提交 decision | P2 |
| U12 | 1acp：一键「讨论并更新此套件」 | P2 |
| U13 | 在 In-Use 中按套件分组展示 | P2 |
| U14 | Marketplace 发现套件 | **P3+，非 MVP** |

---

## 4. 源侧契约：`suite.json`

### 4.1 位置

**skills 源根目录**（与各 skill 子目录同级）：

```text
media/.claude/skills/
  suite.json
  byted-mediakit-audio/
  byted-mediakit-shared/
  hybrid-video-workflow/
  pm/                        ← 若未列入 skills[] → 独立 skill，装套件时忽略
```

### 4.2 Schema（讨论版）

```json
{
  "name": "media",
  "description": "Media production skills",
  "version": "0.4.0",
  "skills": [
    "byted-mediakit-shared",
    "byted-mediakit-audio",
    "byted-mediakit-video",
    "byted-mediakit-image",
    "byted-mediakit-editing",
    "funasr-local",
    "hybrid-video-workflow",
    "media-capture"
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 套件名；决定 store 下 suite 目录 slug |
| `description` | 否 | 展示 |
| `version` | 否 | 源声明版本（展示用；内容变更仍看 fingerprint） |
| `skills` | 是 | 成员**目录名**列表；每项必须存在且含 `SKILL.md` |

### 4.3 校验策略（建议）

- 无 `suite.json` → 拒绝 suite install（可提示走单 skill）。
- 缺 `name` / `skills` → 拒绝。
- 成员路径无效 → **整套安装失败**（P1 不做部分安装）。
- 未列入的兄弟目录 → 安装套件时**忽略**。

---

## 5. 存储模型（已按最新约定修订）

### 5.1 布局

独立 skill 与套件**并列双根**，不再把 suites 嵌在 `shared/` 下。

```text
{data_dir}/
  shared/                          # 独立 skill 根（现有 skills_store_root）
    some-standalone-skill/
    foo/
  shared-suites/                   # 套件根（新）
    media/                         # suite slug
      suite.json                   # 安装快照（源清单 + 安装元数据）
      byted-mediakit-audio/        # 成员副本
      hybrid-video-workflow/
    other-suite/
      suite.json
      foo/                         # 与 media 无关的另一份 foo 副本（若成员含 foo）
  manifest.json                    # 独立 skill 清单（现有）
  suites-manifest.json             # 套件级清单（新）
```

> 表意纠正：产品表述「`shared-suites/<skill>`」在物理上是  
> **`shared-suites/<suite-slug>/<member-skill>/`** —— 中间一层是套件，内层才是 skill 副本。

### 5.2 为何双根（PRD 理由）

| 选项 | 取舍 |
|---|---|
| A. `shared/suites/...`（嵌套） | 实现省一点；但扫描要特判、语义上 suite 仍像 shared 的子类 |
| B. `shared-suites/...`（并列）**← 采用** | 边界清晰：独立 vs 套件两套库存；扫描/备份/权限可分开；避免 `find_skill_roots(shared)` 误入套件树 |

### 5.3 副本语义

1. **安装 suite**  
   成员只写入 `shared-suites/<slug>/<member>/`，**不**写入 `shared/`。  
2. **独立 + 套件同名**  
   `shared/foo` 与 `shared-suites/media/foo` 可并存，两套 `skill_id`，两套 revision。  
3. **多 suite**  
   `shared-suites/a/foo` 与 `shared-suites/b/foo` 各一份；改 A 不影响 B。  
4. **从独立「纳入」套件**（可选 mutation）  
   `copy shared/foo → shared-suites/<slug>/foo`；默认**保留**独立包。

### 5.4 身份与引用

| 类型 | 磁盘路径 | skill_ref（建议） |
|---|---|---|
| 独立 | `{data_dir}/shared/<name>/` | `shared:<name>` |
| 套件成员 | `{data_dir}/shared-suites/<slug>/<name>/` | `suite:<slug>/<name>` |

Harness 侧目录名仍是 skill **basename**（如 `foo`）。  
**同一 harness 上同名只能启用一份副本**（独立 vs 各 suite 互斥 enable）；UI 须标明启用的是哪一份。

---

## 6. 核心流程（产品流）

### 6.1 安装套件

```text
用户选择源（local / github）
  → 定位 skills 根并读取 suite.json
  → 校验成员
  → 全量复制到 shared-suites/<slug>/
  → 写 suites-manifest.json
  → 不自动 enable harness
```

### 6.2 更新套件（人机讨论）

```text
[1skills] prepare
  fetch 源 → 成员级 diff plan → 落 pending 快照 → 返回 plan JSON

[1acp] discuss（P2 主路径；P1 可用 API 手填 decision）
  以 plan 为上下文 → 人机讨论每个成员
  → 产出 decision JSON
    { member, action: accept|skip|keep_local|remove, … }

[1skills] apply
  仅执行 decision 中批准项 → 更新副本与 suites-manifest
```

**成员 diff 类型（plan 字段）**

| kind | 含义 | 默认倾向 |
|---|---|---|
| `unchanged` | 内容一致 | skip |
| `content_update` | 源新、本地无脏 | 建议 accept |
| `local_changes` | 本地相对 recorded 已改 | **block**，须人确认 |
| `added_in_source` | 源新增成员 | 建议 accept |
| `removed_in_source` | 源清单已移除 | 建议讨论：删副本 / 保留孤儿 |

### 6.3 卸载套件

- 删除 `shared-suites/<slug>/` 整树 + suites-manifest 条目。  
- **不**删除 `shared/` 下同名独立 skill。  
- 已 enable 的 harness 绑定：与单 skill delete 对齐（先 unbind 或级联清理）。

---

## 7. MVP 分期：P1–P2

### 7.1 P1 — 后端闭环（可 API 验收）

**目标**：套件作为一等库存实体可装、可查、可计划更新、可按 decision 应用。

| 交付 | 说明 |
|---|---|
| `suite.json` 解析与校验 | 严格显式 |
| 双根布局 | `shared` + `shared-suites` + `suites-manifest.json` |
| Inventory 合并 | 独立 + 套件成员，正确 `skill_ref` |
| Install / List / Get / Uninstall | REST（或等价 CLI） |
| Prepare / Apply update | plan + decision JSON；**可不经 1acp** |
| 单测 | 校验、副本、双 suite 同名、diff/apply |
| GitHub 源 install | 建议 P1 做完；若工期紧可 P1 末 |

**P1 非目标**

- 前端套件页  
- 1acp 自动开 session  
- Marketplace  
- 隐式套件  

### 7.2 P2 — 体验与人机讨论主路径

**目标**：用户在 UI 里以「套」为单位管理；更新默认走 1acp 讨论。

| 交付 | 说明 |
|---|---|
| 套件列表 / 详情 | 成员、版本、源、更新状态 |
| In-Use 按套分组 | 可折叠；成员仍可单独 enable |
| 更新 UI | 展示 plan；可跳转 1acp 或内嵌讨论结果 |
| 1acp 接线 | 「讨论并更新此套件」→ session + plan 上下文 → decision → apply |
| 冲突文案 | 同名多副本 enable 时的选择/409 说明 |
| 基础 i18n | 中英关键文案 |

**P2 非目标**

- Marketplace 套件卡片 / 安装  
- 套件级 bulk security scan（可后续）  

### 7.3 P3+（明确不在 MVP）

- Marketplace 套件发现与安装  
- 套件级扫描批跑 / 策略  
- 跨机同步套件库存  
- 隐式套件（**不做**）  

---

## 8. 与单 skill 的边界（产品表）

| 场景 | 行为 |
|---|---|
| 源无 `suite.json` | 只能单 skill 安装到 `shared/` |
| 源有 `suite.json`，用户只装某一成员路径 | 仍可单装到 `shared/<name>` |
| 用户装套件 | 仅 `skills[]` → `shared-suites/<slug>/…` |
| 独立 skill 的 source update | 维持现状（github source-backed） |
| 套件成员的更新 | **只**走 suite prepare → discuss → apply |
| 卸载套件 | 只动 `shared-suites`；不动 `shared` |

---

## 9. 验收场景（PRD 级）

### P1

1. **media 安装**  
   指向含 `suite.json` 的 skills 根 → 出现 `shared-suites/media/<members>`；未列入 skill 不出现在该树下。  
2. **独立与套件并存**  
   先 `shared/foo`，再装含 `foo` 的 suite → 两路径、两 `skill_ref`。  
3. **双 suite 副本**  
   A/B 都含 `foo` → 两副本；改 A 不改 B。  
4. **prepare 不落盘**  
   源变更后 plan 正确分类；不 apply 则磁盘不变。  
5. **apply 按 decision**  
   仅 accept 的成员更新；`local_changes` 未批准则保持。  
6. **卸载**  
   删 `shared-suites/media`；`shared/foo` 仍在。  

### P2

7. UI 能列出套件并展开成员。  
8. 从套件详情发起更新 → 看到 plan → 经 1acp（或等价）确认 → 应用成功。  
9. In-Use 中可识别「该 skill 来自哪一 suite 副本」。  

---

## 10. 开放问题（继续讨论）

| # | 问题 | 选项 / 倾向 |
|---|---|---|
| Q1 | Suite 稳定身份：slug only 还是 `sui_` + slug？ | 倾向 **slug 稳定展示，`sui_` 作内部 id** |
| Q2 | 源清单移除成员时：默认删副本还是留「孤儿成员」？ | 倾向 **plan 标 removed，decision 决定**；无默认静默删 |
| Q3 | 套件成员是否允许**单独**从 github 更新（绕过 suite）？ | 倾向 **P1–P2 禁止**，强制走套件流 |
| Q4 | enable 冲突：独立 `foo` 已启用时再启用 suite 内 `foo`？ | 倾向 **409 + 提示先 disable 另一副本** |
| Q5 | `suite.json` 是否支持 `skills` 用路径（`tools/foo`）而非单层目录名？ | P1 倾向 **仅单层目录名**；多层后置 |
| Q6 | 1acp decision schema 谁冻结？ | 建议 1skills 定义 schema，1acp/1agents 只消费 |
| Q7 | GitHub locator 形态 | `github:owner/repo` 或 `github:owner/repo/.claude/skills`（根上有 suite.json） |
| Q8 | 安装时是否可选「同时 enable 到默认 harness」？ | MVP 默认 **否**（对齐单 skill） |

---

## 11. 非目标（全文）

- 隐式套件（无 `suite.json` 自动成套）  
- 套件成员与独立 skill **共享同一物理目录**（必须副本）  
- 静默一键更新整套  
- MVP 内 Marketplace 套件  
- 把 Suite 变成 harness 原生概念（harness 仍只认 skill 目录）  

---

## 12. 决策日志

| 日期 | 决策 |
|---|---|
| 2026-03-2x | 显式 `suite.json` only；无隐式 |
| 2026-03-2x | 副本机制；多 suite = 多副本 |
| 2026-03-2x | 更新经 1acp 人机讨论 |
| 2026-03-2x | 存储改为 **`shared` ∥ `shared-suites`**（并列双根），非 `shared/suites` |
| 2026-03-2x | MVP 范围 **P1–P2**；当前阶段以 PRD 讨论为主 |

---

## 13. 下一讨论建议

1. 冻结 §10 开放问题 Q2/Q3/Q4（更新移除、单成员旁路更新、enable 冲突）。  
2. 草拟 **update plan / decision** JSON 示例（给 1acp prompt 用）。  
3. P2 信息架构：套件是顶栏一级入口，还是挂在 Skills 下的子视图？  
4. media 仓库是否补一份真实 `suite.json` 样例作为 PRD fixture。  
