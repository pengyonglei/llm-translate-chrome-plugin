<template>
  <div class="translate-panel">
    <a-tag v-if="configText" color="blue" class="config-tag">{{ configText }}</a-tag>

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
        <svg v-if="!copied" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="copy-icon"><polyline points="20 6 9 17 4 12"/></svg>
        {{ copied ? '已复制' : '复制' }}
      </a-tag>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getConfig } from '../../lib/storage.js'

const inputText = ref('')
const result = ref('')
const error = ref('')
const translating = ref(false)
const copied = ref(false)
const configText = ref('')

async function updateConfigText() {
  const cfg = await getConfig()
  const names = { deepseek: 'DeepSeek', bailian: '阿里云百炼', openai: 'OpenAI', ollama: 'Ollama' }
  const provider = names[cfg.provider] || cfg.provider
  configText.value = `${provider} · ${cfg.model || '未配置模型'}`
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
    const response = await chrome.runtime.sendMessage({ type: 'translate', text })
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
  background:
    linear-gradient(135deg, rgba(35, 119, 255, 0.12), transparent 34%),
    linear-gradient(315deg, rgba(14, 201, 167, 0.12), transparent 30%);
}
.config-tag {
  display: block;
  text-align: center;
  margin-bottom: 10px;
  border-color: rgba(74, 144, 217, 0.28);
  background: rgba(255, 255, 255, 0.82);
  font-weight: 700;
}
.translate-btn {
  margin-top: 10px;
  background: #1e8cff;
  border-color: #1e8cff;
  box-shadow: 0 8px 18px rgba(30, 140, 255, 0.28);
}
.result-box {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid rgba(74, 144, 217, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(244, 250, 255, 0.96)),
    radial-gradient(circle at top right, rgba(20, 184, 166, 0.16), transparent 32%);
  box-shadow: 0 8px 22px rgba(15, 82, 186, 0.08);
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}
.error-box {
  margin-top: 10px;
  padding: 10px;
  border-radius: 6px;
  background: #fce4ec;
  color: #c62828;
  font-size: 13px;
}
.result-text { margin-bottom: 6px; }
.copy-tag { cursor: pointer; user-select: none; }
.copy-icon { vertical-align: -2px; margin-right: 3px; }

:global(.dark .translate-panel) {
  background:
    linear-gradient(135deg, rgba(30, 140, 255, 0.14), transparent 36%),
    linear-gradient(315deg, rgba(20, 184, 166, 0.13), transparent 34%),
    #141414;
}

:global(.dark .config-tag) {
  background: rgba(12, 31, 52, 0.86);
  border-color: rgba(62, 166, 255, 0.38);
  color: #b8dcff;
}

:global(.dark .result-box) {
  background:
    linear-gradient(135deg, rgba(19, 33, 51, 0.96), rgba(13, 31, 36, 0.96)),
    radial-gradient(circle at top right, rgba(30, 140, 255, 0.18), transparent 34%);
  border-color: rgba(62, 166, 255, 0.28);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
  color: #e8f3ff;
}
</style>
