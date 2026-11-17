# Open Artifact

[English](README.md) · 简体中文

> **前身是 `baoyu-design`。** 本项目由 [baoyu-design](https://github.com/JimLiu/baoyu-design)（旧地址会自动跳转到这里）
> 演变而来。baoyu-design 把 claude.ai 风格的 Artifact 类型带到了本地编码 Agent 上，每种类型一个 skill。Open Artifact
> 把它们重做成一套开放、不绑定任何 Agent 的格式：一个本地守护进程（daemon）、一个页面框架、一个 `/open-artifact`
> skill，再为每个 Agent 应用各配一个插件。

**Open Artifact 让任何编码 Agent 都能做出可以打开、编辑、评论的东西，而不只是一堆文件。** 你让 Agent 做一份幻灯片、
一套 UI 设计、一个设计系统或一块白板，Agent 写出一个普通的文件夹；本地页面用真正的编辑器打开它，你可以直接改标题、
挪便利贴、留评论、导出。点"Send to agent"，你的评论就回到 Agent 的会话里。

一切都在你自己的电脑上运行：不需要账号，不用上传，也不限定模型或厂商。

```
  你 ──"/open-artifact slides a 6-slide pitch"──▶ Agent（Claude Code、Codex、Cursor、Copilot……）
                                                    │ 写文件
                                                    ▼
                                          ./my-deck/project/deck.json + slides/*.html
                                                    │ 由本地 daemon 提供页面
                                                    ▼
  你 ◀── 编辑 · 评论 · 导出（PDF/PPTX/PNG/HTML）── http://127.0.0.1:<port>/a/<id>
   └──────────────── "Send to agent" ──────────────▶ 评论回到 Agent 的会话
```

## Artifact 类型

| 类型 | 你得到什么 | 标识文件 | 导出格式 |
|---|---|---|---|
| [Slides](artifact-types/slides/SKILL.md) | 1920×1080 的演示文稿：幻灯片栏、总览、演讲者备注、逐项动画、转场、演示模式 | `project/deck.json` | PDF、PPTX、HTML、PNG |
| [Design](artifact-types/design/SKILL.md) | 由实时 `.dc.html` 画板组成的无限画布：界面、组件、可点击原型、便签、多页面 | `project/canvas.json` | PNG、JPEG、PDF、HTML |
| [Design System](artifact-types/design-system/SKILL.md) | 品牌手册：设计令牌（tokens）、带对比度检查的颜色、字体样张、实时组件预览、素材。Design 和 Slides 都可以安装它 | `project/design-system.json` | — |
| [Whiteboard](artifact-types/whiteboard/SKILL.md) | 多人共享的无限白板：便利贴、形状、箭头、手绘、图片、表格、嵌入网页、实时光标、计时器 | `db/board/meta.json` | PNG |

每个类型文件夹都是一个独立的 skill：`SKILL.md` 告诉 Agent 怎么写，`reference/` 说明文件格式，`artifact-type.json`
向宿主描述这个类型，`scripts/`（构建产物）里是命令行工具和编辑器。

## 快速开始

需要 **Node.js 22.18+**。

```bash
npm ci
npm run build
```

然后选一种用法。

### 1. 作为 Agent 应用的插件（推荐）

```bash
node scripts/build-plugins.mjs      # 生成 dist/plugins/，一个插件市场目录
```

然后把它装进你的 Agent 应用。下面的命令都在仓库根目录运行。`dist/plugins/` 里每个插件文件夹都自带 skill 和 daemon，
电脑上需要 Node.js 22 或更高版本。

| Agent 应用 | 安装方法 |
|---|---|
| [Claude Code](plugins/claude-code/README.md)（CLI、桌面版、IDE） | `claude plugin marketplace add ./dist/plugins`，再 `claude plugin install open-artifact@open-artifact` |
| [Codex](plugins/codex/README.md)（CLI、应用）和 ChatGPT 桌面版 | `codex plugin marketplace add ./dist/plugins`，再到 `/plugins`（CLI）或 Plugins 标签页（应用）里安装 **Open Artifact** |
| [Cursor](plugins/cursor/README.md) | 把 `dist/plugins/cursor` 复制到 `~/.cursor/plugins/local/open-artifact`，再运行 **Developer: Reload Window** |
| [GitHub Copilot](plugins/copilot/README.md) CLI | `copilot plugin install ./dist/plugins/copilot`（直接装这个文件夹。Copilot 会提示这种安装方式已弃用，但不要把 `./dist/plugins` 加成 Copilot 插件市场，那样装上的是 Claude Code 版插件） |
| VS Code 里的 [GitHub Copilot](plugins/copilot/README.md) | 打开 `chat.plugins.enabled`，运行 **Chat: Install Plugin from Source**，选 `dist/plugins/copilot` |
| [Antigravity](plugins/antigravity/README.md) | `agy plugin install ./dist/plugins/antigravity`（或者把这个文件夹复制到 `~/.gemini/config/plugins/open-artifact/`），然后重启应用 |
| [网页版 ChatGPT](plugins/chatgpt/README.md) | 运行连接器，套一层 HTTPS 隧道，再在 ChatGPT 里添加为自定义 MCP 服务器（步骤见它的 README） |
| DeepSeek Harness | 把 `plugins/dsh` 文件夹添加为本地插件；`npm run build` 会构建它，应用直接链接这个文件夹 |

比如 Claude Code：

```bash
claude plugin marketplace add ./dist/plugins
claude plugin install open-artifact@open-artifact
```

Cursor：

```bash
mkdir -p ~/.cursor/plugins/local && cp -R ./dist/plugins/cursor ~/.cursor/plugins/local/open-artifact
```

有几个应用还要多做一步：

- **Codex** 要你在 `/hooks` 里批准之后才会运行插件的 hooks，每次更新后要再批准一次。
- **Antigravity** 只在启动时加载插件的 MCP 服务器；每次调用工具都会请你允许，直到你选择始终允许。
- 想不安装、只在一个会话里试用：`claude --plugin-dir ./dist/plugins/claude-code` 或
  `copilot --plugin-dir ./dist/plugins/copilot`。

重新构建后，再装一次（或再复制一次）就是更新。然后在新会话里输入：

```text
/open-artifact slides a 6-slide pitch for this repo
/open-artifact design three landing page options for a coffee shop
/open-artifact whiteboard a retro board for last sprint
```

插件会添加 `Artifact`、`ArtifactData` 和 `ArtifactComments` 三个 MCP 工具、这个 skill，以及把页面评论带回会话的
hooks。每个应用怎样收到评论、各自测过什么，见 [plugins/README.md](plugins/README.md)。

### 2. 作为 skill 给其他 Agent 用

把 [`skills/open-artifact/`](skills/open-artifact/SKILL.md) 复制过去，或者让 Agent 直接读这个目录。它由
`build-plugins.mjs` 构建，也可以单独运行 `node scripts/build-skill.mjs`。目录里自带 daemon，Agent 通过命令行驱动它：

```bash
node skills/open-artifact/scripts/open-artifact.mjs artifact '{"action":"list","scope":"types"}'
```

### 3. 单独使用某一种类型

每个构建好的类型文件夹都能独立运行，不需要 daemon：

```bash
node artifact-types/design/scripts/cli.mjs open ./my-design --type design   # 启动本地服务并打印页面地址
node artifact-types/design/scripts/cli.mjs wait ./my-design                 # 一直等到有人点 "Send to agent"
```

其他命令：`check`、`generate`、`upload`、`context`、`comments`、`history`、`share`、`status`、`stop` 等。不带参数运行
CLI 可以看到完整列表。

## 开发

```bash
npm run build        # 编辑器、support.js、CLI、Shell 和 DSH 插件 → dist/ 和 artifact-types/*/scripts/
npm run typecheck
npm test             # 单元测试（node --test）
npm run e2e          # 端到端测试：用 CLI 和 Chrome 驱动构建好的类型，见 e2e/README.md
```

`crates/` 里的 Rust crate 会编译成 WebAssembly，产物已经提交在 `packages/wasm-*/generated/` 下，所以只有改了 crate
才需要 Rust 工具链：

```bash
node scripts/build-wasm.mjs   # 需要 cargo + wasm32-unknown-unknown、wasm-bindgen、wasm-opt
```

## 仓库结构

| 路径 | 内容 |
|---|---|
| `artifact-types/` | 四种类型，各自是一个 skill：`SKILL.md`、`reference/`、`artifact-type.json`。 |
| `skills/open-artifact/` | 统一的 `/open-artifact <type>` skill；`vendor/`（构建产物）里是 daemon。 |
| `plugins/` | 为各个 Agent 应用打包的 skill，带 hooks 和 MCP 配置（[README](plugins/README.md)）。 |
| **平台** | |
| `packages/daemon` | `open-artifact` daemon：类型注册、artifact 库、Agent 工具、MCP、唤醒路由、Harness API。 |
| `packages/shell` | daemon 的页面：包住每个 artifact 的 Shell 框架，以及首页。 |
| `packages/protocol` | daemon、harness 适配器、类型服务、Shell 和页面之间共享的类型化协议。 |
| `packages/runtime` | `window.openartifact`，页面使用的能力 API（文件、上传、用户、Agent、在线状态、下载）。 |
| `packages/type-server`、`packages/server-sdk` | 每种类型的本地服务和 `cli.mjs`；服务端共享代码。 |
| **类型** | |
| `packages/slides-core`、`slides-editor` | Slides 的数据模型（HTML 子集、`deck.json`）和编辑器。 |
| `packages/design-core`、`design-editor`、`dc` | Design 的数据模型（`canvas.json`）、编辑器，以及 `.dc.html` 画板格式。 |
| `packages/design-system-core`、`design-system-editor` | Design System 的数据模型（令牌语法、CSS 编译器）和编辑器。 |
| `packages/whiteboard-core`、`whiteboard-editor` | Whiteboard 的数据模型（schema、实时同步、几何计算）和编辑器。 |
| **共享** | |
| `packages/ui`、`editor-kit`、`export-kit` | UI 组件库（Base UI + Tailwind）、各编辑器共用的部分（评论、历史、在线状态……）、浏览器端导出。 |
| `packages/canvas-engine`、`wasm-*`、`crates/` | WebGL2 画布引擎，以及背后的 Rust/WebAssembly crate（画布、导出、白板几何）。 |
| `e2e/` | 端到端测试。 |
| `scripts/` | `build.mjs`、`build-plugins.mjs`、`build-skill.mjs`、`build-wasm.mjs`。 |

## 许可证

[Apache License 2.0](LICENSE)。Copyright 2026 Jim Liu 宝玉，详见 [NOTICE](NOTICE)。
