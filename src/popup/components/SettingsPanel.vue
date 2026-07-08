<template>
  <div class="settings-panel">
    <div class="global-strip" :class="{ collapsed: globalSettingsCollapsed }">
      <div class="global-head" @click="toggleGlobalSettings">
        <div>
          <div class="theme-title">全局设置</div>
          <div class="theme-subtitle">独立于模型预设</div>
        </div>
        <a-button
          class="global-toggle"
          shape="circle"
          size="small"
          :aria-expanded="!globalSettingsCollapsed"
          @click.stop="toggleGlobalSettings"
        >
          <template #icon><DownOutlined /></template>
        </a-button>
      </div>
      <div class="global-grid">
        <div class="global-item global-item-theme">
          <span>主题</span>
          <a-segmented
            v-model:value="selectedTheme"
            size="small"
            :options="themeOptions"
            @change="saveTheme"
          />
        </div>
        <div class="global-item global-item-trigger">
          <span>翻译触发</span>
          <a-segmented
            v-model:value="selectedTriggerMode"
            size="small"
            :options="triggerModeOptions"
            @change="saveTriggerMode"
          />
        </div>
        <div class="global-item global-item-lang">
          <span>目标语言</span>
          <a-select
            v-model:value="selectedTargetLang"
            size="small"
            show-search
            :list-height="128"
            :options="globalTargetLangOptions"
            :filter-option="filterLanguageOption"
            @change="saveTargetLang"
          />
        </div>
        <div class="global-item global-item-floating">
          <span>悬浮按钮</span>
          <a-switch
            v-model:checked="selectedFloatingButtonVisible"
            checked-children="显示"
            un-checked-children="隐藏"
            @change="saveFloatingButtonVisible"
          />
        </div>
      </div>
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
            <div class="model-url">{{ item.baseUrl || '未配置 API 端点' }}</div>
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
            <a-select-option value="zhipu">智谱 AI</a-select-option>
            <a-select-option value="openai">OpenAI 兼容</a-select-option>
            <a-select-option value="ollama">Ollama</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item label="API Key">
          <a-input-password v-model:value="form.apiKey" :placeholder="apiKeyPlaceholder" />
        </a-form-item>

        <a-form-item label="API 端点">
          <a-input v-model:value="form.baseUrl" :disabled="isLocked" :placeholder="apiUrlPlaceholder" />
        </a-form-item>

        <a-form-item label="模型名称（模型ID）">
          <a-input v-model:value="form.model" :placeholder="modelPlaceholder" />
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
import { ExclamationCircleOutlined, CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined, DownOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import { COMMON_LANGUAGE_OPTIONS, DEFAULT_TARGET_LANGUAGE, ensureLanguageOption, filterLanguageOption, normalizeLanguageValue } from '../../lib/languages.js'
import { getConfig, getPresets, setConfig } from '../../lib/storage.js'

const PROVIDER_NAMES = {
  deepseek: 'DeepSeek',
  bailian: '阿里云百炼',
  zhipu: '智谱 AI',
  openai: 'OpenAI 兼容',
  ollama: 'Ollama'
}

const PROVIDER_DEFAULTS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash', locked: true },
  bailian:  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo', locked: true },
  zhipu:    { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2', locked: true },
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
const selectedTriggerMode = ref('click')
const selectedTargetLang = ref(DEFAULT_TARGET_LANGUAGE)
const selectedFloatingButtonVisible = ref(true)
const globalSettingsCollapsed = ref(false)

const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' }
]

const triggerModeOptions = [
  { label: '点击图标', value: 'click' },
  { label: '立即翻译', value: 'immediate' },
  { label: '不翻译', value: 'disabled' }
]

const globalTargetLangOptions = computed(() => {
  return ensureLanguageOption(COMMON_LANGUAGE_OPTIONS, selectedTargetLang.value)
})

const form = reactive(createEmptyForm())

const isLocked = ref(false)
const apiKeyPlaceholder = ref('sk-...')
const apiUrlPlaceholder = ref('')
const modelPlaceholder = ref('')

const presetRows = computed(() => {
  return Object.entries(presets.value)
    .map(([name, preset], index) => ({ name, index, ...preset }))
    .sort((a, b) => {
      const activeDelta = Number(isActive(b.name)) - Number(isActive(a.name))
      return activeDelta || a.index - b.index
    })
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
    disableThinking: true
  }
}

async function loadData() {
  const [presetData, cfg, meta] = await Promise.all([
    getPresets(),
    getConfig(),
    chrome.storage.sync.get({
      activePresetName: '',
      theme: 'system',
      triggerMode: 'click',
      targetLang: DEFAULT_TARGET_LANGUAGE,
      floatingButtonVisible: true,
      globalSettingsCollapsed: false
    })
  ])
  presets.value = presetData || {}
  currentConfig.value = cfg || {}
  activePresetName.value = meta.activePresetName || ''
  selectedTheme.value = meta.theme || 'system'
  selectedTriggerMode.value = meta.triggerMode || 'click'
  selectedTargetLang.value = normalizeLanguageValue(meta.targetLang, DEFAULT_TARGET_LANGUAGE)
  selectedFloatingButtonVisible.value = meta.floatingButtonVisible !== false
  globalSettingsCollapsed.value = Boolean(meta.globalSettingsCollapsed)
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
  apiKeyPlaceholder.value = provider === 'ollama'
    ? 'Ollama 通常无需填写'
    : provider === 'zhipu'
      ? '请输入智谱 API Key'
      : 'sk-...'
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
    disableThinking: values.disableThinking !== false
  }
}

async function applyModelConfig(preset) {
  const config = {
    ...normalizePreset(preset),
    theme: selectedTheme.value,
    triggerMode: selectedTriggerMode.value,
    targetLang: normalizeLanguageValue(selectedTargetLang.value, DEFAULT_TARGET_LANGUAGE),
    floatingButtonVisible: selectedFloatingButtonVisible.value
  }
  await setConfig(config)
  currentConfig.value = config
}

async function saveTheme(theme) {
  selectedTheme.value = theme
  await chrome.storage.sync.set({ theme })
  currentConfig.value = { ...currentConfig.value, theme }
  showToast('主题已更新')
}

async function saveTriggerMode(triggerMode) {
  selectedTriggerMode.value = triggerMode
  await chrome.storage.sync.set({ triggerMode })
  currentConfig.value = { ...currentConfig.value, triggerMode }
  showToast('触发方式已更新')
}

async function saveTargetLang() {
  const targetLang = normalizeLanguageValue(selectedTargetLang.value, DEFAULT_TARGET_LANGUAGE)
  selectedTargetLang.value = targetLang
  await chrome.storage.sync.set({ targetLang })
  currentConfig.value = { ...currentConfig.value, targetLang }
  showToast('目标语言已更新')
}

async function saveFloatingButtonVisible(visible) {
  selectedFloatingButtonVisible.value = visible
  await chrome.storage.sync.set({ floatingButtonVisible: visible })
  currentConfig.value = { ...currentConfig.value, floatingButtonVisible: visible }
  showToast(visible ? '悬浮按钮已显示' : '悬浮按钮已隐藏')
}

async function toggleGlobalSettings() {
  globalSettingsCollapsed.value = !globalSettingsCollapsed.value
  await chrome.storage.sync.set({ globalSettingsCollapsed: globalSettingsCollapsed.value })
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
  const keys = ['provider', 'apiKey', 'baseUrl', 'model']
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
  background: var(--ui-bg-layout);
  color: var(--ui-text);
}

.global-strip {
  padding: 10px;
  margin-bottom: 10px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-container);
  box-shadow: none;
}

.global-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -4px -4px 8px;
  padding: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.16s ease;
}

.global-head:hover {
  background: var(--ui-fill);
}

.global-toggle {
  flex: 0 0 auto;
  color: var(--ui-primary);
  transition: transform 0.18s ease, color 0.18s ease;
}

.global-toggle :deep(.anticon) {
  font-size: 10px;
  transition: transform 0.18s ease;
}

.global-strip.collapsed .global-head {
  margin-bottom: 0;
}

.global-strip.collapsed .global-toggle :deep(.anticon) {
  transform: rotate(-90deg);
}

.global-grid {
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-height: 176px;
  overflow: hidden;
  transition: max-height 0.2s ease, opacity 0.18s ease, margin-top 0.18s ease;
}

.global-strip.collapsed .global-grid {
  max-height: 0;
  opacity: 0;
  pointer-events: none;
}

.global-item {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.global-item span {
  flex: 0 0 64px;
  color: var(--ui-text-secondary);
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
}

.global-item :deep(.ant-segmented),
.global-item :deep(.ant-select),
.global-item :deep(.ant-input) {
  width: min(276px, calc(100% - 76px));
}

.global-item :deep(.ant-input),
.global-item :deep(.ant-select-selector) {
  height: 28px;
  font-size: 12px;
  font-weight: 400;
  line-height: 20px;
}

.global-item :deep(.ant-select-selection-item),
.global-item :deep(.ant-select-selection-search-input) {
  font-size: 12px;
}

.global-item :deep(.ant-segmented-group) {
  width: 100%;
}

.global-item :deep(.ant-segmented-item) {
  flex: 1;
  text-align: center;
}

.global-item :deep(.ant-segmented-item-label) {
  min-height: 22px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}

.global-item :deep(.ant-segmented-thumb) {
  min-height: 22px;
}

.theme-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.theme-subtitle {
  color: var(--ui-text-secondary);
  font-size: 12px;
  line-height: 20px;
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
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.settings-subtitle {
  color: var(--ui-text-secondary);
  font-size: 12px;
  line-height: 20px;
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
  border: 1px solid var(--ui-border) !important;
  border-radius: 8px;
  background: var(--ui-bg-container);
  box-shadow: none;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
}

.model-item:hover {
  border-color: var(--ui-primary-border) !important;
  box-shadow: var(--ui-shadow-1-down);
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
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.model-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-text-secondary);
  font-size: 12px;
  line-height: 20px;
}

.model-meta span:first-child {
  color: var(--ui-primary);
  font-weight: 500;
}

.model-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-url {
  color: var(--ui-text-secondary);
  font-size: 12px;
  line-height: 20px;
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

.model-actions :deep(.ant-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.model-actions :deep(.anticon) {
  font-size: 10px;
  line-height: 1;
}

.settings-toolbar :deep(.anticon) {
  font-size: 10px;
  line-height: 1;
}

.settings-panel :deep(.ant-segmented) {
  background: var(--ui-fill);
  border: 1px solid var(--ui-border);
  box-shadow: none;
}

.settings-panel :deep(.ant-segmented-item) {
  color: var(--ui-text-secondary);
  font-weight: 500;
}

.settings-panel :deep(.ant-segmented-item-selected) {
  background: var(--ui-primary);
  color: #fff;
  box-shadow: none;
}

.settings-panel :deep(.ant-segmented-thumb) {
  background: var(--ui-primary);
  box-shadow: none;
}

.settings-panel :deep(.ant-btn-primary:not(:disabled)) {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
  box-shadow: none;
}

.settings-panel :deep(.ant-btn-primary:not(:disabled):hover) {
  background: var(--ui-primary-hover);
  border-color: var(--ui-primary-hover);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

:global(.dark .settings-panel) {
  background: var(--ui-bg-layout);
}

:global(.dark .global-strip) {
  border-color: var(--ui-border);
  background: var(--ui-bg-container);
  box-shadow: none;
}

:global(.dark .global-item span) {
  color: var(--ui-text-secondary);
}

:global(.dark .global-toggle) {
  background: var(--ui-fill);
  border-color: var(--ui-border);
  color: var(--ui-primary-hover);
}

:global(.dark .global-head:hover) {
  background: var(--ui-fill);
}

:global(.dark .theme-subtitle),
:global(.dark .settings-subtitle) {
  color: var(--ui-text-secondary);
}

:global(.dark .model-item) {
  border-color: var(--ui-border) !important;
  background: var(--ui-bg-elevated);
  box-shadow: none;
}

:global(.dark .model-item:hover) {
  border-color: var(--ui-primary-border) !important;
  box-shadow: var(--ui-shadow-1-down);
}

:global(.dark .model-meta) {
  color: var(--ui-text-secondary);
}

:global(.dark .model-meta span:first-child) {
  color: var(--ui-primary-hover);
}

:global(.dark .model-url) {
  color: var(--ui-text-secondary);
}

:global(.dark .settings-panel .ant-segmented) {
  background: var(--ui-fill);
  border-color: var(--ui-border);
}

:global(.dark .settings-panel .ant-segmented-item) {
  color: var(--ui-text-secondary);
}

:global(.dark .settings-panel .ant-segmented-item-selected) {
  color: #fff;
}
</style>
