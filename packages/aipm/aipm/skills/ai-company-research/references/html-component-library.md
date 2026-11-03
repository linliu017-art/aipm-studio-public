# interview-research HTML 组件库 · v1.0

> 2026-05-15 新增。受海马云作战地图（吴俊宏）启发——同一套 SOP 内容骨架在 HTML 表达层差距巨大。
> 本 references 定义 **8 大专属可视化组件 + md ↔ HTML 映射规则**，让 markdown-first 路径下的 HTML 也能跑出 HTML-first 级别的视觉表达。
>
> **核心原则**：md 是源，HTML 是渲染层。md 里允许嵌入 `:::name` 容器 directive 和 `[tag]` 内联 directive。HTML 渲染器识别 directive → 专属组件。md 在飞书/Obsidian 等纯文本工具里 directive 退化为普通段落，不影响阅读。

---

## 一、组件清单（8 个）

| # | 组件 | md directive | 用途 | 触发场景 |
|---|---|---|---|---|
| 1 | **quad 四象限** | `:::quad` | PEST / 2×2 战略矩阵 | Ch1 PEST 宏观扫描 |
| 2 | **role-tri 三栏画像** | `:::role-tri` | CEO/CTO/HR 三人画像并排 | Ch2 创始人 + 关键股东 + HR |
| 3 | **danger-banner 红线警告** | `:::danger` | 财务对赌 / 合规风险 / 致命短板 | Ch2 / Ch11 红线 |
| 4 | **score-bar 进度分数条** | `:::score` | Match 分 / Go-No-Go 加权评分可视化 | Ch1.7 / Ch6 |
| 5 | **4 色 callout 提示框** | `:::callout-mint` / `pink` / `lav` / `cream` | 重点提示 / 警告 / 推算 / 警示 | 全章节 |
| 6 | **3 色题库卡** | `:::q-fire` / `:::q-diamond` | 普通 / 🔥必问 / 💎钻石题 | Ch12 100 题 |
| 7 | **3 色可信徽章** | `[cnf]` / `[est]` / `[wrn]` 内联 | 已确认 / 推测 / 警示数据 | 全表格 |
| 8 | **src 来源行** | `> src: xxx` 行 | 表格 / 段落数据来源 | 全章节 |

---

## 二、组件 md 语法详细规范

### 2.1 quad 四象限

```md
:::quad PEST 宏观扫描
🏛️ P 政策 | 利好：网信办备案规范成熟 [cnf]
🏛️ P 政策 | 风险：内容显著标识 2025-09 强制 [wrn]
💰 E 经济 | 利好：港股 AI IPO 热（12 家上市）[cnf]
💰 E 经济 | 风险：估值压制 [wrn]
👥 S 社会 | 利好：短剧 AIGC 2024 484 亿 [cnf]
⚙️ T 技术 | 利好：Agent 编排 2026 风口 [est]
:::
```

**渲染**：2×2 网格，每格一个象限标题 + N 条要点。逗号前作为象限名分组，相同象限的合并为一格。

### 2.2 role-tri 三栏画像

```md
:::role-tri
=== 👔 罗实 · CEO
- 45 岁 · 清华大学校友
- 互联网连续创业者
- 战略：让 AI 处理信息让人类处理思想
> 面试用法：他重战略 + 学术理想主义，回答时强调"学术伦理 + 长期价值"

=== 🧪 苏新宁 · 关键股东
- 南京大学教授
- CSSCI 创始人
- 学术地位顶级
> 面试用法：他在背书学术血缘，问到"为什么相信学术圈" 主动 callback 苏教授

=== 👤 贾艳陶 · HR
- 招聘者 · 今日回复 10+
- 非技术背景（推测）
> 面试用法：简化术语，多用产品价值描述
:::
```

**渲染**：3 栏并排卡片，每张卡片有 emoji 标题 + 列表 + 底部"面试用法"提示行（dashed border 分隔）。

### 2.3 danger-banner 红线警告

```md
:::danger
⚠️ **三重风险并存**：
① **学历字段连续 3 场被点穿** — DeepWisdom + Weibot + 简圣硕士门槛
② **OpenClaw 未生产使用** — 罗实是技术深究型 BOSS
③ **学术 domain 零积累** — 必须 24h 内补
:::
```

**渲染**：红底/深红字（dark 主题反色处理）+ 左边粗红线 + 大警示 emoji。

### 2.4 score-bar 进度分数条

```md
:::score 综合 Go/No-Go 评分
市场规模 | 25% | 9/10 | 大盘可观
竞争窗口 | 20% | 8/10 | 罗实"远未到来"
政策支持 | 15% | 8/10 | 利好初创
需求确定性 | 20% | 9/10 | 硕博刚需
技术成熟度 | 10% | 9/10 | 红利窗口
团队匹配 | 10% | 8/10 | 4 钻石命中
=== 加权总分 8.55/10 ===
:::
```

**渲染**：每行一个分数条（柱状渐变 mint→lavender 填充比例），底部加粗显示总分。

### 2.5 4 色 callout 提示框

```md
:::callout-pink 🎯 本岗位的战略权重
在 IPO 募资 20% "新兴领域" 里，本岗位是核心赛道。
:::

:::callout-mint 📊 底层推算
RunningHub 当前 MAU = 5 万开发者 × ARPU 500-2000 → 年化 500-3000 万。
:::

:::callout-lav 💡 候选人弹药匹配
候选人 4 模型 × 50 评测方法论可直接迁移到 Skills 评测体系。
:::

:::callout-cream ⚠️ 但财务对赌单独构成 red flag
业务面 7.25 分但叠加财务对赌后，总评 P1 重点。
:::
```

**渲染**：4 种背景色（mint-soft / pink-soft / lavender-soft / cream-soft）+ 加粗顶部标题 + 圆角卡片。

### 2.6 3 色题库卡

````md
:::q-fire B2. 详细讲一下画眉项目
思路 | STAR + 4 Agent 编排 + 4×50 评测 + 抗注入 5 层
参考答案 | 美团内部初筛 AI...面试完成率 93%+...
钩子 | 主动 callback 简圣 QinyanClaw 同构经验
:::

:::q-diamond E9. 设计简圣 12 月内最重要的 P0 产品
思路 | RICE + 钻石答案 5 维度
参考答案 | Skills 应用市场，5 维度证明：收编/飞轮/lock-in/商业化/防大厂
钩子 | RICE 评分 4.67 性价比高
:::

:::q B1. 自我介绍 1 分钟
思路 | 90 秒话术，15 秒内出现 AI PM 身份
参考答案 | "您好，我是何锦华..."
:::
````

**渲染**：题号 + 加粗题目 + 3 段 dl/dt/dd（思路/参考答案/钩子）。`q-fire` 边框粉色 + 🔥 角标，`q-diamond` 边框紫色 + 💎 角标 + 渐变背景，普通 `q` 边框 mint。

### 2.7 3 色可信徽章（内联）

```md
| 维度 | 数值 | 来源 |
| 团队规模 | 30+ 人 [cnf] | 罗实 2025-12 演讲 |
| 现金流 | "接近收支平衡" [est] | 推测 |
| 估值 | 未披露 [wrn] | 公开渠道未见 |
```

**渲染**：
- `[cnf]` → `<span class="cnf">已确认</span>` 绿底徽章
- `[est]` → `<span class="est">推测</span>` 黄底徽章
- `[wrn]` → `<span class="wrn">警示</span>` 红底徽章

### 2.8 src 来源行

```md
| 公司全称 | 北京简圣科技有限公司 |
| 成立日期 | 2023 年 |
> src: 企查查 · L1 官方
```

**渲染**：表格/段落下方一行小字 `来源：xxx` 灰色 11px。

---

## 三、新增章节强制 layout

### 3.1 Hero 区 · 4 KV 卡（必出）

md 写法（YAML 风格 frontmatter，放在文档最顶）：

```md
---
hero_tag: 🔴 P1 重点 · 等 IPO 信号 · 30 天备战
hero_kv:
  - k: 岗位 | v: 高级 AI 产品经理 | sub: 北京·朝阳·3-5年·硕士
  - k: 薪资 | v: 20-25K × 13薪 | sub: 建议谈 23-25K
  - k: Match Score | v: 70/100 | sub: 强匹配 4 钻石命中
  - k: 战略建议 | v: ⚠️ P1 重点 | sub: 24h 内补 3 短板
---
```

**渲染**：Hero 区 4 KV 卡 grid 横排，每张卡片有大字 v + 小字 k 标签 + 副标 sub。

### 3.2 顶部 alert 横幅（紧跟 Hero 之后）

```md
:::alert
⚠️ **三重风险并存** ① 财务对赌 2026-12-31 IPO ② 现金 2624 万 vs 净负债 16.74 亿 ③ ComfyUI 转无限画布

**但同时强 Match 拉满**：候选人 4 钻石命中 + OpenCode 与 QinyanClaw 底层同构
:::
```

**渲染**：粉/红渐变背景 + 左边粗粉线 + 紧凑 padding，比 callout-pink 更显眼。

### 3.3 战况一图流（紧跟 alert 之后）

```md
:::summary 📊 战况一图流
**简历过审概率**：65% · **面试胜率**：55-60% · **推荐组合**：改版简历 + 30 天补 OpenClaw + 等 IPO 信号
:::
```

**渲染**：横长方块 + lavender→pink 渐变 + 单行/双行简短文字。

### 3.4 per-chapter 本章一句话（每章首必出）

```md
## 第一章 · 行业 & 市场

:::ch-summary 本章一句话
学术 AI 赛道 2026-Q1 进入 Agent 工作流大规模商业化拐点；Consensus Scholar Agent 已发，简圣 QinyanClaw 跟进，12-18 月红利窗口。
:::

### 1.1 TAM/SAM/SOM ...
```

**渲染**：每章首一个 mint-soft 背景的圆角块，加粗"本章一句话"+正文。

---

## 四、md 渲染器实现方案

### 4.1 选 markdown-it（不再用 marked.js）

- markdown-it 有完善的 directive 插件生态（`markdown-it-container` / `markdown-it-attrs`）
- 支持自定义 token rule，正则匹配 `[cnf]` / `[est]` / `[wrn]` 内联标签
- 支持 frontmatter 解析（hero_tag / hero_kv）

### 4.2 CDN 引入

```html
<script src="https://cdn.jsdelivr.net/npm/markdown-it@13/dist/markdown-it.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/markdown-it-container@4/dist/markdown-it-container.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
```

### 4.3 渲染 pipeline

```
md base64 → atob → 解析 frontmatter（js-yaml）→ 注入 Hero 4 KV
         → markdown-it 解析正文
            ├── container('quad', ...)
            ├── container('role-tri', ...)
            ├── container('danger', ...)
            ├── container('score', ...)
            ├── container('callout-mint/pink/lav/cream', ...)
            ├── container('q', 'q-fire', 'q-diamond', ...)
            ├── container('alert', ...)
            ├── container('summary', ...)
            ├── container('ch-summary', ...)
            └── inline rule: [cnf]/[est]/[wrn] → span 徽章
         → 解析 mermaid 代码块（保留为 <div class="mermaid">）
         → 注入到 main 区
         → 动态生成三级 TOC（章/子段/项目锚）
         → 启动 mermaid + scrollspy + 折叠 JS
```

---

## 五、HTML 渲染规则对照

| md 输入 | HTML 输出（简化） |
|---|---|
| `:::quad ...:::` | `<div class="quad"><div class="quad-cell">...</div>×4</div>` |
| `:::role-tri ===A...===B...===C...:::` | `<div class="role-tri"><div class="role-card">A</div>×3</div>` |
| `:::danger ...:::` | `<div class="danger-banner">...</div>` |
| `:::score ...===total===:::` | `<div class="score-list"><div class="score-row">row</div>×N + total</div>` |
| `:::callout-pink TITLE\n...\n:::` | `<div class="bm-callout pink"><div class="ct-h">TITLE</div>...</div>` |
| `:::q-fire NUM. TITLE\n思路\|...\n参考答案\|...\n:::` | `<div class="bm-q fire"><div class="bm-q-num">NUM</div><div class="bm-q-t">TITLE</div><dl>...</dl></div>` |
| `[cnf]` 内联 | `<span class="cnf">已确认</span>` |
| `[est]` 内联 | `<span class="est">推测</span>` |
| `[wrn]` 内联 | `<span class="wrn">警示</span>` |
| `> src: xxx` 行 | `<div class="src">来源：xxx</div>` |
| frontmatter `hero_kv` | 注入 Hero 4 KV grid |
| `:::alert ...:::` | `<div class="bm-alert">...</div>` |
| `:::summary ...:::` | `<div class="ch-summary">...</div>` |
| `:::ch-summary ...:::` | `<div class="ch-summary">...</div>`（章内版） |

---

## 六、三级 TOC 生成规则

### 6.1 一级（章）：自动从 `## 第N章 · XXX` 抽取
### 6.2 二级（子段）：自动从 `### N.M XXX` 抽取
### 6.3 三级（项目锚）：从 Ch12 项目深拆中抽取 `### P0/P1/P2/...` 形式锚点

TOC 左侧 sticky 固定 240px 宽，max-height: calc(100vh - 40px)，overflow scroll。

---

## 七、章节折叠规则

### 7.1 章节级
每个 `## 第N章 · XXX` 包成 `<section class="bm-ch">`，点击章节标题切换 `.collapsed` 类，CSS 用 `:not(.bm-ch-hd)` 选择器隐藏所有子内容。

### 7.2 题目级
每个 `:::q*` 默认展开，点击题目标题切换 `.collapsed`，隐藏 dl。

### 7.3 项目分组级
Ch12 项目用 sticky `.group-t` 头，点击切换该分组下所有项目锚的显示。

---

## 八、强化的新章节（11 章 → 13 章）

### Ch12 候选人项目深拆（必出，重点档）

- **12.0 N 项目总览表**（按 ⭐ 评级排序）
- **12.1 项目 P1 ⭐⭐⭐**（主推，钻石）
- **12.2 项目 P2 ⭐⭐⭐**（备选钻石）
- **12.3-12.N 其余项目**（⭐⭐ / ⭐ 递减）

每个项目 7 字段：定位 / 用户 / JTBD / AI 能力栈 / 数据飞轮 / 数据表现 / 迁移到目标公司钩子

### Ch13 黑话速查（必出，重点档）

- **13.1 ComfyUI / Agent 框架黑话**
- **13.2 Agent / MCP / A2A 黑话**
- **13.3 模型 SOTA 黑话**
- **13.4 RAG 高阶黑话**
- **13.5 性能 / 部署黑话**
- **13.6 安全 / 合规黑话**
- **13.7 高级话术（reasoning model / agentic RAG / ...）**

每个黑话 3 字段：英文术语 / 中文解读 / 候选人原话举例

---

## 九、版本日志

- **v1.0 · 2026-05-15**：基于海马云作战地图（吴俊宏）反向工程，沉淀 8 组件 + 4 个新增 layout（Hero 4 KV / alert / 战况一图流 / ch-summary）+ 2 章扩充（Ch12 项目深拆 / Ch13 黑话速查）+ markdown-it 渲染管线
