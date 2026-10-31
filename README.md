# claude-pet-dsh

![DSH overlay](assets/preview.png)

把 Claude 桌宠接进 **DeepSeek Harness（DSH）** 的 Web / Desktop 界面。它是一个 DSH 客户端插件：

- 在 `shell.overlay` 上显示右下角桌宠；
- 监听 DSH 的 `session/event`（turn / tool / approval / todo）和 `agent/error`；
- 根据当前会话状态播放 8×9 图集里的动作；
- 气泡显示当前任务与 `completed/total` 进度；
- 可拖动、收起、隐藏，位置保存在浏览器 `localStorage`。

## 安装

```sh
git clone https://github.com/Jimesarrice/claude-pet-dsh.git
```

在 DSH 环境的终端中注册本地包（把 `<克隆目录>` 换成实际路径）：

```sh
dsh plugin --profile web add file:<克隆目录>
```

桌面版：

```sh
dsh plugin --profile desktop add file:<克隆目录>
```

如果桌面客户端对 desktop profile 有应用内专管限制，请在 DSH 桌面端的插件管理界面选择本地包，或按客户端提示安装。安装后需要重启 DSH（或重开页面）让插件层加载。

## 卸载

```sh
dsh plugin --profile web remove claude-pet-dsh
dsh plugin --profile desktop remove claude-pet-dsh
```

DSH 重启后生效。

## 使用

- 启动后右下角出现角色。
- 拖动角色可移动；单击切换气泡；气泡里的“收起”只隐藏气泡，“隐藏”缩成右下角小圆点。
- 状态映射：
  - `turn/start` → 工作；
  - `tool/call` → 工作，`ask_user_question` → 等待；
  - `approval/asked` → 等待；
  - `tool/result` → 工作；
  - `todo/write` → 更新任务标题与 `completed/total`；
  - `turn/end: completed` → 完成（8 秒后回到待机）；
  - `turn/end: error/max-tokens/timeout` → 出错；
  - `turn/end: blocked` → 等待；
  - `agent/error` → 出错。

宿主路由：`GET /claude-pet-dsh/state`、`/claude-pet-dsh/spritesheet.webp`、`/claude-pet-dsh/health`。

## 自定义角色

`assets/spritesheet.webp` 是 Petdex 兼容的 8×9 图集（1536×1872，192×208 单元格），行序：

0 idle、1 running-right、2 running-left、3 waving、4 jumping、5 failed、6 waiting、7 running、8 review。

替换这个文件即可换角色；`client.js` 里的 `ROWS` 控制状态到行/帧数的映射。

## 兼容性

- 目标：DSH `0.2.1-rc.5`；已在 `web` profile 加载，`desktop` profile 安装后需重启 DSH 生效。
- 插件不读取对话正文，只消费会话事件中的状态、工具名和 todo 标题。
- 浏览器端使用 DSH 的 `shell.overlay` slot；如果宿主升级改了 slot 名称，需要在 `client.js` 的 `apply()` 里同步调整。
- 这是应用内 overlay，不是独立的操作系统透明悬浮窗。

## 来源与许可

MIT，Copyright (c) 2026 State Interface contributors。桌宠形象与图集取自 State Interface 项目（`state-interface` / `state-interface-pet`）的角色资源，本仓库由该项目的 `dsh-plugin` 改名整理而来；独立社区项目，与 Anthropic 无官方关联。
