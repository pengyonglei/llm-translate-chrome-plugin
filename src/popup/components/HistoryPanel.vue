<template>
  <div class="history-panel">
    <div class="history-toolbar">
      <a-input
        v-model:value="keyword"
        allow-clear
        size="small"
        placeholder="搜索历史"
      >
        <template #prefix><SearchOutlined /></template>
      </a-input>
      <a-tooltip title="清空历史">
        <a-button
          size="small"
          danger
          :disabled="historyRows.length === 0"
          @click="confirmClear"
        >
          <template #icon><DeleteOutlined /></template>
        </a-button>
      </a-tooltip>
    </div>

    <a-empty v-if="filteredRows.length === 0" class="empty-state" :description="emptyText" />

    <div v-else class="history-list">
      <div v-for="item in filteredRows" :key="item.id" class="history-item">
        <div class="history-head">
          <div class="history-meta">
            <a-tag :color="typeColor(item.type)">{{ typeLabel(item.type) }}</a-tag>
            <span>{{ formatTime(item.createdAt) }}</span>
          </div>
          <a-tooltip title="复制译文">
            <a-button size="small" shape="circle" @click="copyText(item.translatedText)">
              <template #icon><CopyOutlined /></template>
            </a-button>
          </a-tooltip>
          <a-tooltip title="删除">
            <a-button
              class="history-delete-btn"
              size="small"
              shape="circle"
              danger
              @click="deleteItem(item.id)"
            >
              <template #icon><DeleteOutlined /></template>
            </a-button>
          </a-tooltip>
        </div>

        <div v-if="item.title || item.url" class="history-page">
          {{ item.title || item.url }}
        </div>

        <div class="history-block">
          <div class="history-label">原文</div>
          <div class="history-text">{{ item.sourceText }}</div>
        </div>
        <div class="history-block">
          <div class="history-label">译文</div>
          <div class="history-text translated">{{ item.translatedText }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CopyOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import { clearTranslationHistory, deleteTranslationHistoryItem, getTranslationHistory } from '../../lib/storage.js'

const keyword = ref('')
const historyRows = ref([])

const filteredRows = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  if (!text) return historyRows.value
  return historyRows.value.filter(item => {
    return [
      item.sourceText,
      item.translatedText,
      item.title,
      item.url,
      typeLabel(item.type)
    ].some(value => String(value || '').toLowerCase().includes(text))
  })
})

const emptyText = computed(() => {
  return historyRows.value.length ? '没有匹配的历史记录' : '暂无翻译历史'
})

onMounted(() => {
  loadHistory()
  chrome.storage.onChanged.addListener(storageListener)
})

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(storageListener)
})

async function loadHistory() {
  historyRows.value = await getTranslationHistory()
}

function storageListener(changes, area) {
  if (area === 'local' && changes.translationHistory) {
    historyRows.value = Array.isArray(changes.translationHistory.newValue)
      ? changes.translationHistory.newValue
      : []
  }
}

function confirmClear() {
  Modal.confirm({
    title: '清空翻译历史？',
    content: '清空后无法恢复。',
    okText: '清空',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    async onOk() {
      await clearTranslationHistory()
      showToast('历史已清空')
    }
  })
}

async function copyText(text) {
  if (!text) return
  await navigator.clipboard.writeText(text)
  showToast('已复制译文')
}

async function deleteItem(id) {
  historyRows.value = await deleteTranslationHistoryItem(id)
  showToast('已删除历史记录')
}

function typeLabel(type) {
  const labels = {
    manual: '手动',
    selection: '划词',
    page: '网页'
  }
  return labels[type] || '翻译'
}

function typeColor(type) {
  const colors = {
    manual: 'blue',
    selection: 'green',
    page: 'purple'
  }
  return colors[type] || 'default'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = number => String(number).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
  }, 1600)
}
</script>

<style scoped>
.history-panel {
  min-height: 100%;
  padding: 10px 12px 12px;
  background: var(--ui-bg-layout);
  color: var(--ui-text);
}

.history-toolbar {
  display: grid;
  grid-template-columns: 1fr 32px;
  gap: 8px;
  margin-bottom: 10px;
}

.empty-state {
  margin-top: 72px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  position: relative;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-container);
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.history-delete-btn {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.history-item:hover .history-delete-btn {
  opacity: 1;
  pointer-events: auto;
}

.history-meta {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-text-tertiary);
  font-size: 12px;
}

.history-page {
  margin-bottom: 8px;
  color: var(--ui-text-secondary);
  font-size: 12px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-block + .history-block {
  margin-top: 8px;
}

.history-label {
  margin-bottom: 3px;
  color: var(--ui-text-tertiary);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.history-text {
  max-height: 74px;
  overflow: auto;
  color: var(--ui-text);
  font-size: 13px;
  line-height: 20px;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: thin;
}

.history-text.translated {
  color: var(--ui-primary);
}

:global(.dark .history-panel) {
  background: var(--ui-bg-layout);
}

:global(.dark .history-item) {
  border-color: var(--ui-border);
  background: var(--ui-bg-elevated);
}
</style>
