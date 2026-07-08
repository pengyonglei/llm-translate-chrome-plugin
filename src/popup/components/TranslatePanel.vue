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

    <a-button
      type="primary"
      block
      :loading="translating"
      :disabled="!inputText.trim()"
      class="translate-btn"
      @click="doTranslate"
    >
      {{ translating ? '翻译中…' : '翻译' }}
    </a-button>

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
import { CheckOutlined, CopyOutlined } from '@ant-design/icons-vue'
import { COMMON_LANGUAGE_OPTIONS, DEFAULT_TARGET_LANGUAGE, SOURCE_LANGUAGE_OPTIONS, ensureLanguageOption, filterLanguageOption, normalizeLanguageValue } from '../../lib/languages.js'
import { getConfig } from '../../lib/storage.js'

const inputText = ref('')
const result = ref('')
const error = ref('')
const translating = ref(false)
const copied = ref(false)
const configText = ref('')
const sourceLang = ref('auto')
const targetLang = ref(DEFAULT_TARGET_LANGUAGE)
const targetLangInitialized = ref(false)

const sourceLangOptions = SOURCE_LANGUAGE_OPTIONS

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
      targetLang: normalizeLanguageValue(targetLang.value, DEFAULT_TARGET_LANGUAGE)
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
.translate-btn {
  margin-top: 10px;
  background: var(--ui-primary);
  border-color: var(--ui-primary);
  box-shadow: none;
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
