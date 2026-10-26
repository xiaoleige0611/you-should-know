# 0.1.0 验证记录

日期：2026-10-26。环境：macOS / Node.js 22.22.1 / Codex CLI 0.164.0。

## 已实测

- 运行时测试 5 项通过：默认注入、开关持久化、状态独立于安装目录、异常状态不重新开启、无效事件不激活。
- Codex CLI 成功识别本地市场和原生插件清单，并把插件安装到隔离的缓存目录。
- 原生 `skills/list` 正确解析并发现 ysk-review，无技能解析错误。skill-creator 自带 Python 校验器因缺少 PyYAML 未运行成功，改用真实 Codex 技能解析结果验证。
- `hooks/list` 无警告、无解析错误，两个 Hook 均 enabled，初次均 untrusted。
- 仅在临时测试配置目录设置当前 Hook 哈希信任后，两项均为 trusted。
- 在真实 app-server 回合中，`SessionStart` 和 `UserPromptSubmit` 均完成，输出被接受为 context，内容含 YSK_REVIEW_ENABLED。
- off 后，新测试会话的真实 Hook 输出为 YSK_REVIEW_DISABLED。
- 相同版本重新安装不覆盖 off 状态。
- on 后，真实 Hook 恢复输出 YSK_REVIEW_ENABLED。

集成测试可重复运行；测试中的信任设置仅针对临时目录下的这两个测试 Hook。产品脚本不会写入信任配置。

## 尚未验证或尚未满足

- 零首次确认：CLI 安装的 Hook 初始不受信任，尚不满足。
- 真实模型是否稳定启动独立子代理、发现问题、避免误报及处理运行中关闭：未完成端到端试用。
- 桌面端专属提醒 UI、逐工具调用的持续旁路监督：未实现；当前是检查点式提示工作流。
- 不同桌面版本、Windows/Linux：未实测。
- 插件版本升级和组织集中预信任流程：未实测；只验证了同版本重新安装保留开关。

官方在线文档本次访问失败；接口依据是本机 Codex CLI 帮助、它导出的 app-server 协议和上述实际安装/执行结果。未将前文无法核验的网页描述当作实现依据。
