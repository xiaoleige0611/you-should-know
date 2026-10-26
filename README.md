# You Should Know · Codex 团队插件

0.1.0 试用版。在会话开始和用户输入时自动加载审查规则，由主代理在方案确定后、交付前请求一个独立的只读审查子代理。仅当存在有证据的重要遗漏、假设或副作用时，提示“你需要知道”。没有问题时不发审查通过通知。

## 团队快速安装

准备好 Node.js 22+、Git 和支持插件及 Hooks 的 Codex CLI（已验证 0.164.0）。`xiaoleige0611/you-should-know` 是公开仓库，下载插件无需 GitHub 账号或仓库授权。

**复制这一条到终端即可安装，无需克隆仓库或下载 ZIP：**

```sh
codex plugin marketplace add https://github.com/xiaoleige0611/you-should-know.git && codex plugin add you-should-know@team-ysk
```

首次安装后，在 Codex 的 Hooks 管理入口信任 `you-should-know@team-ysk` 的 `SessionStart`、`UserPromptSubmit` 两项，然后新开会话。之后默认加载，不必每次输入开启指令。若以前关闭过 YSK，安装不会覆盖你的选择，需主动说“开启 YSK”。

日常控制：直接说 **“关闭 YSK” / “开启 YSK” / “查看 YSK 状态”**。

**当前边界：在 Codex CLI 0.164.0 的实测中，安装会启用 Hook，但初始信任状态为 untrusted。首次需要在宿主中信任这两个 Hook。完成安装和首次信任后，无须每次手动开启。纯粹“安装完零确认立即执行”尚不满足。**

这是检查点式、由提示指令驱动的独立审查，不是 Claude Code mod 的专属 UI 或持续后台监听器。模型是否调用子代理仍受宿主能力、上级指令和模型执行影响。当前只完成了真实宿主的安装、Hook 执行与开关验证，尚未完成真实模型端到端审查质量验证。

## 本地安装与兼容性

依赖：Node.js 22 或以上，以及支持插件和 Hooks 的 Codex。已验证环境：macOS、Node.js 22.22.1、Codex CLI 0.164.0。其他版本、Windows/Linux 和桌面端交互仍需团队试用验证。

解压插件后，在终端执行，将路径替换为实际解压目录：

```sh
codex plugin marketplace add "/absolute/path/to/you-should-know"
codex plugin add you-should-know@team-ysk
```

在 Codex 的 Hooks 管理入口找到 `you-should-know@team-ysk`，检查并信任 `SessionStart`、`UserPromptSubmit` 两项。然后新开会话。宿主可能显示 Hook 执行记录；插件不生成启用横幅。不要使用全局跳过 Hook 信任的启动参数。

仓库维护时应保留根目录中的 `.claude-plugin/marketplace.json`（Codex 已实测支持的市场索引格式）和 `.codex-plugin/plugin.json`（原生插件清单）。

## 更新与卸载

更新市场后重新安装；更新可能需要重新信任变更过的 Hook：

```sh
codex plugin marketplace upgrade team-ysk && codex plugin add you-should-know@team-ysk
```

卸载：

```sh
codex plugin remove you-should-know@team-ysk
```

## 手动控制

在加载了插件的会话中直接说：

- “关闭 You Should Know”或“关闭 YSK”：保存关闭状态，并要求主代理停止当前 YSK 审查、丢弃迟到结果。
- “开启 You Should Know”：保存开启状态。
- “查看 YSK 状态”：读取实际状态。

也可以显式调用 `ysk-review` Skill，附上 on、off 或 status 请求。以宿主显示的完整技能名为准。

需要绕过自然语言识别时，可以直接运行确定性的本地控制脚本。下面是标准安装目录下的关闭示例；自定义 Codex 数据目录时应替换路径：

```sh
node "/absolute/path/to/you-should-know/scripts/ysk.mjs" off \
  --data "${CODEX_HOME:-$HOME/.codex}/plugins/data/you-should-know-team-ysk"
```

把 `off` 改为 `on` 或 `status` 即可。Hook 上下文也提供实际数据目录。开关保存到该目录下的 `state.json`，不放在插件版本缓存里。首次没有状态文件时默认开启；关闭后跨进程、会话以及本次实测的重新安装保持关闭。

关闭状态在下一次用户输入或审查检查点被读取。另一个会话里已运行的子代理不会被脚本从操作系统层面立即终止；主代理被要求在下一检查点停掉它并抑制结果。若要完全停止 Hook 执行，使用宿主插件管理的禁用功能，或运行 `codex plugin remove you-should-know@team-ysk`。

## 工作方式

1. Hook 读取开关，将启用或停用上下文交给 Codex。
2. 实质性编码、诊断或设计工作到达检查点后，主代理检查开关，调用只读子代理；日常问候、翻译、简单改写和插件控制跳过审查。
3. 子代理检查需求遗漏、未经证实的假设、重要副作用和完成证据，不编辑文件，也不继续派生审查代理。
4. 主代理复核发现并再次读取开关，仅输出最多三条有证据的重要问题。没有子代理能力或审查失败时，不能声称已通过独立审查。

“只读”是给审查代理的任务约束，不是插件新建的权限沙箱。提示式检查也不构成强制的提交/发布门禁。团队原有权限与审批仍由 Codex 管理。

插件脚本不联网、不收集遥测、不上传文件、不修改项目 AGENTS.md 或模型配置。审查子代理仍使用团队配置的 Codex 模型，会增加模型用量；相关上下文按现有模型服务处理。首次关闭可能需要宿主批准写入插件状态目录。

## 验证与试用

在插件目录执行：

```sh
node --test tests/runtime.test.mjs
node tests/install.mjs
```

维护者也可以验证 GitHub 远程安装：

```sh
node tests/install.mjs https://github.com/xiaoleige0611/you-should-know.git
```

集成测试创建临时 Codex 配置目录，在那里安装插件、检查未信任状态，再仅为测试代码设置信任，验证真实 Hook 输出。测试模型地址是本机未提供服务的端口，Hook 执行后即中断回合，不调用真实模型。测试不会更改用户日常 Codex 配置。临时目录路径会输出，方便检查证据。

团队上线前建议完成以下真实模型试用：

| 场景 | 验收结果 |
|---|---|
| 新会话执行实质性任务 | 不输入启用指令也能发起独立审查 |
| 需求明确要求测试，但交付没有测试证据 | 给出有证据的缺口提醒，不声称测试通过 |
| 简单问候或没有实质缺陷的任务 | 无无意义提醒，无递归审查 |
| 关闭后新开会话 | 不再发起 YSK 审查 |
| 审查过程中关闭 | 后续检查点停止审查，不输出迟到提醒 |
| 手动开启 | 后续实质性任务恢复审查 |

详细的已验证项目和限制见 `VALIDATION.md`。
