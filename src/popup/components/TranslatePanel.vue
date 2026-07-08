<template>
  <div class="translate-panel">
    <a-tag v-if="configText" color="blue" class="config-tag">{{ configText }}</a-tag>

    <div class="lang-row">
      <div class="lang-field">
        <span>原文语言</span>
        <a-select
          v-model:value="sourceLang"
          size="small"
          show-search
          :list-height="128"
          :options="sourceLangOptions"
          :filter-option="filterLanguageOption"
          popup-class-name="translate-lang-dropdown"
        />
      </div>
      <div class="lang-field">
        <span>目标语言</span>
        <a-select
          v-model:value="targetLang"
          size="small"
          show-search
          :list-height="128"
          :options="targetLangOptions"
          :filter-option="filterLanguageOption"
          popup-class-name="translate-lang-dropdown"
        />
      </div>
    </div>

    <a-textarea
      v-model:value="inputText"
      placeholder="输入要翻译的文本，Ctrl+Enter 快捷翻译…"
      :rows="4"
      :disabled="translating"
      @keydown="onKeydown"
    />

    <a-tooltip :title="translateDisabledTip">
      <span class="translate-btn-wrap">
        <a-button
          type="primary"
          block
          :loading="translating"
          :disabled="isTranslateDisabled"
          class="translate-btn"
          @click="doTranslate"
        >
          {{ translating ? '翻译中…' : '翻译' }}
        </a-button>
      </span>
    </a-tooltip>

    <div class="page-translate-card">
      <div class="page-mode-row">
        <span>网页翻译</span>
        <a-segmented
          v-model:value="pageTranslateMode"
          size="small"
          :options="pageTranslateModeOptions"
          @change="savePageTranslateMode"
        />
      </div>

      <div class="page-action-row">
        <a-button
          block
          :loading="pageTranslating"
          :disabled="pageTranslating || pageRestoring"
          class="page-translate-btn"
          @click="translateCurrentPage"
        >
          <template #icon><GlobalOutlined /></template>
          {{ pageTranslating ? '正在启动…' : '翻译当前网页 Alt+Shift+T' }}
        </a-button>
        <a-tooltip title="还原网页">
          <a-button
            :loading="pageRestoring"
            :disabled="pageTranslating || pageRestoring"
            class="page-restore-btn"
            @click="restoreCurrentPage"
          >
            <template #icon><UndoOutlined /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip title="取消网页翻译">
          <a-button
            :loading="pageCanceling"
            :disabled="pageTranslating || pageCanceling"
            class="page-cancel-btn"
            @click="cancelCurrentPageTranslation"
          >
            <template #icon><StopOutlined /></template>
          </a-button>
        </a-tooltip>
      </div>
    </div>

    <div v-if="pageMessage" class="page-message-box">{{ pageMessage }}</div>

    <div v-if="result" class="result-box">
      <div class="result-text">{{ result }}</div>
      <a-tag
        :color="copied ? 'green' : 'blue'"
        class="copy-tag"
        @click="copyResult"
      >
        <CopyOutlined v-if="!copied" class="copy-icon" />
        <CheckOutlined v-else class="copy-icon" />
        {{ copied ? '已复制' : '复制' }}
      </a-tag>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { CheckOutlined, CopyOutlined, GlobalOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons-vue'
import { COMMON_LANGUAGE_OPTIONS, DEFAULT_TARGET_LANGUAGE, SOURCE_LANGUAGE_OPTIONS, ensureLanguageOption, filterLanguageOption, normalizeLanguageValue } from '../../lib/languages.js'
import { getConfig } from '../../lib/storage.js'

const inputText = ref('')
const result = ref('')
const error = ref('')
const translating = ref(false)
const pageTranslating = ref(false)
const pageRestoring = ref(false)
const pageCanceling = ref(false)
const pageMessage = ref('')
const copied = ref(false)
const configText = ref('')
const sourceLang = ref('auto')
const targetLang = ref(DEFAULT_TARGET_LANGUAGE)
const targetLangInitialized = ref(false)
const pageTranslateMode = ref('replace')

const sourceLangOptions = SOURCE_LANGUAGE_OPTIONS
const pageTranslateModeOptions = [
  { label: '替换', value: 'replace' },
  { label: '对照', value: 'compare' }
]

const isTranslateDisabled = computed(() => !inputText.value.trim())
const translateDisabledTip = computed(() => {
  return isTranslateDisabled.value && !translating.value ? '请输入要翻译的文本' : ''
})

const targetLangOptions = computed(() => {
  return ensureLanguageOption(COMMON_LANGUAGE_OPTIONS, targetLang.value)
})

async function updateConfigText() {
  const cfg = await getConfig()
  const names = { deepseek: 'DeepSeek', bailian: '阿里云百炼', zhipu: '智谱 AI', openai: 'OpenAI', ollama: 'Ollama' }
  const provider = names[cfg.provider] || cfg.provider
  configText.value = `${provider} · ${cfg.model || '未配置模型'}`
  if (!targetLangInitialized.value) {
    targetLang.value = normalizeLanguageValue(cfg.targetLang, DEFAULT_TARGET_LANGUAGE)
    targetLangInitialized.value = true
  }
}

onMounted(async () => {
  await updateConfigText()
  const cfg = await chrome.storage.sync.get({ pageTranslateMode: 'replace' })
  pageTranslateMode.value = normalizePageTranslateMode(cfg.pageTranslateMode)
})

// 监听配置变化，切换 tab 回来时自动更新显示
const storageListener = (changes, area) => {
  if (area === 'sync') {
    const relevant = ['provider', 'model', 'apiKey', 'baseUrl']
    if (relevant.some(k => changes[k])) {
      updateConfigText()
    }
  }
}
chrome.storage.onChanged.addListener(storageListener)

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(storageListener)
})

async function doTranslate() {
  const text = inputText.value.trim()
  if (!text || translating.value) return

  translating.value = true
  result.value = ''
  error.value = ''

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'translate',
      text,
      sourceLang: sourceLang.value,
      targetLang: normalizeLanguageValue(targetLang.value, DEFAULT_TARGET_LANGUAGE),
      historyType: 'manual'
    })
    if (response.ok) {
      result.value = response.data
    } else {
      error.value = response.error || '翻译失败'
    }
  } catch (err) {
    error.value = err.message?.includes('context')
      ? '扩展已更新，请刷新页面后重试'
      : '网络错误，请检查配置和网络连接'
  } finally {
    translating.value = false
  }
}

async function translateCurrentPage() {
  if (pageTranslating.value) return

  pageTranslating.value = true
  error.value = ''
  pageMessage.value = ''
  const mode = normalizePageTranslateMode(pageTranslateMode.value)

  try {
    await chrome.storage.sync.set({ pageTranslateMode: mode })
    const response = await sendPageTranslationMessage({
      type: 'translatePage',
      sourceLang: sourceLang.value,
      targetLang: normalizeLanguageValue(targetLang.value, DEFAULT_TARGET_LANGUAGE),
      mode
    })

    if (response?.ok) {
      pageMessage.value = mode === 'compare'
        ? '已开始对照翻译当前网页，请查看页面右上角进度'
        : '已开始翻译当前网页，请查看页面右上角进度'
    } else {
      error.value = response?.error || '整页翻译启动失败'
    }
  } catch (err) {
    error.value = err.message?.includes('Cannot access')
      ? '当前页面不支持扩展脚本，请换一个普通网页重试'
      : '整页翻译启动失败，请刷新页面后重试'
  } finally {
    pageTranslating.value = false
  }
}

async function restoreCurrentPage() {
  if (pageRestoring.value || pageTranslating.value) return

  pageRestoring.value = true
  error.value = ''
  pageMessage.value = ''

  try {
    const response = await sendPageTranslationMessage({ type: 'restorePageTranslation' })
    if (response?.ok) {
      const count = response.data?.restoredCount || 0
      pageMessage.value = count
        ? `已还原网页，共恢复 ${count} 处内容`
        : '当前网页没有可还原的翻译内容'
    } else {
      error.value = response?.error || '网页还原失败'
    }
  } catch (err) {
    error.value = err.message?.includes('Cannot access')
      ? '当前页面不支持扩展脚本，请换一个普通网页重试'
      : '网页还原失败，请刷新页面后重试'
  } finally {
    pageRestoring.value = false
  }
}

async function cancelCurrentPageTranslation() {
  if (pageCanceling.value || pageTranslating.value) return

  pageCanceling.value = true
  error.value = ''
  pageMessage.value = ''

  try {
    const response = await sendPageTranslationMessage({ type: 'cancelPageTranslation' })
    if (response?.ok) {
      pageMessage.value = response.data?.canceled
        ? '已发送取消请求，当前批次结束后停止'
        : '当前没有正在进行的网页翻译'
    } else {
      error.value = response?.error || '取消网页翻译失败'
    }
  } catch (err) {
    error.value = '取消网页翻译失败，请刷新页面后重试'
  } finally {
    pageCanceling.value = false
  }
}

function normalizePageTranslateMode(value) {
  return value === 'compare' ? 'compare' : 'replace'
}

async function savePageTranslateMode(value) {
  pageTranslateMode.value = normalizePageTranslateMode(value)
  await chrome.storage.sync.set({ pageTranslateMode: pageTranslateMode.value })
}

async function sendPageTranslationMessage(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('未找到当前标签页')

  try {
    return await chrome.tabs.sendMessage(tab.id, message)
  } catch (err) {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/content.css'] })
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] })
    return chrome.tabs.sendMessage(tab.id, message)
  }
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    doTranslate()
  }
}

async function copyResult() {
  if (!result.value) return
  try {
    await navigator.clipboard.writeText(result.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}
</script>

<style scoped>
.translate-panel {
  min-height: 100%;
  padding: 10px 12px 12px;
  background: var(--ui-bg-layout);
  color: var(--ui-text);
}
.config-tag {
  display: block;
  text-align: center;
  margin-bottom: 10px;
  border-color: var(--ui-primary-border);
  background: var(--ui-primary-bg);
  color: var(--ui-primary);
  font-weight: 500;
}
.lang-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.lang-field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lang-field span {
  color: var(--ui-text-secondary);
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
}
.lang-field :deep(.ant-select) {
  width: 100%;
}
.lang-field :deep(.ant-select-selector) {
  font-size: 12px;
}
.translate-btn-wrap {
  display: block;
  margin-top: 10px;
}
.translate-btn {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
  box-shadow: none;
}
.page-translate-card {
  margin-top: 8px;
  padding: 9px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-container);
}
.page-mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.page-mode-row span {
  flex: 0 0 auto;
  color: var(--ui-text-secondary);
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
}
.page-mode-row :deep(.ant-segmented) {
  flex: 0 0 auto;
}
.page-action-row {
  display: grid;
  grid-template-columns: 1fr 34px 34px;
  gap: 8px;
  align-items: stretch;
}
.page-translate-btn {
  color: var(--ui-primary);
  border-color: var(--ui-primary-border);
  background: var(--ui-bg-container);
  box-shadow: none;
}
.page-restore-btn,
.page-cancel-btn {
  width: 34px;
  padding: 0;
  color: var(--ui-text-secondary);
  border-color: var(--ui-border);
  background: var(--ui-bg-container);
  box-shadow: none;
}
.page-translate-btn:hover,
.page-restore-btn:hover,
.page-cancel-btn:hover {
  color: var(--ui-primary-hover);
  border-color: var(--ui-primary-hover);
}
.result-box {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-container);
  box-shadow: none;
  font-size: 14px;
  line-height: 22px;
  word-break: break-word;
}
.error-box {
  margin-top: 10px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-error-border);
  background: var(--ui-error-bg);
  color: var(--ui-error);
  font-size: 13px;
}
.page-message-box {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--ui-success-border);
  border-radius: 6px;
  background: var(--ui-success-bg);
  color: var(--ui-success);
  font-size: 13px;
  line-height: 20px;
}
.result-text { margin-bottom: 6px; }
.copy-tag { cursor: pointer; user-select: none; }
.copy-icon {
  margin-right: 3px;
  font-size: 12px;
  vertical-align: -1px;
}

:global(.dark .translate-panel) {
  background: var(--ui-bg-layout);
}

:global(.dark .config-tag) {
  background: var(--ui-primary-bg);
  border-color: var(--ui-primary-border);
  color: var(--ui-primary-hover);
}

:global(.dark .result-box) {
  background: var(--ui-bg-elevated);
  border-color: var(--ui-border);
  box-shadow: none;
  color: var(--ui-text);
}
</style>
