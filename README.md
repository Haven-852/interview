# 镜面

本地运行的面试练习智能体。材料留在浏览器里，用来准备简历和岗位、做模拟面试、整理可核对的回答，并在结束后复盘。

## 启动

```bash
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。不配置模型时使用演示引擎，可以直接用示例候选人走完一轮。

构建后单独启动：

```bash
npm run build
npm start
```

## 接入模型

在「模型设置」填写兼容 OpenAI 的地址、模型和密钥，或复制 `.env.example` 为 `.env`：

```bash
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

本机 Ollama 可以把地址设为 `http://127.0.0.1:11434/v1`，密钥填任意非空值，例如 `ollama`。

## 检查

```bash
npm run check
```
