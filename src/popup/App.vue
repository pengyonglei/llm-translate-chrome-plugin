<template>
  <a-config-provider :theme="themeConfig">
    <div class="popup-app" :class="{ dark: isDark }">
      <div class="popup-brand" aria-hidden="true">
        <img :src="logoUrl" alt="" />
      </div>
      <div class="popup-version">{{ versionText }}</div>
      <a-tabs v-model:activeKey="activeKey" centered :tabBarGutter="40">
        <a-tab-pane key="translate" tab="翻译">
          <TranslatePanel />
        </a-tab-pane>
        <a-tab-pane key="history" tab="历史">
          <HistoryPanel />
        </a-tab-pane>
        <a-tab-pane key="settings" tab="设置">
          <SettingsPanel />
        </a-tab-pane>
      </a-tabs>
    </div>
  </a-config-provider>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { theme } from 'ant-design-vue'
import TranslatePanel from './components/TranslatePanel.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const { defaultAlgorithm, darkAlgorithm } = theme
const fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'"

const activeKey = ref('translate')
const appTheme = ref('system')
const logoUrl = chrome.runtime.getURL('icons/icon48.png')
const versionText = `v${chrome.runtime.getManifest().version}`

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

const isDark = computed(() => {
  return appTheme.value === 'dark' || (appTheme.value === 'system' && prefersDark.matches)
})

const themeConfig = computed(() => {
  return {
    algorithm: isDark.value ? darkAlgorithm : defaultAlgorithm,
    token: {
      colorPrimary: '#1677ff',
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#ff4d4f',
      colorInfo: '#1677ff',
      borderRadius: 6,
      fontFamily,
      fontSize: 14,
      lineHeight: 1.5715,
      fontWeightStrong: 500
    }
  }
})

onMounted(async () => {
  const result = await chrome.storage.sync.get({ theme: 'system' })
  appTheme.value = result.theme
})

// 监听配置变化同步主题
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.theme) {
    appTheme.value = changes.theme.newValue
  }
})
</script>

<style>
:root {
  --ui-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  --ui-font-size: 14px;
  --ui-line-height: 22px;
  --ui-primary: #1677ff;
  --ui-primary-hover: #4096ff;
  --ui-primary-active: #0958d9;
  --ui-primary-bg: #e6f4ff;
  --ui-primary-bg-hover: #bae0ff;
  --ui-primary-border: #91caff;
  --ui-success: #52c41a;
  --ui-success-bg: #f6ffed;
  --ui-success-border: #b7eb8f;
  --ui-error: #ff4d4f;
  --ui-error-bg: #fff2f0;
  --ui-error-border: #ffccc7;
  --ui-warning: #faad14;
  --ui-bg-layout: #f5f5f5;
  --ui-bg-container: #ffffff;
  --ui-bg-elevated: #ffffff;
  --ui-fill: rgba(0, 0, 0, 0.04);
  --ui-fill-secondary: rgba(0, 0, 0, 0.06);
  --ui-text: rgba(0, 0, 0, 0.88);
  --ui-text-secondary: rgba(0, 0, 0, 0.65);
  --ui-text-tertiary: rgba(0, 0, 0, 0.45);
  --ui-border: #d9d9d9;
  --ui-split: rgba(5, 5, 5, 0.06);
  --ui-shadow: rgba(0, 0, 0, 0.12);
  --ui-shadow-1-down: 0 1px 2px -2px rgba(0, 0, 0, 0.16), 0 3px 6px 0 rgba(0, 0, 0, 0.12), 0 5px 12px 4px rgba(0, 0, 0, 0.09);
  --ui-shadow-2-down: 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 9px 28px 8px rgba(0, 0, 0, 0.05);
  --ui-shadow-3-down: 0 6px 16px -8px rgba(0, 0, 0, 0.08), 0 9px 28px 0 rgba(0, 0, 0, 0.05), 0 12px 48px 16px rgba(0, 0, 0, 0.03);
  --ui-text-dark: rgba(255, 255, 255, 0.85);
  --ui-text-dark-secondary: rgba(255, 255, 255, 0.65);
}

.dark {
  --ui-primary: #1668dc;
  --ui-primary-hover: #3c89e8;
  --ui-primary-active: #1554ad;
  --ui-primary-bg: #111a2c;
  --ui-primary-bg-hover: #112545;
  --ui-primary-border: #15325b;
  --ui-success: #49aa19;
  --ui-success-bg: #162312;
  --ui-success-border: #274916;
  --ui-error: #dc4446;
  --ui-error-bg: #2c1618;
  --ui-error-border: #5b2526;
  --ui-warning: #d89614;
  --ui-bg-layout: #000000;
  --ui-bg-container: #141414;
  --ui-bg-elevated: #1f1f1f;
  --ui-fill: rgba(255, 255, 255, 0.08);
  --ui-fill-secondary: rgba(255, 255, 255, 0.12);
  --ui-text: rgba(255, 255, 255, 0.85);
  --ui-text-secondary: rgba(255, 255, 255, 0.65);
  --ui-text-tertiary: rgba(255, 255, 255, 0.45);
  --ui-border: #424242;
  --ui-split: rgba(253, 253, 253, 0.12);
  --ui-shadow: rgba(0, 0, 0, 0.45);
  --ui-shadow-1-down: 0 1px 2px -2px rgba(0, 0, 0, 0.32), 0 3px 6px 0 rgba(0, 0, 0, 0.24), 0 5px 12px 4px rgba(0, 0, 0, 0.18);
  --ui-shadow-2-down: 0 3px 6px -4px rgba(0, 0, 0, 0.32), 0 6px 16px 0 rgba(0, 0, 0, 0.24), 0 9px 28px 8px rgba(0, 0, 0, 0.18);
  --ui-shadow-3-down: 0 6px 16px -8px rgba(0, 0, 0, 0.32), 0 9px 28px 0 rgba(0, 0, 0, 0.24), 0 12px 48px 16px rgba(0, 0, 0, 0.18);
}

/* 全局浮动 Toast */
.popup-toast {
  position: fixed;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  background: var(--ui-success);
  color: #fff;
  padding: 6px 18px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: var(--ui-shadow-2-down);
  transition: bottom 0.25s ease, opacity 0.25s ease;
  opacity: 0;
  pointer-events: none;
}
.popup-toast.show {
  bottom: 12px;
  opacity: 1;
}

/* 深色模式全局覆盖 */
.dark,
.dark .popup-app,
.dark #app {
  background: var(--ui-bg-container);
}
.dark .result-box {
  background: var(--ui-bg-elevated) !important;
  color: var(--ui-text);
}
.dark .error-box {
  background: var(--ui-error-bg) !important;
  color: var(--ui-error);
}
.dark .preset-label {
  color: var(--ui-text-secondary) !important;
}
</style>

<style scoped>
.popup-app {
  position: relative;
  height: 460px;
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
  font-family: var(--ui-font-family);
  font-size: var(--ui-font-size);
  line-height: var(--ui-line-height);
  font-variant-numeric: tabular-nums;
  color: var(--ui-text);
  background: var(--ui-bg-container);
}
.popup-brand {
  position: absolute;
  top: 9px;
  left: 12px;
  z-index: 2;
  width: 24px;
  height: 24px;
  pointer-events: none;
}
.popup-brand img {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 5px;
  object-fit: cover;
}
.popup-version {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 2;
  color: var(--ui-text-tertiary);
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
  pointer-events: none;
  user-select: none;
}
.popup-app :deep(.ant-tabs) {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.popup-app :deep(.ant-tabs-nav) {
  flex-shrink: 0;
  margin-bottom: 0;
}
.popup-app :deep(.ant-tabs-content-holder) {
  flex: 1;
  width: 100%;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-text-tertiary) transparent;
}
.popup-app :deep(.ant-tabs-content) {
  height: 100%;
}
.popup-app :deep(.ant-tabs-tabpane-active) {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--ui-text-tertiary) transparent;
}
.popup-app :deep(.ant-tabs-content-holder::-webkit-scrollbar),
.popup-app :deep(.ant-tabs-tabpane-active::-webkit-scrollbar) {
  width: 4px;
}
.popup-app :deep(.ant-tabs-content-holder::-webkit-scrollbar-track),
.popup-app :deep(.ant-tabs-tabpane-active::-webkit-scrollbar-track) {
  background: transparent;
}
.popup-app :deep(.ant-tabs-content-holder::-webkit-scrollbar-thumb),
.popup-app :deep(.ant-tabs-tabpane-active::-webkit-scrollbar-thumb) {
  border-radius: 999px;
  background: var(--ui-text-tertiary);
}
.popup-app :deep(.ant-tabs-content-holder::-webkit-scrollbar-thumb:hover),
.popup-app :deep(.ant-tabs-tabpane-active::-webkit-scrollbar-thumb:hover) {
  background: var(--ui-text-secondary);
}
</style>
