# dsh-progress-rules

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）bundle 插件：
让 agent 在执行过程中先通报进展，而不是闷头连续跑几十步工具。

[English](README.md) | 中文

## 它做什么

一个 bundle 行挂载两层独立机制：

1. **系统提示词段落** —— `user:progress-rules`，order `10150`（Web surface 段之后、persona
   suffix 之前）。它会带上你的过程纪律规则，且每个请求都重新组装，会话压缩（compaction）
   不会把它摘要掉。它使用独立命名的 section，所以预设里的 `@deepseek-ai/dsh-persona`
   无法像遮蔽部署级 `personaSuffix` 那样把它盖掉。

2. **确定性提醒** —— 每次 `agent/pre-step` 检查上一条 assistant 消息里有没有 text 块。
   如果只有工具调用（或 reasoning），这一步记为“沉默步”。连续 `everySteps` 个沉默步后，
   在一次即将进入的请求里注入一条 user 角色提醒：“你只调用了工具没通报，先用 1–3 句说明
   再继续”。这条提醒是持久化 context 消息，在界面上渲染为 `progress-rules` context 行，
   不会伪装成用户发言。任何一步有正文，计数清零。

第一层对模型只是建议；第二层才是真正能打断“40 步不吭声”的机制——由 harness 自己插提醒，
而不是指望模型记住规则。

## 安装

DSH 插件安装在**profile**（`$DSH_HOME/profiles/<name>`）里，不是全局：

```bash
cd ~/.dsh/profiles/desktop      # 或 web / tui / 你自己的 profile
npm install dsh-progress-rules
```

然后在 profile 的 `package.json` 里把 bundle 加进去（bundle 按列表顺序组合，放 base 之后）：

```json
{
  "dependencies": {
    "dsh-progress-rules": "^0.2.1"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-progress-rules"
      ]
    }
  }
}
```

然后重启 DSH。如果你的 DSH 带 `dsh plugin` 命令，它做的就是“加依赖 + 加 bundles 条目”。

## 配置

包内的 bundle patch（`cordis.patch.yml`）声明一行：

```yaml
- insert:
    - id: progress-rules
      name: dsh-progress-rules
      config:
        everySteps: 5
        text: |
          ## 过程纪律（优先于其他风格偏好）
          ...
```

在 profile 的 `cordis.patch.yml` 里用相同 id 覆盖。注意 patch 语义是**整行替换 config**，
保留的键要全部重写：

```yaml
- id: progress-rules
  name: dsh-progress-rules
  config:
    everySteps: 3
    text: |
      ## Process discipline
      1. Narrate progress after every step.
      2. Ask when uncertain instead of guessing.
```

| 键 | 默认值 | 含义 |
|---|---|---|
| `text` | 包内中文规则 | 系统提示词段落文本，空字符串则不注册该段。 |
| `name` | `user:progress-rules` | 段落名。 |
| `order` | `10150` | 段落顺序（WEB_SURFACE 为 10100，persona suffix 为 10200）。 |
| `enforce` | `true` | `false` 关闭每步提醒，只保留提示词段落。 |
| `reminder` | 包内一句话 | 沉默步注入的提醒文本，空字符串关闭该机制。 |
| `everySteps` | `5` | 连续沉默多少步提醒一次。`1` = 每步提醒，越大越安静。 |

## 为什么不用 AGENTS.md 或 `personaSuffix`？

- **`AGENTS.md`** 是作为普通用户消息进入对话历史的，长任务里可能被 DSH 的压缩摘要掉；
  系统提示词不会。
- **`system-prompt.personaSuffix`** 对预设会话会被遮蔽：内置 Standard / PTC / Minimal 预设
  挂载 `@deepseek-ai/dsh-persona`，并用空文本注册同名 `deployment:persona-suffix` 段，
  把部署级的值盖住。换一个独立段落名就绕开了这个问题。

## 兼容性

- 在 DSH `0.2.1-rc.2`、Standard 预设、`deepseek-v4.1-flash:1017-cloud` 上测试。
- 纯 ESM，无 Cordis 运行时导入，无运行时依赖；只用了 `node:crypto`。
- 沉默判定看的是最后一条 assistant 消息里的 text 块；如果某个 provider 用自定义块类型
  承载正文，会判不出来，欢迎提 issue。

## 许可证

MIT
