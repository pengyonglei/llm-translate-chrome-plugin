# AI 划词翻译

一款基于 Manifest V3 的 Chrome 扩展，使用大语言模型（LLM）实现网页划词翻译，支持多种 AI 提供商。

## 功能特点

- **划词即译**：选中网页文本后点击图标或立即显示翻译结果。
- **手动输入翻译**：在扩展弹窗中输入文本并翻译，支持 `Ctrl+Enter` 快捷键。
- **多 LLM 提供商**：内置 DeepSeek、阿里云百炼、智谱 AI、OpenAI 兼容接口和 Ollama。
- **可配置触发时机**：支持“点击图标时翻译”和“选中后立即翻译”两种模式。
- **浅色 / 深色主题**：支持跟随系统、浅色、深色三种主题。
- **配置预设**：保存多组 API 配置，按需快速切换。
- **悬浮设置按钮**：网页内可拖拽贴边的设置入口，无需打开弹窗即可配置。
- **翻译缓存**：相同文本重复翻译时直接返回缓存结果，减少 API 调用。
- **内网兼容**：自动移除内网 API 请求的 Origin 头，避免 403 问题。

## 安装

### 从 Chrome 网上应用店

上架后可在 Chrome 网上应用店搜索“AI 划词翻译”安装。

### 开发者模式加载

1. 安装依赖：

   ```bash
   npm install
   ```

2. 构建扩展：

   ```bash
   npm run build
   ```

3. 打开 Chrome，进入 `chrome://extensions/`。
4. 开启右上角“开发者模式”。
5. 点击“加载已解压的扩展程序”。
6. 选择项目下的 `dist` 目录。

> 注意：当前项目使用 Vite 构建，Chrome 加载目录是 `dist`，不是项目根目录。

## 配置

安装后点击扩展栏图标，打开弹窗，进入“设置”面板完成以下配置：

| 配置项 | 说明 |
|---|---|
| **LLM 提供商** | DeepSeek / 阿里云百炼 / 智谱 AI / OpenAI 兼容 / Ollama |
| **API Key** | 对应提供商的 API 密钥 |
| **API 端点** | 自动填充，OpenAI 兼容模式下可自定义 |
| **模型** | 选择使用的模型 |
| **目标语言** | 翻译目标语言，默认为“中文” |
| **翻译触发时机** | 点击图标翻译 / 选中后立即翻译 |
| **主题** | 跟随系统 / 浅色 / 深色 |
| **禁用深度思考** | 关闭 DeepSeek、智谱 AI、阿里云百炼等支持平台的深度思考模式 |

## 使用

### 划词翻译

1. 在任意网页中选中一段文本。
2. 根据触发模式点击翻译图标，或等待翻译结果自动弹出。
3. 在翻译气泡中查看结果，也可复制译文。

### 手动翻译

1. 点击扩展图标打开弹窗。
2. 在文本框中输入或粘贴文本。
3. 点击“翻译”按钮或按 `Ctrl+Enter`。
4. 在下方查看翻译结果。

## 支持的 LLM 提供商

| 提供商 | 默认模型 | 是否锁定 API 端点 |
|---|---|---|
| **DeepSeek** | `deepseek-chat` | 是 |
| **阿里云百炼** | `qwen-turbo` | 是 |
| **智谱 AI** | `glm-5.2` | 是 |
| **OpenAI 兼容** | `gpt-4o-mini` | 否，可自定义 |
| **Ollama** | `llama3.1` | 否，可自定义 |

OpenAI 兼容模式和 Ollama 模式都使用 OpenAI-compatible 接口。内网 Ollama 地址需要填到 `/v1`，例如 `http://192.168.1.10:11434/v1`。

## 项目结构

```text
├── public/
│   ├── manifest.json        # Chrome 扩展清单（Manifest V3）
│   └── icons/               # 扩展图标，构建时复制到 dist/icons
├── src/
│   ├── background/
│   │   └── service-worker.js # 后台 Service Worker
│   ├── content/
│   │   ├── content.js        # 内容脚本
│   │   └── content.css       # 内容脚本样式
│   ├── lib/
│   │   ├── llm-provider.js   # LLM API 调用
│   │   ├── prompt.js         # 翻译提示词构建
│   │   └── storage.js        # 配置读写与预设管理
│   └── popup/
│       ├── main.js           # 弹窗入口
│       ├── App.vue           # 弹窗应用
│       └── components/       # 弹窗组件
├── index.html                # Vite 弹窗 HTML 入口
├── vite.config.js            # 构建配置
└── package.json
```

## 开发

```bash
npm install
npm run build
```

构建后在 Chrome 开发者模式中加载 `dist` 目录。修改代码后重新运行 `npm run build`，然后在扩展管理页刷新扩展。

## 构建 / 打包

生成可加载的扩展目录：

```bash
npm run build
```

构建结果位于 `dist/`。

生成上传 Chrome Web Store 的压缩包时，将 `dist` 目录内的内容压缩成 `.zip`。如果要生成 `.crx`，在 Chrome 扩展管理页面点击“打包扩展程序”，扩展程序根目录选择 `dist`。

## 技术细节

- 基于 **Chrome Manifest V3**，使用 Service Worker 处理后台请求。
- 使用 **declarativeNetRequest** 自动处理跨域 API 请求，移除 Origin 头以兼容部分内网 API。
- 翻译请求通过 `chrome.runtime.sendMessage` 从 Content Script 发送至 Service Worker。
- 结果缓存采用内存 Map，TTL 10 分钟，上限 100 条。
- 配置通过 `chrome.storage.sync` 同步存储。

## License

MIT
