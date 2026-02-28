# bridge-feishu

将 [open-research](https://github.com/opencode-ai/openresearch) 接入飞书的 Bridge Adapter。

## 功能

- 飞书私聊 / 群聊收到消息 → 派发研究任务
- 实时将 AI 回复更新到飞书卡片（500ms 节流）
- 群聊支持 `@机器人` 触发模式
- 自动持久化会话映射（重启不丢失上下文）

## 前置条件

1. **运行 research server**

   ```bash
   research serve --port 4096
   ```

2. **飞书开放平台配置**
   - 创建自建应用
   - 开启 **机器人** 能力
   - 添加事件权限：`im:message:receive_v1`
   - 添加 API 权限：`im:message`、`im:message:send_as_bot`
   - 连接方式选择 **长连接（WebSocket）**

## 安装

```bash
cd packages/bridge-feishu
bun install
```

## 配置

复制 `.env.example` 为 `.env` 并填写飞书应用凭证：

```bash
cp .env.example .env
```

| 变量 | 必填 | 说明 |
|------|------|------|
| `FEISHU_APP_ID` | ✓ | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | ✓ | 飞书应用 App Secret |
| `RESEARCH_SERVER_URL` | — | research serve 地址，默认 `http://127.0.0.1:4096` |
| `FEISHU_REQUIRE_MENTION` | — | 群聊是否需要 @机器人，默认 `false` |
| `RESEARCH_AGENT` | — | 指定 agent（research/plan/review/game） |
| `RESEARCH_MODEL` | — | 指定模型，格式 `providerID/modelID` |

## 启动

```bash
# 方式一：使用 .env 文件
bun run dev

# 方式二：直接设置环境变量
FEISHU_APP_ID=cli_xxx \
FEISHU_APP_SECRET=xxx \
RESEARCH_SERVER_URL=http://127.0.0.1:4096 \
bun run src/index.ts
```

## 扩展到其他平台

实现 `@opencode-ai/bridge` 中的 `ChannelAdapter` 接口，然后传入 `BridgeEngine`：

```typescript
import { BridgeEngine } from "@opencode-ai/bridge"
import { MyAdapter } from "./my-adapter"

const engine = new BridgeEngine({
  serverUrl: "http://127.0.0.1:4096",
  adapters: [new MyAdapter(...)],
})
await engine.start()
```
