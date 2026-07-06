<template>
  <a-config-provider :theme="themeConfig">
    <div class="popup-app" :class="{ dark: isDark }">
      <a-tabs v-model:activeKey="activeKey" centered :tabBarGutter="40">
        <a-tab-pane key="translate" tab="翻译">
          <TranslatePanel />
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
import SettingsPanel from './components/SettingsPanel.vue'

const { defaultAlgorithm, darkAlgorithm } = theme

const activeKey = ref('translate')
const appTheme = ref('system')

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

const isDark = computed(() => {
  return appTheme.value === 'dark' || (appTheme.value === 'system' && prefersDark.matches)
})

const themeConfig = computed(() => {
  return {
    algorithm: isDark.value ? darkAlgorithm : defaultAlgorithm,
    token: { colorPrimary: '#4a90d9', borderRadius: 6 }
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
/* 全局浮动 Toast */
.popup-toast {
  position: fixed;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  background: #2e7d32;
  color: #fff;
  padding: 6px 18px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 2px 12px rgba(0,0,0,0.2);
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
  background: #141414;
}
.dark .result-box {
  background: #1d1d1d !important;
  color: #e0e0e0;
}
.dark .error-box {
  background: #2d1b1b !important;
  color: #ef9a9a;
}
.dark .preset-label {
  color: #aaa !important;
}
</style>

<style scoped>
.popup-app {
  height: 460px;
  overflow: hidden;
  padding: 0 4px;
  display: flex;
  flex-direction: column;
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
}
.popup-app :deep(.ant-tabs-content-holder) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.popup-app :deep(.ant-tabs-content) {
  height: 100%;
}
.popup-app :deep(.ant-tabs-tabpane-active) {
  height: 100%;
  overflow-y: auto;
}
</style>
