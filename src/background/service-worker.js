const DNR_RULE_ID = 1001

const PROVIDER_DEFAULTS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', baseUrlLocked: true },
  bailian:  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo', baseUrlLocked: true },
  zhipu:    { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2', baseUrlLocked: true },
  openai:   { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', baseUrlLocked: false },
  ollama:   { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', baseUrlLocked: false }
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
  const result = await chrome.storage.sync.get(DEFAULTS)
  const defaults = PROVIDER_DEFAULTS[result.provider]
  if (!result.baseUrl && defaults) result.baseUrl = defaults.baseUrl
  if (!result.model && defaults) result.model = defaults.model
  result.targetLang = normalizeTargetLanguage(result.targetLang)
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
  const systemPrompt = `你是一个专业的翻译助手。${sourceInstruction}请将用户提供的文本翻译成${targetLang}。只返回翻译结果，不要添加任何解释、引号或额外内容。如果文本已经是${targetLang}，直接返回原文。**注意**：如果用户提供的文本中包含换行的格式，在翻译的结果中也一并把格式带上。`
  return requestChatCompletion(systemPrompt, text, config)
}

async function requestChatCompletion(systemPrompt, userPrompt, config) {
  const { provider, baseUrl, apiKey, model, disableThinking } = config
  if (!baseUrl || !model) {
    throw new Error('请完成 API 配置')
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 4096
  }

  // DeepSeek：开关只控制是否禁用思考模式；开启时不设置 reasoning_effort，使用平台默认强度。
  if (provider === 'deepseek') {
    body.thinking = { type: disableThinking ? 'disabled' : 'enabled' }
  }

  // 智谱 AI：开关只控制是否禁用思考模式；开启时不设置思考强度，使用平台默认行为。
  if (provider === 'zhipu') {
    body.thinking = { type: disableThinking ? 'disabled' : 'enabled' }
  }

  // 阿里云百炼：关闭深度思考模式
  if (provider === 'bailian' && disableThinking) {
    body.enable_thinking = false
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    let err
    try { err = await response.text() } catch {}
    throw new Error(`API 请求失败 (${response.status}) [${url}]: ${err || '无响应内容'}`)
  }

  const data = await response.json()
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim()
}

async function translateBatch(texts, config) {
  const { targetLang, sourceLang } = config
  const sourceInstruction = sourceLang && sourceLang !== 'auto'
    ? `这些文本的原文语言是${sourceLang}，`
    : '请自动识别每段文本的原文语言，'
  const systemPrompt = `你是一个专业的网页翻译助手。${sourceInstruction}请把用户提供的 JSON 字符串数组逐项翻译成${targetLang}。必须只返回一个 JSON 字符串数组，数组长度和顺序必须与输入完全一致；不要返回 Markdown、解释、编号或额外字段。如果某一项已经是${targetLang}，该项直接返回原文。请保留每一项的标点、数字、专有名词和原有语气。`
  const raw = await requestChatCompletion(systemPrompt, JSON.stringify(texts), config)
  return parseJsonArray(raw)
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

  throw new Error('批量翻译返回格式异常')
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
          sendResponse({ ok: true, data: cached })
          return
        }

        const result = await translate(request.text, { ...config, sourceLang, targetLang })
        setCache(request.text, sourceLang, targetLang, result)
        sendResponse({ ok: true, data: result })
      } catch (err) {
        sendResponse({ ok: false, error: err.message || '翻译失败' })
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
          if (translated.length !== pending.length) {
            throw new Error('批量翻译返回数量不一致')
          }
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
})

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'translate-page') return
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab?.id) return
  await translateActiveTabPage(tab.id)
})
