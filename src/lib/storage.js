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
