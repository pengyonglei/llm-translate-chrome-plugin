const DNR_RULE_ID = 1001

const PROVIDER_DEFAULTS = {
  deepseek:   { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', baseUrlLocked: true },
  bailian:    { baseUrl: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo', baseUrlLocked: false },
  volcengine: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-1-5-pro-32k-250115', baseUrlLocked: true },
  minimax:    { baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M3', baseUrlLocked: true },
  zhipu:      { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2', baseUrlLocked: true },
  openai:     { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', baseUrlLocked: false },
  ollama:     { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', baseUrlLocked: false }
}

// 用 declarativeNetRequest 移除内网 API 请求的 Origin 头，避免 403
async function updateOriginRule(baseUrl) {
  if (!baseUrl) return

  try {
    const host = new URL(baseUrl).hostname
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
      addRules: [{
        id: DNR_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'origin', operation: 'remove' }
          ]
        },
        condition: {
          urlFilter: `||${host}`,
          resourceTypes: ['xmlhttprequest']
        }
      }]
    })
  } catch (err) {
    console.warn('declarativeNetRequest 规则设置失败:', err.message)
  }
}

// 监听配置变化，动态更新规则
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.baseUrl) {
    updateOriginRule(changes.baseUrl.newValue)
  }
})

const cache = new Map()
const CACHE_TTL = 10 * 60 * 1000
const CACHE_MAX = 500
const DEFAULT_TARGET_LANGUAGE = '简体中文'
const REQUEST_TIMEOUT_MS = 45000
const REQUEST_RETRY_MAX = 2
const BATCH_PARSE_RETRY_MAX = 1
const HISTORY_KEY = 'translationHistory'
const HISTORY_MAX = 200
const TEST_SYSTEM_PROMPT = '你是一个 API 连通性测试助手。'
const TEST_USER_PROMPT = '请只回复 OK。'

function getCacheKey(text, sourceLang, targetLang) {
  return `${sourceLang || 'auto'}::${targetLang || ''}::${text}`
}

function getCached(text, sourceLang, targetLang) {
  const entry = cache.get(getCacheKey(text, sourceLang, targetLang))
  if (entry && Date.now() - entry.time < CACHE_TTL) {
    return entry.result
  }
  cache.delete(getCacheKey(text, sourceLang, targetLang))
  return null
}

function setCache(text, sourceLang, targetLang, result) {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
  cache.set(getCacheKey(text, sourceLang, targetLang), { result, time: Date.now() })
}

async function getConfig() {
  const DEFAULTS = {
    provider: 'deepseek', apiKey: '', baseUrl: '', model: '',
    targetLang: DEFAULT_TARGET_LANGUAGE, theme: 'system', disableThinking: true
  }
  const result = normalizeApiConfig(await chrome.storage.sync.get(DEFAULTS))
  result.targetLang = normalizeTargetLanguage(result.targetLang)
  return result
}

function normalizeApiConfig(config = {}) {
  const result = { ...config }
  result.provider = result.provider || 'deepseek'
  const defaults = PROVIDER_DEFAULTS[result.provider]
  if (!result.baseUrl && defaults) result.baseUrl = defaults.baseUrl
  if (!result.model && defaults) result.model = defaults.model
  result.apiKey = result.apiKey || ''
  result.disableThinking = result.disableThinking !== false
  return result
}

function normalizeTargetLanguage(value) {
  const text = String(value || '').trim()
  if (!text || text === '中文') return DEFAULT_TARGET_LANGUAGE
  return text
}

async function translate(text, config) {
  const { provider, baseUrl, apiKey, model, targetLang, sourceLang, disableThinking } = config

  if (!baseUrl || !model) {
    throw new Error('请完成 API 配置')
  }

  const sourceInstruction = sourceLang && sourceLang !== 'auto'
    ? `用户提供的文本原文语言是${sourceLang}，`
    : '请自动识别用户提供文本的原文语言，'
  const systemPrompt = `你是一个专业的翻译助手。${sourceInstruction}请将用户提供的文本翻译成${targetLang}。只返回翻译结果，不要添加任何解释、引号或额外内容。如果文本已经是${targetLang}，直接返回原文。请尽量保留原始格式：Markdown 标题、列表、表格、引用、链接、代码块围栏、缩进、换行、代码注释标记和项目符号都应保留；代码内容、变量名、命令、URL、占位符和表格分隔符不要翻译，只翻译其中自然语言说明。`
  return requestChatCompletion(systemPrompt, text, config)
}

async function requestChatCompletion(systemPrompt, userPrompt, config) {
  const { baseUrl, apiKey, model } = config
  if (!baseUrl || !model) {
    throw new Error('请完成 API 配置')
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const body = createChatCompletionBody(systemPrompt, userPrompt, config)

  return retryOperation(
    () => fetchChatCompletion(url, body, apiKey),
    REQUEST_RETRY_MAX,
    isRetryableApiError
  )
}

async function testModelConnection(config) {
  const normalized = normalizeApiConfig(config)
  const { baseUrl, apiKey, model } = normalized
  if (!baseUrl || !model) {
    throw new Error('请完成 API 配置')
  }

  const activeConfig = await getConfig()
  if (baseUrl !== activeConfig.baseUrl) {
    await updateOriginRule(baseUrl)
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const body = createChatCompletionBody(TEST_SYSTEM_PROMPT, TEST_USER_PROMPT, normalized, {
    temperature: 0,
    maxTokens: 16
  })
  try {
    const startTime = Date.now()
    const content = await fetchChatCompletion(url, body, apiKey)
    return {
      latencyMs: Date.now() - startTime,
      content
    }
  } finally {
    if (baseUrl !== activeConfig.baseUrl && activeConfig.baseUrl) {
      await updateOriginRule(activeConfig.baseUrl)
    }
  }
}

function createChatCompletionBody(systemPrompt, userPrompt, config, options = {}) {
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096
  }

  applyProviderBodyOptions(body, config)
  return body
}

function applyProviderBodyOptions(body, config) {
  const { provider, disableThinking } = config

  // DeepSeek：开关只控制是否禁用思考模式；开启时不设置 reasoning_effort，使用平台默认强度。
  if (provider === 'deepseek') {
    body.thinking = { type: disableThinking ? 'disabled' : 'enabled' }
  }

  // 智谱 AI：开关只控制是否禁用思考模式；开启时不设置思考强度，使用平台默认行为。
  if (provider === 'zhipu') {
    body.thinking = { type: disableThinking ? 'disabled' : 'enabled' }
  }

  // 阿里云百炼：通过 enable_thinking 控制深度思考模式
  if (provider === 'bailian' && disableThinking) {
    body.enable_thinking = false
  }

  // 火山方舟：使用 thinking.type 控制思考模式，兼容 OpenAI 格式
  if (provider === 'volcengine') {
    body.thinking = { type: disableThinking ? 'disabled' : 'enabled' }
  }

  // MiniMax：使用 thinking.type 控制思考模式；adaptive 为开启，disabled 为关闭。
  // M2.x 系列模型 thinking 无法关闭，传入 disabled 仍会保持开启。
  // 必须同时设置 reasoning_split: true，将思考内容拆分到 reasoning_details 字段，
  // 否则思考内容会以 <think> 标签混入 content 字段。
  if (provider === 'minimax') {
    body.thinking = { type: disableThinking ? 'disabled' : 'adaptive' }
    body.reasoning_split = true
  }
}

async function fetchChatCompletion(url, body, apiKey) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeout = new Error('API 请求超时，请稍后重试')
      timeout.retryable = true
      throw timeout
    }
    err.retryable = true
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let errText
    try { errText = await response.text() } catch {}
    const err = new Error(`API 请求失败 (${response.status}) [${url}]: ${errText || '无响应内容'}`)
    err.status = response.status
    err.retryable = response.status === 429 || response.status >= 500
    throw err
  }

  let data
  try {
    data = await response.json()
  } catch {
    const err = new Error('API 响应 JSON 解析失败')
    err.retryable = true
    throw err
  }
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim()
}

async function retryOperation(operation, maxRetries, shouldRetry) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (err) {
      lastError = err
      if (attempt >= maxRetries || !shouldRetry(err)) break
      await wait(500 * (attempt + 1))
    }
  }
  throw lastError
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableApiError(err) {
  return Boolean(err?.retryable)
}

function isRetryableBatchError(err) {
  return Boolean(err?.retryable || err?.message?.includes('批量翻译返回'))
}

async function translateBatch(texts, config) {
  const { targetLang, sourceLang } = config
  const sourceInstruction = sourceLang && sourceLang !== 'auto'
    ? `这些文本的原文语言是${sourceLang}，`
    : '请自动识别每段文本的原文语言，'
  const systemPrompt = `你是一个专业的网页翻译助手。${sourceInstruction}请把用户提供的 JSON 字符串数组逐项翻译成${targetLang}。必须只返回一个 JSON 字符串数组，数组长度和顺序必须与输入完全一致；不要返回 Markdown、解释、编号或额外字段。如果某一项已经是${targetLang}，该项直接返回原文。请保留每一项的标点、数字、专有名词、原有语气、列表符号、表格单元含义、代码注释标记和前后空白意图；URL、变量名、命令、代码片段和占位符不要翻译。`
  return retryOperation(async () => {
    const raw = await requestChatCompletion(systemPrompt, JSON.stringify(texts), config)
    const parsed = parseJsonArray(raw)
    if (parsed.length !== texts.length) {
      const err = new Error('批量翻译返回数量不一致')
      err.retryable = true
      throw err
    }
    return parsed
  }, BATCH_PARSE_RETRY_MAX, isRetryableBatchError)
}

function parseJsonArray(raw) {
  const text = String(raw || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.map(item => String(item ?? ''))
  } catch {}

  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start >= 0 && end > start) {
    const parsed = JSON.parse(text.slice(start, end + 1))
    if (Array.isArray(parsed)) return parsed.map(item => String(item ?? ''))
  }

  const err = new Error('批量翻译返回格式异常')
  err.retryable = true
  throw err
}

async function addTranslationHistory(record) {
  const history = await getTranslationHistory()
  const item = normalizeHistoryRecord(record)
  const next = [item, ...history].slice(0, HISTORY_MAX)
  await chrome.storage.local.set({ [HISTORY_KEY]: next })
  return next
}

async function getTranslationHistory() {
  const result = await chrome.storage.local.get({ [HISTORY_KEY]: [] })
  return Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : []
}

function normalizeHistoryRecord(record) {
  const now = Date.now()
  return {
    id: record.id || `${now}-${Math.random().toString(36).slice(2, 8)}`,
    type: record.type || 'manual',
    sourceText: limitHistoryText(record.sourceText),
    translatedText: limitHistoryText(record.translatedText),
    sourceLang: record.sourceLang || 'auto',
    targetLang: record.targetLang || '',
    title: record.title || '',
    url: record.url || '',
    mode: record.mode || '',
    count: Number(record.count || 0),
    createdAt: record.createdAt || now
  }
}

function limitHistoryText(text) {
  const value = String(text || '').trim()
  return value.length > 12000 ? `${value.slice(0, 12000)}…` : value
}

async function translateActiveTabPage(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'translatePage' })
  } catch (err) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] })
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] })
      return await chrome.tabs.sendMessage(tabId, { type: 'translatePage' })
    } catch (injectErr) {
      console.warn('整页翻译启动失败:', injectErr.message || err.message)
      return { ok: false, error: '当前页面无法启动整页翻译' }
    }
  }
}

// 扩展安装/更新时，加载已有配置并设置规则
chrome.runtime.onInstalled.addListener(async () => {
  const config = await getConfig()
  if (config.baseUrl) await updateOriginRule(config.baseUrl)
})

// 首次激活时也尝试设置规则（service worker 可能被延迟唤醒）
;(async () => {
  try {
    const config = await getConfig()
    if (config.baseUrl) await updateOriginRule(config.baseUrl)
  } catch {}
})()

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'openPopup') {
    chrome.action.openPopup()
    return
  }

  if (request.type === 'translate') {
    (async () => {
      try {
        const config = await getConfig()
        const sourceLang = request.sourceLang || 'auto'
        const targetLang = normalizeTargetLanguage(request.targetLang || config.targetLang)
        const cached = getCached(request.text, sourceLang, targetLang)
        if (cached) {
          await maybeAddTranslationHistory(request, cached, sourceLang, targetLang, sender)
          sendResponse({ ok: true, data: cached })
          return
        }

        const result = await translate(request.text, { ...config, sourceLang, targetLang })
        setCache(request.text, sourceLang, targetLang, result)
        await maybeAddTranslationHistory(request, result, sourceLang, targetLang, sender)
        sendResponse({ ok: true, data: result })
      } catch (err) {
        sendResponse({ ok: false, error: err.message || '翻译失败' })
      }
    })()
    return true
  }

  if (request.type === 'testModelConnection') {
    (async () => {
      try {
        const result = await testModelConnection(request.config || {})
        sendResponse({ ok: true, data: result })
      } catch (err) {
        sendResponse({ ok: false, error: err.message || '模型测试失败' })
      }
    })()
    return true
  }

  if (request.type === 'translateBatch') {
    (async () => {
      try {
        const texts = Array.isArray(request.texts) ? request.texts.map(text => String(text || '')) : []
        if (!texts.length || texts.length > 80) {
          sendResponse({ ok: false, error: '批量翻译文本数量异常' })
          return
        }

        const config = await getConfig()
        const sourceLang = request.sourceLang || 'auto'
        const targetLang = normalizeTargetLanguage(request.targetLang || config.targetLang)
        const results = new Array(texts.length)
        const pending = []

        texts.forEach((text, index) => {
          const cached = getCached(text, sourceLang, targetLang)
          if (cached) {
            results[index] = cached
          } else {
            pending.push({ text, index })
          }
        })

        if (pending.length) {
          const translated = await translateBatch(pending.map(item => item.text), { ...config, sourceLang, targetLang })
          translated.forEach((text, index) => {
            const original = pending[index]
            results[original.index] = text
            setCache(original.text, sourceLang, targetLang, text)
          })
        }

        sendResponse({ ok: true, data: results })
      } catch (err) {
        sendResponse({ ok: false, error: err.message || '批量翻译失败' })
      }
    })()
    return true
  }

  if (request.type === 'addTranslationHistory') {
    (async () => {
      try {
        await addTranslationHistory(request.record || {})
        sendResponse({ ok: true })
      } catch (err) {
        sendResponse({ ok: false, error: err.message || '历史记录保存失败' })
      }
    })()
    return true
  }
})

async function maybeAddTranslationHistory(request, result, sourceLang, targetLang, sender) {
  if (!request.historyType) return
  await addTranslationHistory({
    type: request.historyType,
    sourceText: request.text,
    translatedText: result,
    sourceLang,
    targetLang,
    title: request.title || sender?.tab?.title || '',
    url: request.url || sender?.tab?.url || ''
  })
}

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'translate-page') return
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab?.id) return
  await translateActiveTabPage(tab.id)
})
