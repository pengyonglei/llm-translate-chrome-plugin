import { getProviderDefaults, isProviderLocked, getPresets, savePreset, deletePreset } from '../lib/storage.js'

const $ = (id) => document.getElementById(id)
let currentTab = 'translate'

// ====== Tab 切换 ======

function switchTab(tab) {
  currentTab = tab

  if (tab === 'translate') {
    $('translatePanel').classList.add('active')
    $('settingsPanel').classList.remove('active')
    $('tabNavTitle').textContent = '翻译'
    $('tabNavBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
    $('tabNavBtn').title = '设置'
    updateConfigIndicator()
  } else {
    $('translatePanel').classList.remove('active')
    $('settingsPanel').classList.add('active')
    $('tabNavTitle').textContent = '设置'
    $('tabNavBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`
    $('tabNavBtn').title = '返回'
  }
}

$('tabNavBtn').addEventListener('click', () => {
  switchTab(currentTab === 'translate' ? 'settings' : 'translate')
})

// ====== 配置指示器 ======

async function updateConfigIndicator() {
  const config = await chrome.storage.sync.get({
    provider: 'deepseek', model: ''
  })
  const defaults = getProviderDefaults(config.provider)
  const providerNames = { deepseek: 'DeepSeek', bailian: '阿里云百炼', openai: 'OpenAI' }
  const provider = providerNames[config.provider] || config.provider
  const model = config.model || defaults.model
  $('configIndicator').textContent = model ? `${provider} · ${model}` : '未配置模型'
}

// ====== 配置加载 / 保存 ======

async function loadConfig() {
  const config = await chrome.storage.sync.get({
    provider: 'deepseek', apiKey: '', baseUrl: '', model: '',
    targetLang: '中文', theme: 'system', disableThinking: true,
    triggerMode: 'click'
  })

  $('provider').value = config.provider
  $('apiKey').value = config.apiKey
  $('baseUrl').value = config.baseUrl
  $('model').value = config.model
  $('targetLang').value = config.targetLang
  $('theme').value = config.theme
  $('disableThinking').checked = config.disableThinking
  $('triggerMode').value = config.triggerMode

  updatePlaceholders(config.provider)
  updateConfigIndicator()
  refreshPresetDropdown()
}

function updatePlaceholders(provider) {
  const defaults = getProviderDefaults(provider)
  const locked = isProviderLocked(provider)

  if (locked) {
    $('baseUrl').value = defaults.baseUrl
    $('baseUrl').disabled = true
  } else {
    $('baseUrl').disabled = false
    $('baseUrl').placeholder = defaults.baseUrl
  }

  $('model').placeholder = defaults.model
  $('apiKey').placeholder = defaults.apiKeyPlaceholder || 'sk-...'
}

async function saveConfig() {
  const config = {
    provider: $('provider').value,
    apiKey: $('apiKey').value,
    baseUrl: $('baseUrl').value,
    model: $('model').value,
    targetLang: $('targetLang').value,
    theme: $('theme').value,
    disableThinking: $('disableThinking').checked,
    triggerMode: $('triggerMode').value
  }

  await chrome.storage.sync.set(config)
  showToast('配置已保存')
}

function showToast(msg) {
  const existing = document.querySelector('.popup-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = 'popup-toast'
  toast.textContent = msg
  document.body.appendChild(toast)

  // 触发动画
  requestAnimationFrame(() => { toast.classList.add('show') })

  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 200)
  }, 1800)
}

$('provider').addEventListener('change', function () {
  updatePlaceholders(this.value)

  const locked = isProviderLocked(this.value)
  if (locked) {
    const defaults = getProviderDefaults(this.value)
    $('baseUrl').value = defaults.baseUrl
  }
})

document.querySelectorAll('#settingsPanel select, #settingsPanel input').forEach(el => {
  el.addEventListener('change', saveConfig)

  if (el.type === 'checkbox') return

  let timer
  el.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(saveConfig, 500)
  })
})

// ====== 手动翻译 ======

async function manualTranslate() {
  const text = $('manualInput').value.trim()
  const resultDiv = $('manualResult')

  if (!text) {
    resultDiv.className = 'manual-result error'
    resultDiv.textContent = '请输入要翻译的文本'
    return
  }

  const btn = $('manualTranslateBtn')
  btn.disabled = true
  btn.textContent = '翻译中…'

  resultDiv.className = 'manual-result'
  resultDiv.innerHTML = '<span class="manual-loading">正在翻译…</span>'

  try {
    const response = await chrome.runtime.sendMessage({ type: 'translate', text })
    if (response.ok) {
      resultDiv.innerHTML = `<div class="manual-translated-text">${escapeHtml(response.data)}</div>`
    } else {
      resultDiv.className = 'manual-result error'
      resultDiv.textContent = response.error || '翻译失败'
    }
  } catch (err) {
    resultDiv.className = 'manual-result error'
    resultDiv.textContent = '网络错误，请检查配置和网络连接'
  } finally {
    btn.disabled = false
    btn.textContent = '翻译'
  }
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

$('manualTranslateBtn').addEventListener('click', manualTranslate)

$('manualInput').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    manualTranslate()
  }
})

// ====== API Key 明文切换 ======

let apiKeyVisible = false
$('toggleApiKey').addEventListener('click', () => {
  apiKeyVisible = !apiKeyVisible
  $('apiKey').type = apiKeyVisible ? 'text' : 'password'
  $('toggleApiKey').innerHTML = apiKeyVisible
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
})

// ====== 配置预设 ======

async function refreshPresetDropdown(selectedValue) {
  const presets = await getPresets()
  const select = $('presetSelect')
  const current = selectedValue !== undefined ? selectedValue : select.value

  select.innerHTML = '<option value="">— 载入已存预设 —</option>'
  Object.keys(presets).forEach(name => {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = name
    select.appendChild(opt)
  })

  if (current && presets[current]) select.value = current
  $('deletePresetBtn').disabled = !select.value
}

async function handlePresetLoad(name) {
  if (!name) return
  const presets = await getPresets()
  const preset = presets[name]
  if (!preset) return

  // 先设置提供商（会触发 locked baseUrl 自动填充）
  $('provider').value = preset.provider || 'openai'
  updatePlaceholders(preset.provider || 'openai')

  $('apiKey').value = preset.apiKey || ''
  $('model').value = preset.model || ''
  $('targetLang').value = preset.targetLang || '中文'
  $('disableThinking').checked = preset.disableThinking !== false
  if (preset.triggerMode) $('triggerMode').value = preset.triggerMode

  // baseUrl 仅在非锁定时写入预设值
  if (!isProviderLocked(preset.provider)) {
    $('baseUrl').value = preset.baseUrl || ''
  }

  // 持久化到 storage 使配置即时生效
  await saveConfig()
  showToast(`已载入预设「${name}」`)
}

async function handleSavePreset() {
  const name = $('presetName').value.trim()
  if (!name) {
    $('presetName').focus()
    $('presetName').placeholder = '请输入预设名称！'
    return
  }

  const config = {
    provider: $('provider').value,
    apiKey: $('apiKey').value,
    baseUrl: $('baseUrl').value,
    model: $('model').value,
    targetLang: $('targetLang').value,
    disableThinking: $('disableThinking').checked,
    triggerMode: $('triggerMode').value
  }

  const names = await savePreset(name, config)
  $('presetName').value = ''
  $('presetName').placeholder = '输入新预设名称…'

  // 如果重名则选中它，否则选中新条目
  await refreshPresetDropdown(names.includes(name) ? name : undefined)
  showToast(`预设「${name}」已保存`)
}

async function handleDeletePreset() {
  const name = $('presetSelect').value
  if (!name) return
  if (!confirm(`确定删除预设「${name}」吗？`)) return

  await deletePreset(name)
  await refreshPresetDropdown()
  showToast(`预设「${name}」已删除`)
}

$('presetSelect').addEventListener('change', function () {
  $('deletePresetBtn').disabled = !this.value
  if (this.value) handlePresetLoad(this.value)
})

$('savePresetBtn').addEventListener('click', handleSavePreset)

$('deletePresetBtn').addEventListener('click', handleDeletePreset)

// 恢复占位文字
$('presetName').addEventListener('focus', function () {
  this.placeholder = '输入新预设名称…'
})

// ====== 启动 ======

loadConfig()
