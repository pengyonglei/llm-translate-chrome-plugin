<template>
  <div class="settings-panel">
    <a-form layout="vertical" size="small">
      <a-form-item label="LLM 提供商">
        <a-select v-model:value="form.provider" @change="onProviderChange">
          <a-select-option value="deepseek">DeepSeek</a-select-option>
          <a-select-option value="bailian">阿里云百炼</a-select-option>
          <a-select-option value="openai">OpenAI 兼容</a-select-option>
          <a-select-option value="ollama">Ollama</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item label="API Key">
        <a-input-password v-model:value="form.apiKey" :placeholder="apiKeyPlaceholder" />
      </a-form-item>

      <a-form-item label="API 地址">
        <a-input v-model:value="form.baseUrl" :disabled="isLocked" :placeholder="apiUrlPlaceholder" />
      </a-form-item>

      <a-form-item label="模型">
        <a-input v-model:value="form.model" :placeholder="modelPlaceholder" />
      </a-form-item>

      <a-form-item label="目标语言">
        <a-input v-model:value="form.targetLang" />
      </a-form-item>

      <a-form-item label="翻译触发时机">
        <a-select v-model:value="form.triggerMode">
          <a-select-option value="click">点击图标时翻译</a-select-option>
          <a-select-option value="immediate">选中后立刻翻译</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item label="主题">
        <a-select v-model:value="form.theme">
          <a-select-option value="system">跟随系统</a-select-option>
          <a-select-option value="light">浅色</a-select-option>
          <a-select-option value="dark">深色</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item label="禁用深度思考模式">
        <a-switch v-model:checked="form.disableThinking" />
      </a-form-item>
    </a-form>

    <a-divider />

    <div class="preset-section">
      <div class="preset-label">配置预设</div>
      <div class="preset-row">
        <a-input
          v-model:value="presetName"
          placeholder="输入新预设名称…"
          @press-enter="savePreset"
        />
        <a-button type="primary" ghost size="small" @click="savePreset">保存</a-button>
      </div>
      <div class="preset-row">
        <a-select
          v-model:value="selectedPreset"
          :options="presetOptions"
          placeholder="— 载入已存预设 —"
          style="flex:1"
          @change="loadPreset"
        />
        <a-button
          danger
          size="small"
          :disabled="!selectedPreset"
          @click="deletePreset"
        >✕</a-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { getConfig, setConfig, getProviderDefaults, isProviderLocked, getPresets, savePreset as storeSavePreset, deletePreset as storeDeletePreset } from '../../lib/storage.js'

const PROVIDER_DEFAULTS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash', locked: true },
  bailian:  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo', locked: true },
  openai:   { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', locked: false },
  ollama:   { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', locked: false }
}

const form = reactive({
  provider: 'deepseek',
  apiKey: '',
  baseUrl: '',
  model: '',
  targetLang: '简体中文',
  theme: 'system',
  disableThinking: true,
  triggerMode: 'click'
})

const isLocked = ref(false)
const apiKeyPlaceholder = ref('sk-...')
const apiUrlPlaceholder = ref('')
const modelPlaceholder = ref('')

const presetName = ref('')
const selectedPreset = ref('')
const presetOptions = ref([])

onMounted(async () => {
  const cfg = await getConfig()
  Object.assign(form, cfg)
  updatePlaceholders(cfg.provider)
  refreshPresets()
})

// 自动保存
let saveTimer = null
watch(
  () => ({ ...form }),
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      await setConfig({ ...form })
      showToast('配置已保存')
    }, 600)
  },
  { deep: true }
)

function onProviderChange(val) {
  updatePlaceholders(val, true)
}

function updatePlaceholders(provider, resetValues = false) {
  const d = PROVIDER_DEFAULTS[provider]
  if (!d) return
  isLocked.value = d.locked
  apiUrlPlaceholder.value = d.baseUrl
  modelPlaceholder.value = d.model
  apiKeyPlaceholder.value = provider === 'ollama' ? 'Ollama 通常无需填写' : 'sk-...'
  if (d.locked || resetValues) form.baseUrl = d.baseUrl
  if (resetValues) form.model = d.model
}

function showToast(msg) {
  const existing = document.querySelector('.popup-toast')
  if (existing) existing.remove()
  const toast = document.createElement('div')
  toast.className = 'popup-toast'
  toast.textContent = msg
  document.body.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('show'))
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 200)
  }, 1800)
}

// ====== Presets ======

async function refreshPresets() {
  const presets = await getPresets()
  presetOptions.value = Object.keys(presets).map(name => ({ value: name, label: name }))
}

async function savePreset() {
  const name = presetName.value.trim()
  if (!name) return
  const presets = await getPresets()
  presets[name] = {
    provider: form.provider, apiKey: form.apiKey,
    baseUrl: form.baseUrl, model: form.model,
    targetLang: form.targetLang, disableThinking: form.disableThinking,
    triggerMode: form.triggerMode
  }
  await chrome.storage.sync.set({ translationPresets: presets })
  presetName.value = ''
  await refreshPresets()
  selectedPreset.value = name
  showToast(`预设「${name}」已保存`)
}

async function loadPreset(name) {
  if (!name) return
  const presets = await getPresets()
  const p = presets[name]
  if (!p) return
  Object.assign(form, p)
  updatePlaceholders(p.provider)
  presetName.value = name
  showToast(`已载入预设「${name}」`)
}

async function deletePreset() {
  const name = selectedPreset.value
  if (!name) return
  if (!confirm(`确定删除预设「${name}」吗？`)) return
  const presets = await getPresets()
  delete presets[name]
  await chrome.storage.sync.set({ translationPresets: presets })
  selectedPreset.value = ''
  await refreshPresets()
  showToast(`预设「${name}」已删除`)
}
</script>

<style scoped>
.settings-panel {
  padding: 4px 12px 12px;
}
.preset-section { margin-bottom: 0; }
.preset-label {
  font-size: 11px;
  font-weight: 600;
  color: #666;
  margin-bottom: 6px;
}
.preset-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.preset-row .ant-select { flex: 1; }
</style>
