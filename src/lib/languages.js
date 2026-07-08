export const COMMON_LANGUAGE_OPTIONS = [
  { label: '简体中文（Chinese Simplified）', value: '简体中文' },
  { label: '繁体中文（Chinese Traditional）', value: '繁体中文' },
  { label: '英文（English）', value: '英文' },
  { label: '日语（日本語）', value: '日语' },
  { label: '韩语（한국어）', value: '韩语' },
  { label: '法语（Français）', value: '法语' },
  { label: '德语（Deutsch）', value: '德语' },
  { label: '西班牙语（Español）', value: '西班牙语' },
  { label: '俄语（Русский）', value: '俄语' },
  { label: '葡萄牙语（Português）', value: '葡萄牙语' },
  { label: '意大利语（Italiano）', value: '意大利语' },
  { label: '阿拉伯语（العربية）', value: '阿拉伯语' },
  { label: '印地语（हिन्दी）', value: '印地语' },
  { label: '印尼语（Bahasa Indonesia）', value: '印尼语' },
  { label: '越南语（Tiếng Việt）', value: '越南语' },
  { label: '泰语（ไทย）', value: '泰语' },
  { label: '马来语（Bahasa Melayu）', value: '马来语' },
  { label: '土耳其语（Türkçe）', value: '土耳其语' },
  { label: '荷兰语（Nederlands）', value: '荷兰语' },
  { label: '波兰语（Polski）', value: '波兰语' },
  { label: '乌克兰语（Українська）', value: '乌克兰语' },
  { label: '希腊语（Ελληνικά）', value: '希腊语' },
  { label: '瑞典语（Svenska）', value: '瑞典语' },
  { label: '挪威语（Norsk）', value: '挪威语' },
  { label: '丹麦语（Dansk）', value: '丹麦语' },
  { label: '芬兰语（Suomi）', value: '芬兰语' },
  { label: '捷克语（Čeština）', value: '捷克语' },
  { label: '匈牙利语（Magyar）', value: '匈牙利语' },
  { label: '罗马尼亚语（Română）', value: '罗马尼亚语' },
  { label: '保加利亚语（Български）', value: '保加利亚语' },
  { label: '克罗地亚语（Hrvatski）', value: '克罗地亚语' },
  { label: '斯洛伐克语（Slovenčina）', value: '斯洛伐克语' },
  { label: '斯洛文尼亚语（Slovenščina）', value: '斯洛文尼亚语' },
  { label: '塞尔维亚语（Српски）', value: '塞尔维亚语' },
  { label: '希伯来语（עברית）', value: '希伯来语' },
  { label: '波斯语（فارسی）', value: '波斯语' },
  { label: '乌尔都语（اردو）', value: '乌尔都语' },
  { label: '孟加拉语（বাংলা）', value: '孟加拉语' },
  { label: '泰米尔语（தமிழ்）', value: '泰米尔语' },
  { label: '泰卢固语（తెలుగు）', value: '泰卢固语' },
  { label: '马拉地语（मराठी）', value: '马拉地语' },
  { label: '古吉拉特语（ગુજરાતી）', value: '古吉拉特语' },
  { label: '菲律宾语（Filipino）', value: '菲律宾语' },
  { label: '缅甸语（မြန်မာ）', value: '缅甸语' },
  { label: '高棉语（ភាសាខ្មែរ）', value: '高棉语' },
  { label: '老挝语（ລາວ）', value: '老挝语' },
  { label: '尼泊尔语（नेपाली）', value: '尼泊尔语' },
  { label: '僧伽罗语（සිංහල）', value: '僧伽罗语' },
  { label: '斯瓦希里语（Kiswahili）', value: '斯瓦希里语' },
  { label: '南非荷兰语（Afrikaans）', value: '南非荷兰语' },
  { label: '拉丁语（Latina）', value: '拉丁语' }
]

export const DEFAULT_TARGET_LANGUAGE = '简体中文'

const LANGUAGE_ALIASES = {
  中文: DEFAULT_TARGET_LANGUAGE
}

export const SOURCE_LANGUAGE_OPTIONS = [
  { label: '自动检测（Auto）', value: 'auto' },
  ...COMMON_LANGUAGE_OPTIONS
]

export function ensureLanguageOption(options, value) {
  const normalized = normalizeLanguageValue(value)
  if (!normalized || options.some(item => item.value === normalized)) return options
  return [{ label: normalized, value: normalized }, ...options]
}

export function filterLanguageOption(input, option) {
  const keyword = input.trim().toLowerCase()
  if (!keyword) return true
  return `${option.label} ${option.value}`.toLowerCase().includes(keyword)
}

export function normalizeLanguageValue(value, fallback = '') {
  const text = String(value || '').trim()
  if (!text) return fallback
  return LANGUAGE_ALIASES[text] || text
}
