import { DEFAULT_TARGET_LANGUAGE, normalizeLanguageValue } from './languages.js'

const DEFAULTS = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: '',
  model: '',
  targetLang: DEFAULT_TARGET_LANGUAGE,
  theme: 'system',
  disableThinking: true,
  triggerMode: 'click',
  floatingButtonVisible: true
}

const PROVIDER_DEFAULTS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', baseUrlLocked: true, apiKeyPlaceholder: 'sk-...' },
  bailian:  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo', baseUrlLocked: true, apiKeyPlaceholder: 'sk-...' },
  zhipu:    { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2', baseUrlLocked: true, apiKeyPlaceholder: '请输入智谱 API Key' },
  openai:   { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', baseUrlLocked: false, apiKeyPlaceholder: 'sk-...' },
  ollama:   { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', baseUrlLocked: false, apiKeyPlaceholder: 'Ollama 通常无需填写' }
}

export async function getConfig() {
  const result = await chrome.storage.sync.get(DEFAULTS)
  const defaults = PROVIDER_DEFAULTS[result.provider]
  if (!result.baseUrl && defaults) result.baseUrl = defaults.baseUrl
  if (!result.model && defaults) result.model = defaults.model
  result.targetLang = normalizeLanguageValue(result.targetLang, DEFAULT_TARGET_LANGUAGE)
  return result
}

export async function setConfig(config) {
  await chrome.storage.sync.set(config)
}

export function getProviderDefaults(provider) {
  return PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.deepseek
}

export function getProviderModels(provider) {
  const MODELS = {
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    bailian:  ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-turbo-latest', 'qwen-plus-latest', 'qwen-max-latest'],
    zhipu:    ['glm-5.2', 'glm-4.5', 'glm-4.5-flash', 'glm-4-flash'],
    openai:   ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    ollama:   ['llama3.1', 'qwen2.5', 'mistral', 'gemma2']
  }
  return MODELS[provider] || []
}

export function isProviderLocked(provider) {
  const p = PROVIDER_DEFAULTS[provider]
  return p ? p.baseUrlLocked : false
}

const PRESETS_KEY = 'translationPresets'
export const HISTORY_KEY = 'translationHistory'
export const HISTORY_MAX = 200

export async function getPresets() {
  const result = await chrome.storage.sync.get({ [PRESETS_KEY]: {} })
  return result[PRESETS_KEY]
}

export async function savePreset(name, config) {
  const presets = await getPresets()
  presets[name.trim()] = {
    provider: config.provider || '',
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl || '',
    model: config.model || '',
    disableThinking: config.disableThinking !== false
  }
  await chrome.storage.sync.set({ [PRESETS_KEY]: presets })
  return Object.keys(presets)
}

export async function deletePreset(name) {
  const presets = await getPresets()
  delete presets[name]
  await chrome.storage.sync.set({ [PRESETS_KEY]: presets })
  return Object.keys(presets)
}

export async function getTranslationHistory() {
  const result = await chrome.storage.local.get({ [HISTORY_KEY]: [] })
  return Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : []
}

export async function addTranslationHistory(record) {
  const history = await getTranslationHistory()
  const item = normalizeHistoryRecord(record)
  const next = [item, ...history].slice(0, HISTORY_MAX)
  await chrome.storage.local.set({ [HISTORY_KEY]: next })
  return next
}

export async function clearTranslationHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] })
}

export async function deleteTranslationHistoryItem(id) {
  const history = await getTranslationHistory()
  const next = history.filter(item => item.id !== id)
  await chrome.storage.local.set({ [HISTORY_KEY]: next })
  return next
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
