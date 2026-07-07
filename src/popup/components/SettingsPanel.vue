<template>
  <div class="settings-panel">
    <div class="theme-strip">
      <div>
        <div class="theme-title">界面主题</div>
        <div class="theme-subtitle">独立于模型预设</div>
      </div>
      <a-segmented
        v-model:value="selectedTheme"
        size="small"
        :options="themeOptions"
        @change="saveTheme"
      />
    </div>

    <div class="settings-toolbar">
      <div>
        <div class="settings-title">模型预设</div>
        <div class="settings-subtitle">{{ presetRows.length }} 个配置</div>
      </div>
      <a-button type="primary" size="small" @click="openAdd">
        <template #icon><PlusOutlined /></template>
        新增
      </a-button>
    </div>

    <a-empty v-if="presetRows.length === 0" class="empty-state" description="暂无模型预设">
      <a-button type="primary" size="small" @click="openAdd">新增预设</a-button>
    </a-empty>

    <a-list v-else class="model-list" :data-source="presetRows">
      <template #renderItem="{ item }">
        <a-list-item class="model-item">
          <div class="model-main">
            <div class="model-head">
              <span class="model-name">{{ item.name }}</span>
              <a-tag v-if="isActive(item.name)" color="green">使用中</a-tag>
            </div>
            <div class="model-meta">
              <span>{{ providerName(item.provider) }}</span>
              <span>{{ item.model || '未配置模型' }}</span>
            </div>
            <div class="model-url">{{ item.baseUrl || '未配置 API 地址' }}</div>
          </div>
          <div class="model-actions">
            <a-tooltip title="设为使用">
              <a-button
                shape="circle"
                size="small"
                :type="isActive(item.name) ? 'primary' : 'default'"
                @click="setActive(item.name)"
              >
                <template #icon><CheckOutlined /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip title="编辑">
              <a-button shape="circle" size="small" @click="openEdit(item.name)">
                <template #icon><EditOutlined /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip title="删除">
              <a-button shape="circle" size="small" danger @click="deleteModel(item.name)">
                <template #icon><DeleteOutlined /></template>
              </a-button>
            </a-tooltip>
          </div>
        </a-list-item>
      </template>
    </a-list>

    <a-drawer
      v-model:open="drawerOpen"
      :title="drawerTitle"
      placement="right"
      :width="320"
      :body-style="{ padding: '12px' }"
      :header-style="{ padding: '12px 16px' }"
    >
      <a-form layout="vertical" size="small">
        <a-form-item label="预设名称" required>
          <a-input v-model:value="form.name" placeholder="例如：内网 Ollama" />
        </a-form-item>

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

        <a-form-item label="禁用深度思考模式">
          <a-switch v-model:checked="form.disableThinking" />
        </a-form-item>
      </a-form>

      <template #footer>
        <div class="drawer-footer">
          <a-button @click="drawerOpen = false">取消</a-button>
          <a-button type="primary" @click="saveModel">保存</a-button>
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<script setup>
import { computed, createVNode, reactive, ref, onMounted } from 'vue'
import { ExclamationCircleOutlined, CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import { getConfig, getPresets, setConfig } from '../../lib/storage.js'

const PROVIDER_NAMES = {
  deepseek: 'DeepSeek',
  bailian: '阿里云百炼',
  openai: 'OpenAI 兼容',
  ollama: 'Ollama'
}

const PROVIDER_DEFAULTS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash', locked: true },
  bailian:  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo', locked: true },
  openai:   { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', locked: false },
  ollama:   { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', locked: false }
}

const presets = ref({})
const activePresetName = ref('')
const currentConfig = ref({})
const drawerOpen = ref(false)
const drawerMode = ref('add')
const editingName = ref('')
const selectedTheme = ref('system')

const themeOptions = [
  { label: '系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' }
]

const form = reactive(createEmptyForm())

const isLocked = ref(false)
const apiKeyPlaceholder = ref('sk-...')
const apiUrlPlaceholder = ref('')
const modelPlaceholder = ref('')

const presetRows = computed(() => {
  return Object.entries(presets.value).map(([name, preset]) => ({ name, ...preset }))
})

const drawerTitle = computed(() => drawerMode.value === 'edit' ? '编辑模型预设' : '新增模型预设')

onMounted(loadData)

function createEmptyForm() {
  return {
    name: '',
    provider: 'deepseek',
    apiKey: '',
    baseUrl: '',
    model: '',
    targetLang: '简体中文',
    disableThinking: true,
    triggerMode: 'click'
  }
}

async function loadData() {
  const [presetData, cfg, meta] = await Promise.all([
    getPresets(),
    getConfig(),
    chrome.storage.sync.get({ activePresetName: '', theme: 'system' })
  ])
  presets.value = presetData || {}
  currentConfig.value = cfg || {}
  activePresetName.value = meta.activePresetName || ''
  selectedTheme.value = meta.theme || 'system'
}

function resetForm(values = {}) {
  Object.assign(form, createEmptyForm(), values)
  updatePlaceholders(form.provider)
}

function openAdd() {
  drawerMode.value = 'add'
  editingName.value = ''
  resetForm()
  updatePlaceholders(form.provider, true)
  drawerOpen.value = true
}

function openEdit(name) {
  const preset = presets.value[name]
  if (!preset) return
  drawerMode.value = 'edit'
  editingName.value = name
  resetForm({ name, ...preset })
  drawerOpen.value = true
}

function onProviderChange(provider) {
  updatePlaceholders(provider, true)
}

function updatePlaceholders(provider, resetValues = false) {
  const d = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.deepseek
  isLocked.value = d.locked
  apiUrlPlaceholder.value = d.baseUrl
  modelPlaceholder.value = d.model
  apiKeyPlaceholder.value = provider === 'ollama' ? 'Ollama 通常无需填写' : 'sk-...'
  if (d.locked || resetValues) form.baseUrl = d.baseUrl
  if (resetValues) form.model = d.model
}

async function saveModel() {
  const name = form.name.trim()
  if (!name) {
    showToast('请输入预设名称')
    return
  }

  if (drawerMode.value === 'add' && presets.value[name]) {
    showToast('预设名称已存在')
    return
  }

  if (drawerMode.value === 'edit' && name !== editingName.value && presets.value[name]) {
    showToast('预设名称已存在')
    return
  }

  const nextPresets = { ...presets.value }
  if (drawerMode.value === 'edit' && editingName.value && editingName.value !== name) {
    delete nextPresets[editingName.value]
  }

  const normalized = normalizePreset(form)
  const wasActive = drawerMode.value === 'edit' && isActive(editingName.value)
  nextPresets[name] = normalized
  presets.value = nextPresets
  await chrome.storage.sync.set({ translationPresets: nextPresets })

  if (wasActive) {
    activePresetName.value = name
    await chrome.storage.sync.set({ activePresetName: name })
    await applyModelConfig(normalized)
  }

  drawerOpen.value = false
  showToast(drawerMode.value === 'edit' ? '预设已更新' : '预设已新增')
}

async function setActive(name) {
  const preset = presets.value[name]
  if (!preset) return
  await applyModelConfig(preset)
  await chrome.storage.sync.set({ activePresetName: name })
  activePresetName.value = name
  showToast(`已使用「${name}」`)
}

function deleteModel(name) {
  Modal.confirm({
    title: `删除预设「${name}」？`,
    content: '删除后无法恢复。如果该预设正在使用，只会移除预设记录，不会清空当前模型配置。',
    icon: createVNode(ExclamationCircleOutlined),
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    async onOk() {
      const nextPresets = { ...presets.value }
      delete nextPresets[name]
      presets.value = nextPresets
      await chrome.storage.sync.set({ translationPresets: nextPresets })

      if (activePresetName.value === name) {
        activePresetName.value = ''
        await chrome.storage.sync.set({ activePresetName: '' })
      }

      showToast('预设已删除')
    }
  })
}

function normalizePreset(values) {
  const defaults = PROVIDER_DEFAULTS[values.provider] || PROVIDER_DEFAULTS.deepseek
  return {
    provider: values.provider || 'deepseek',
    apiKey: values.apiKey || '',
    baseUrl: values.baseUrl || defaults.baseUrl,
    model: values.model || defaults.model,
    targetLang: values.targetLang || '简体中文',
    disableThinking: values.disableThinking !== false,
    triggerMode: values.triggerMode || 'click'
  }
}

async function applyModelConfig(preset) {
  const config = { ...normalizePreset(preset), theme: selectedTheme.value }
  await setConfig(config)
  currentConfig.value = config
}

async function saveTheme(theme) {
  selectedTheme.value = theme
  await chrome.storage.sync.set({ theme })
  currentConfig.value = { ...currentConfig.value, theme }
  showToast('主题已更新')
}

function providerName(provider) {
  return PROVIDER_NAMES[provider] || provider || '未知平台'
}

function isActive(name) {
  if (activePresetName.value) return activePresetName.value === name
  const preset = presets.value[name]
  return preset && sameConfig(preset, currentConfig.value)
}

function sameConfig(a, b) {
  const keys = ['provider', 'apiKey', 'baseUrl', 'model', 'targetLang', 'triggerMode']
  return keys.every(key => (a?.[key] || '') === (b?.[key] || '')) &&
    (a?.disableThinking !== false) === (b?.disableThinking !== false)
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
</script>

<style scoped>
.settings-panel {
  min-height: 100%;
  padding: 8px 10px 12px;
  background:
    linear-gradient(135deg, rgba(35, 119, 255, 0.12), transparent 34%),
    linear-gradient(315deg, rgba(14, 201, 167, 0.12), transparent 30%);
}

.theme-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  margin-bottom: 10px;
  border: 1px solid rgba(74, 144, 217, 0.22);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(21, 101, 216, 0.12), rgba(20, 184, 166, 0.12));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.theme-title {
  font-size: 13px;
  font-weight: 800;
  line-height: 18px;
}

.theme-subtitle {
  color: #667085;
  font-size: 11px;
  line-height: 16px;
}

.settings-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 2px;
  margin-bottom: 10px;
}

.settings-title {
  font-size: 15px;
  font-weight: 800;
  line-height: 20px;
}

.settings-subtitle {
  color: #888;
  font-size: 12px;
  line-height: 18px;
}

.empty-state {
  margin-top: 54px;
}

.model-list {
  border-top: none;
}

.model-item {
  align-items: center !important;
  padding: 11px 10px !important;
  margin-bottom: 8px;
  border: 1px solid rgba(74, 144, 217, 0.18) !important;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(244, 250, 255, 0.96)),
    radial-gradient(circle at top right, rgba(20, 184, 166, 0.18), transparent 32%);
  box-shadow: 0 8px 22px rgba(15, 82, 186, 0.08);
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
}

.model-item:hover {
  border-color: rgba(74, 144, 217, 0.42) !important;
  box-shadow: 0 10px 26px rgba(15, 82, 186, 0.14);
  transform: translateY(-1px);
}

.model-main {
  min-width: 0;
  flex: 1;
}

.model-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}

.model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 800;
}

.model-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #345;
  font-size: 12px;
  line-height: 18px;
}

.model-meta span:first-child {
  color: #1677ff;
  font-weight: 700;
}

.model-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-url {
  color: #667085;
  font-size: 11px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

.settings-panel :deep(.ant-segmented) {
  background: rgba(255, 255, 255, 0.74);
}

.settings-panel :deep(.ant-btn-primary:not(:disabled)) {
  background: #1e8cff;
  border-color: #1e8cff;
  box-shadow: 0 7px 16px rgba(30, 140, 255, 0.3);
}

.settings-panel :deep(.ant-btn-primary:not(:disabled):hover) {
  background: #3aa0ff;
  border-color: #3aa0ff;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

:global(.dark .settings-panel) {
  background:
    linear-gradient(135deg, rgba(30, 140, 255, 0.14), transparent 36%),
    linear-gradient(315deg, rgba(20, 184, 166, 0.13), transparent 34%),
    #141414;
}

:global(.dark .theme-strip) {
  border-color: rgba(62, 166, 255, 0.38);
  background: linear-gradient(135deg, rgba(17, 53, 86, 0.88), rgba(9, 55, 49, 0.88));
  box-shadow: inset 0 1px 0 rgba(147, 197, 253, 0.2), 0 8px 20px rgba(0, 0, 0, 0.22);
}

:global(.dark .theme-subtitle),
:global(.dark .settings-subtitle) {
  color: #8ca3b8;
}

:global(.dark .model-item) {
  border-color: rgba(62, 166, 255, 0.28) !important;
  background:
    linear-gradient(135deg, rgba(19, 33, 51, 0.96), rgba(13, 31, 36, 0.96)),
    radial-gradient(circle at top right, rgba(30, 140, 255, 0.18), transparent 34%);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
}

:global(.dark .model-item:hover) {
  border-color: rgba(62, 166, 255, 0.54) !important;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
}

:global(.dark .model-meta) {
  color: #bfd2e5;
}

:global(.dark .model-meta span:first-child) {
  color: #66b8ff;
}

:global(.dark .model-url) {
  color: #8ca3b8;
}

:global(.dark .settings-panel .ant-segmented) {
  background: rgba(255, 255, 255, 0.12);
}
</style>
