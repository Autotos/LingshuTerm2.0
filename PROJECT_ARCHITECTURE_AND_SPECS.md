# 灵枢智能终端 2.0 — 项目架构与技术规格书

> **文档用途**：作为后续 AI 辅助开发的系统提示词 / 知识库基准。
> **最后更新**：2026-04-30

---

## 1. 项目概览

### 1.1 核心定位

灵枢智能终端 2.0（LingshuTerm 2.0）是一款基于 **Tauri v2** 的跨平台智能终端工具，支持：

- **多协议远程连接**：SSH（纯 Rust 实现 via russh）、Telnet、串口（Serial）
- **本地 PTY**：基于 `portable-pty` 的跨平台伪终端
- **AI 智能命令**：自然语言→Shell 命令序列转换（支持百炼/火山方舟/智谱/OpenAI/Ollama 等）
- **Blocks 模式**：结构化命令执行，OSC 7701 协议标记，输出自动归类
- **代码编辑器**：集成 Monaco Editor，支持多 Tab 虚拟工作区
- **会话管理器**：树形目录分组、HTML5 拖拽排序、右键菜单、加密持久化

### 1.2 技术栈清单

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **桌面框架** | Tauri | v2 | 跨平台桌面容器、系统调用 |
| **前端框架** | React | 19.1 | UI 组件渲染 |
| **状态管理** | Zustand | 5.0 | 全局状态（6 个 Store） |
| **终端渲染** | xterm.js | 5.5 | 终端模拟 + FitAddon + WebglAddon |
| **代码编辑器** | Monaco Editor | 0.55 | 代码编辑视图 |
| **图标库** | Lucide React | 0.400 | 矢量图标 |
| **Markdown** | react-markdown + remark-gfm | 9.1 / 4.0 | Blocks 输出渲染 |
| **语法高亮** | Shiki | 4.0 | 代码块着色 |
| **图表** | Mermaid | 11.14 | 流程图渲染 |
| **CSS 框架** | Tailwind CSS | 3.4 | 原子化样式（自定义深色主题） |
| **后端语言** | Rust (Edition 2021) | - | PTY 管理、网络连接、持久化 |
| **PTY 库** | portable-pty | 0.8 | 跨平台伪终端 |
| **SSH 库** | russh (ring 后端) | 0.60 | 纯 Rust SSH 客户端 |
| **串口** | serialport | 4.3 | COM 端口通信 |
| **加密** | ring | 0.17 | AES-256-GCM 密码存储 |
| **异步运行时** | Tokio | 1 | Rust 异步任务调度 |
| **序列化** | serde + serde_json | 1 | Rust ↔ JSON 互转 |
| **构建工具** | Vite | 7.0 | 前端构建 & HMR |
| **测试框架** | Vitest | 4.1 | 单元测试 (jsdom) |
| **类型检查** | TypeScript | 5.8 | 严格模式类型检查 |
| **测试工具** | Testing Library | 16.3 | React 组件测试 |

---

## 2. 目录结构深度解析

```
LingshuTerm2.0/
├── index.html                  # SPA 入口 HTML（暗色背景预填充）
├── package.json                # 前端依赖与脚本
├── vite.config.ts              # Vite 构建配置（别名 @/、HMR、base: './'）
├── tsconfig.json               # TypeScript 配置（strict + noUnusedLocals）
├── tailwind.config.js          # 自定义深色主题色板、字体、动画
├── vitest.config.ts            # Vitest 测试配置（jsdom 环境）
│
├── src/                        # ── 前端源代码 ──
│   ├── main.tsx                # React 入口（StrictMode 包裹）
│   ├── App.tsx                 # 根组件（仅渲染 <Layout/>）
│   ├── index.css               # 全局样式（字体导入、滚动条、xterm 覆盖）
│   │
│   ├── models/                 # 数据模型层 — 纯 TypeScript 类型定义
│   │   ├── connection.ts       # 连接协议类型（SSH/Telnet/Serial/Local + TreeNode/StoragePayload）
│   │   ├── session.ts          # 会话元信息（SessionInfo + SessionStatus）
│   │   ├── sessionData.ts      # 会话聚合视图（Session/SessionMode/TerminalData/BlocksData/EditorData）
│   │   ├── terminal.ts         # 终端配置与事件荷载（TerminalConfig/PtyOutputPayload）
│   │   ├── block.ts            # 命令块模型（CommandBlock/BlockCmdStartedPayload）
│   │   ├── task.ts             # AI 任务模型（TaskGroup/TaskItem）
│   │   ├── editor.ts           # 编辑器模型（EditorTab/EditorConfig）
│   │   └── __tests__/          # 模型层单元测试
│   │
│   ├── stores/                 # 状态管理层 — Zustand Store（6 个独立 Store）
│   │   ├── connectionStore.ts  # 连接配置 CRUD + 分组管理 + 树形数据推导（加密持久化）
│   │   ├── sessionStore.ts     # 运行时 Session 注册表（Map<id, SessionInfo> + activeSessionId）
│   │   ├── uiStore.ts          # UI 状态（sidebar 折叠/视图模式/模态框/会话管理器显隐）
│   │   ├── settingsStore.ts    # 用户设置（终端字体/shell/AI 配置，localStorage 持久化）
│   │   ├── commandStore.ts     # Blocks 命令状态（addCommand/setRunning/appendOutput/complete）
│   │   ├── taskStore.ts        # AI 任务队列（TaskGroup 生命周期 + 自动暂停/重试/跳过）
│   │   └── __tests__/          # Store 单元测试
│   │
│   ├── hooks/                  # 自定义 Hooks — 封装副作用与外部集成
│   │   ├── useTerminal.ts      # xterm.js 生命周期管理（创建/dispose/事件监听/resize）
│   │   ├── useEditor.ts        # Monaco Editor 生命周期管理（懒加载/dispose/值同步）
│   │   ├── useBlockSession.ts  # Blocks 模式事件桥接（block-cmd-* 事件 → commandStore）
│   │   ├── useTaskQueue.ts     # AI 任务顺序执行引擎（自动推进 + 失败暂停）
│   │   ├── useAiSubmit.ts      # AI 自然语言提交（NL→Tasks→创建 TaskGroup）
│   │   ├── useTerminalResize.ts# 终端容器尺寸监听
│   │   └── usePersistenceBootstrap.ts  # 启动持久化恢复 + 运行时订阅
│   │
│   ├── lib/                    # 工具库 — 纯函数 / 服务封装
│   │   ├── sessionUtils.ts     # Session ID 前缀路由（getWriteCommand/getResizeCommand）
│   │   ├── connectionService.ts# 连接命令薄封装（disconnect/write/resize/listSerialPorts）
│   │   ├── sessionService.ts   # 统一会话创建入口（create_session）
│   │   ├── aiService.ts        # OpenAI 兼容 API 客户端（nlToTasks/testConnection）
│   │   ├── aiDetect.ts         # 输入检测（自然语言 vs Shell 命令）
│   │   ├── persistenceSubscribe.ts  # 四路 Store 订阅 → Rust 持久化
│   │   ├── persistenceService.ts    # 持久化薄封装（load/save/append）
│   │   ├── monaco.ts           # Monaco Editor 工厂函数（Web Worker 配置）
│   │   ├── ansi.ts             # ANSI 转义序列解析
│   │   └── xterm.ts            # xterm.js 主题配置
│   │
│   ├── components/             # UI 组件层
│   │   ├── Layout.tsx          # 主布局（TitleBar+Sidebar+主区域+SessionManager+全局模态框）
│   │   ├── TitleBar.tsx        # 标题栏（会话名+会话管理器切换按钮）
│   │   ├── Sidebar.tsx         # 侧边栏（会话列表+任务列表+新建按钮）
│   │   ├── TerminalPanel.tsx   # 终端面板（xterm.js 容器+右键菜单）
│   │   ├── BlocksPanel.tsx     # Blocks 视图面板（命令块列表渲染）
│   │   ├── EditorPanel.tsx     # 编辑器面板（Monaco Editor 多 Tab）
│   │   ├── CommandInput.tsx    # 底部命令输入栏（NL/Shell 自动检测+历史记录+Ctrl+C）
│   │   ├── BottomInputArea.tsx # 底部输入区路由（终端直接写/Blocks 模式命令/AI 提交）
│   │   ├── CommandBlock.tsx    # 单个命令块组件
│   │   ├── TaskBoard.tsx       # AI 任务看板
│   │   ├── StatusBar.tsx       # 状态栏（连接状态/终端尺寸/AI 模型）
│   │   ├── SettingsModal.tsx   # 设置面板（终端/AI/Shell 配置）
│   │   ├── SessionTypeModal.tsx# 新建会话模态框（SSH/Telnet/Serial/Local）
│   │   ├── SessionManager.tsx  # 会话管理器（树形目录/拖拽/右键菜单）
│   │   ├── ConnectionForm.tsx  # 连接表单（SSH/Telnet/Serial 配置输入）
│   │   └── ContextMenu.tsx     # 通用右键菜单组件
│   │
│   ├── assets/                 # 静态资源
│   └── test/                   # 测试基础设施
│       └── setup.ts            # Vitest 全局设置（jsdom + testing-library）
│
└── src-tauri/                  # ── Rust 后端源代码 ──
    ├── Cargo.toml              # Rust 依赖与 crate 配置
    ├── tauri.conf.json         # Tauri 窗口/安全/打包配置
    ├── capabilities/default.json  # Tauri v2 权限清单
    ├── build.rs                # Tauri 构建脚本
    │
    └── src/
        ├── main.rs             # 应用入口（tracing 初始化 + 状态注入 + 命令注册）
        ├── lib.rs              # 模块声明
        │
        ├── shell.rs            # PtyManager — 本地 PTY 生命周期（创建/写/调大小/销毁）
        ├── connection.rs       # ConnectionManager — 远程连接（SSH russh/Telnet TCP/Serial）
        ├── session_commands.rs # 统一会话创建入口（create_session 分发 Local↔Remote）
        │
        ├── commands.rs         # Tauri 命令（write/resize/destroy/execute_block_command）
        ├── connection_commands.rs  # 远程连接命令（disconnect/write/resize/list_serial_ports）
        │
        ├── block.rs            # Block 命令包装（OSC 7701 协议 + MarkerScanner）
        ├── output_sanitizer.rs # PTY 输出清洗（Warp shell integration 噪声过滤）
        ├── stream_cleaner.rs   # OSC 133 状态机 / 行过滤（Blocks 纯输出提取）
        │
        ├── executor.rs         # 抽象执行器 trait（ShellExecutor / ConnectionExecutor）
        ├── storage.rs          # 加密存储（AES-256-GCM 密码加密 + StoragePayload 统一格式）
        ├── persistence.rs      # Session 持久化（meta/blocks/editor/terminal.ndjson）
        └── utils.rs            # 工具函数（workspace_dir / shell 检测）
```

---

## 3. 核心数据流与状态管理

### 3.1 Store 全景图

项目使用 **6 个独立的 Zustand Store**，各司其职：

```
┌─────────────────────────────────────────────────────────────────┐
│                      Zustand Stores                              │
├───────────────┬──────────────┬──────────────┬───────────────────┤
│ sessionStore  │ uiStore      │ settingsStore│ connectionStore   │
│ (运行时会话)  │ (UI 状态)     │ (用户设置)    │ (连接配置+分组)    │
│               │              │              │                   │
│ sessions:Map  │ activeView   │ settings:    │ savedConnections[]│
│ activeSession │ sidebarTab   │   shell      │ groups[]          │
│               │ sessionModal │   terminal   │ → buildTree()     │
│               │              │   ai         │ → TreeNode[]      │
├───────────────┼──────────────┼──────────────┼───────────────────┤
│ commandStore  │ taskStore    │              │                   │
│ (Blocks 命令) │ (AI 任务)    │              │                   │
│               │              │              │                   │
│ blocks[]      │ groups[]     │              │                   │
│ (CommandBlock)│ (TaskGroup)  │              │                   │
└───────────────┴──────────────┴──────────────┴───────────────────┘
```

### 3.2 Session ID 命名规范

| 前缀 | 协议 | 示例 | 管理器 |
|------|------|------|--------|
| `session-` | 本地 PTY | `session-1` | PtyManager |
| `ssh-` | SSH 远程 | `ssh-3` | ConnectionManager |
| `telnet-` | Telnet | `telnet-2` | ConnectionManager |
| `serial-` | 串口 | `serial-1` | ConnectionManager |

前端通过 `sessionUtils.getWriteCommand(sessionId)` 根据前缀路由到正确的 Rust 命令。

### 3.3 关键数据流

#### 3.3.1 会话创建流程

```
用户点击 "+ New" → SessionTypeModal
  → 填写表单（协议/主机/端口/凭据）
  → 调用 createSessionCmd({ protocol, ... })
  → invoke('create_session', { config })
  → Rust: session_commands::create_session
    ├─ ConnectionConfig::Local → PtyManager::create_session
    │   → portable-pty 创建 PTY → 生成 session-N → 返回 session_id
    └─ 其他 → ConnectionManager::connect
        → 创建远程连接 → 生成 ssh-N/telnet-N/serial-N → 返回 session_id
  → 前端 addSession({ id, status, ... })
  → Sidebar 显示新会话，自动激活
  → TerminalPanel 挂载 → useTerminal 初始化 xterm.js
```

#### 3.3.2 终端数据流（双向）

```
用户键盘输入 → xterm.js onData
  → invoke(getWriteCommand(sessionId), { sessionId, data })
  → Rust PtyManager/ConnectionManager.write_input()
  → PTY stdin / SSH channel

PTY stdout / SSH response
  → Rust read_pty_output 循环
    → 1. MarkerScanner.scan_chunk()     → "block-cmd-started/completed" 事件
    → 2. StreamCleaner.process_chunk()  → "block-output" 事件
    → 3. sanitize_output()             → "pty-output" 事件
  → 前端 listen('pty-output')
    → terminal.write(event.payload.data)   → xterm.js 渲染
    → persistTerminalChunk()              → NDJSON 追加写
  → 前端 listen('block-output')
    → commandStore.appendCommandOutput()   → BlocksPanel 更新
```

#### 3.3.3 会话视图切换（Terminal 保活）

```
用户点击 Sidebar 会话 → setActiveSession(newId)
  → Layout 重渲染
    ├─ Terminal: 遍历 sessions.values() → 多个 TerminalPanel 并行挂载
    │   活跃: display:block / 非活跃: display:none （xterm.js 实例保留）
    │   切换时: isVisible → true → raf → fitAddon.fit()
    ├─ Blocks: 仅活跃会话挂载
    └─ Editor: 仅活跃会话挂载
  → sessionStore.setMode(id, mode) → 下一次切回恢复视图
```

### 3.4 持久化架构

```
                    ┌── 前端 ──┐
                    │          │
    settingsStore ──┤ localStorage ('lingshu-settings')
                    │          │
    connectionStore─┤ invoke ──→ Rust storage.rs
                    │   save_connections / load_connections
                    │          │          ↓
                    │          │   ~/.LingShuTerm/workspace/connections.json
                    │          │   (AES-256-GCM 加密密码字段)
                    │          │
    persistence    ─┤ invoke ──→ Rust persistence.rs
    Subscribe       │   save_session_meta / save_session_blocks /
                    │   save_session_editor / append_terminal_batch
                    │          │          ↓
                    │          │   ~/.LingShuTerm/workspace/sessions/{id}/
                    │          │   ├─ meta.json
                    │          │   ├─ blocks.json
                    │          │   ├─ editor.json
                    │          │   └─ terminal.ndjson
                    └──────────┘
```

---

## 4. 关键技术实现细节

### 4.1 终端渲染（xterm.js）

**封装位置**：[`src/hooks/useTerminal.ts`](file:///src/hooks/useTerminal.ts)

```typescript
// 初始化顺序（严格，避免 WebGL 报错）
terminal = new Terminal({ scrollback: 10000, theme: {...}, ... })
terminal.loadAddon(new FitAddon())        // 1. FitAddon 必须在 open 前装载
terminal.open(container)                  // 2. open 初始化 RenderService
terminal.loadAddon(new WebglAddon())      // 3. WebGL 在 open 后装载
raf → fitAddon.fit()                      // 4. 下一帧 fit（容器尺寸就位）

// 保活机制
// 每个 Session 保留独立 TerminalPanel 实例（CSS display:none 隐藏，不 dispose）
// 切换时 isVisible → true → requestAnimationFrame(() => fitAddon.fit())
// ResizeObserver 持续监听容器尺寸变化

// 事件监听器隔离（防 StrictMode 双写）
// 每个 useEffect 使用局部 cancelled flag + localUnlisteners 数组
// 回调入口先检查 cancelled，避免两个 mount 的监听器同时工作
```

### 4.2 前后端通信

**通信方式**：
- **Invoke（请求/响应）**：前端调用后端命令（`write_to_terminal`、`create_session` 等）
- **Event（推送）**：后端向前端推送数据（`pty-output`、`block-cmd-started`、`session-error` 等）

**路由机制**：
```typescript
// src/lib/sessionUtils.ts
function isConnectionSession(sessionId: string): boolean {
  return ['ssh-', 'telnet-', 'serial-'].some(p => sessionId.startsWith(p));
}
function getWriteCommand(sessionId: string): string {
  return isConnectionSession(sessionId) ? 'write_to_connection' : 'write_to_terminal';
}
```

**注册的 Tauri 命令**（见 [`main.rs`](file:///src-tauri/src/main.rs)）：
- 会话创建：`create_session`、`list_local_shells`
- PTY 操作：`write_to_terminal`、`resize_terminal`、`destroy_session`
- 连接操作：`disconnect`、`write_to_connection`、`resize_connection`、`list_serial_ports`
- Block 模式：`execute_block_command`
- 持久化：`save_session_meta` ~ `clear_session`（8 个命令）
- 存储：`load_connections`、`save_connections`

### 4.3 Blocks 模式 — OSC 7701 协议

```
用户命令 → block::wrap_command(shell_type, command_id, command)
  → PTY 写入: printf '\033]7701;S;blk-xxx\007'
              <用户命令>
              printf '\033]7701;E;blk-xxx;%d\007' $?
  → Rust MarkerScanner 扫描原始字节流
    ├─ 发现 S;blk-xxx → emit 'block-cmd-started'
    └─ 发现 E;blk-xxx;0 → emit 'block-cmd-completed'

  → StreamCleaner (OSC 133 状态机) 过滤 prompt/echo
    → emit 'block-output' (纯命令输出)

  → sanitize_output() 过滤 noise
    → emit 'pty-output' (完整交互流给 Terminal)
```

支持的 Shell 类型：
| Shell | 包装方式 |
|-------|---------|
| Bash/Zsh/Sh | POSIX printf + 子 shell（`unset PROMPT_COMMAND`） |
| PowerShell | `[Console]::Write` ANSI 字节 |

### 4.4 加密存储

**位置**：[`src-tauri/src/storage.rs`](file:///src-tauri/src/storage.rs)

```
存储文件：~/.LingShuTerm/workspace/connections.json
密钥文件：~/.LingShuTerm/workspace/.key

格式：
{
  "connections": [{ id, name, config: { protocol, host, password: "base64(nonce||ciphertext)" } }],
  "groups": ["GroupA", "GroupB"]
}

加密方案：AES-256-GCM (ring crate)
  - 密钥：首次运行时随机生成 256-bit 密钥，持久化到 .key
  - Nonce：每次加密随机生成 96-bit nonce
  - 密文：base64(nonce || ciphertext || tag)
  - 向后兼容：旧格式纯数组自动迁移为 StoragePayload
```

### 4.5 主题系统

**位置**：[`tailwind.config.js`](file:///tailwind.config.js)

使用 CSS 变量（`var(--xxx)`）实现与 Tailwind 深度集成的暗色主题：

| 变量 | 色值 | 语义 |
|------|------|------|
| `--void` | `#0e0e0d` | 最深底色 |
| `--deep` | `#161615` | 面板背景 |
| `--surface` | `#1c1c1b` | 卡片表面 |
| `--text-1` | `#faf9f6` | 主文本（暖白） |
| `--text-2` | `#afaeac` | 次要文本 |
| `--accent` | `#7c6f64` | 暖色强调 |
| `--border` | `rgba(226,226,226,0.1)` | 半透明边框 |

xterm.js 主题与 CSS 变量保持色彩一致。

---

## 5. 开发规范

### 5.1 TypeScript 配置

```jsonc
// tsconfig.json 关键配置
{
  "strict": true,              // 严格模式
  "noUnusedLocals": true,      // 禁止未使用局部变量
  "noUnusedParameters": true,  // 禁止未使用参数
  "noFallthroughCasesInSwitch": true,
  "jsx": "react-jsx",         // React 17+ JSX 转换
  "moduleResolution": "bundler",
  "paths": { "@/*": ["./src/*"] }  // 路径别名
}
```

### 5.2 组件命名规范

- **页面/布局组件**：PascalCase，如 `Layout`、`TerminalPanel`、`SessionManager`
- **内部子组件**：PascalCase + 语义后缀，如 `TreeNodeRow`、`BlankAreaContextMenu`、`ProtocolIcon`
- **Hooks**：`use` 前缀，如 `useTerminal`、`useBlockSession`、`usePersistenceBootstrap`
- **Store**：`useXxxStore` 形式导出，如 `useSessionStore`、`useUiStore`
- **工具函数**：camelCase，如 `buildTree`、`connectionLabel`、`getWriteCommand`
- **类型/接口**：PascalCase，如 `ConnectionConfig`、`SessionInfo`、`TreeNode`

### 5.3 文件组织规范

- 每个组件一个文件，导出单个具名函数（不使用 default export）
- 数据模型放在 `models/`，纯类型定义不包含逻辑
- Store 放在 `stores/`，每个 Store 独立文件
- 业务副作用封装在 `hooks/`
- 纯函数工具放在 `lib/`
- Rust 模块每个文件一个职责域（`shell.rs`、`connection.rs`、`storage.rs`）

### 5.4 状态管理规范

- **不可变更新**：所有 Store action 使用 `set(state => ({...state, ...}))` 或不可变展开 `[...prev, new]`
- **Selector 优化**：使用 `useMemo` 缓存过滤结果，避免每次返回新引用导致无限循环
  ```typescript
  // store 中导出 selector hook
  export function useSessionBlocks(sessionId: string | null) {
    const blocks = useCommandStore(s => s.blocks);
    return useMemo(
      () => (sessionId ? blocks.filter(b => b.sessionId === sessionId) : []),
      [blocks, sessionId]
    );
  }
  ```
- **持久化时机**：连接配置每次 CRUD 后立即持久化；Session 日志采用 16KB/200ms 缓冲批量写入

### 5.5 防 StrictMode 双挂载规范

React StrictMode（开发环境）会导致所有 Effect 挂载两次，必须遵循：
- 使用 `cancelled` flag + 局部 `unlisteners` 数组隔离每次 Effect run
- 回调入口先 `if (cancelled) return`
- cleanup 中 `cancelled = true` + 遍历 unlisten
- 用 `bootstrappedRef` 防止 `create_session` 重复调用

### 5.6 测试规范

- **运行**：`npx vitest run`（CI）/ `npx vitest`（watch）
- **环境**：jsdom（模拟浏览器 DOM）+ `@testing-library`
- **覆盖率**：模型层（connection.test.ts）、Store 层（connectionStore.test.ts）、工具函数层
- **当前测试数**：88 个用例，7 个测试文件

### 5.7 构建 & 运行命令

```bash
# 前端开发（仅 Vite HMR，无 Tauri）
npm run dev

# Tauri 开发模式（Vite + Rust 后端）
npm run tauri:dev

# 生产构建
npm run tauri:build

# TypeScript 类型检查
npx tsc --noEmit

# Rust 类型检查
cargo check

# 运行测试
npx vitest run
```
