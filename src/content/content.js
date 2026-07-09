let container = null
let currentText = null
let triggerTimeout = null
let isBubbleOpen = false
let currentTheme = ''
let isDragging = false
let lastRect = null
let triggerMode = 'click'
let dismissGuardTimeout = null
let settingsBtn = null
let floatingButtonVisible = true
let pageTranslateToastTimer = null

const pageTranslateState = {
  running: false,
  translatedAt: 0,
  replacements: [],
  cancelRequested: false
}

const UI_ICONS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2 2 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  test: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
  warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
}

function readThemeFromStorage() {
  return new Promise(resolve => {
    try {
      chrome.storage.sync.get({ theme: 'system' }, (result) => {
        if (chrome.runtime.lastError) {
          resolve('')
          return
        }
        const t = result.theme || 'system'
        if (t === 'light') resolve('')
        else if (t === 'dark') resolve('dark')
        else resolve(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : '')
      })
    } catch {
      resolve('')
    }
  })
}

async function getTheme() {
  try {
    return await readThemeFromStorage()
  } catch {
    return ''
  }
}

async function readTriggerMode() {
  try {
    return new Promise(resolve => {
      chrome.storage.sync.get({ triggerMode: 'click' }, (result) => {
        if (chrome.runtime.lastError) { resolve('click'); return }
        resolve(result.triggerMode || 'click')
      })
    })
  } catch { return 'click' }
}

async function readFloatingButtonVisible() {
  try {
    return new Promise(resolve => {
      chrome.storage.sync.get({ floatingButtonVisible: true }, (result) => {
        if (chrome.runtime.lastError) { resolve(true); return }
        resolve(result.floatingButtonVisible !== false)
      })
    })
  } catch { return true }
}

// 初始化 triggerMode
readTriggerMode().then(m => { triggerMode = m })
readFloatingButtonVisible().then(visible => {
  floatingButtonVisible = visible
  if (floatingButtonVisible) injectSettingsButton()
})

// 监听配置变化
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return
  if (changes.triggerMode) {
    triggerMode = changes.triggerMode.newValue || 'click'
    if (triggerMode === 'disabled') close()
  }
  if (changes.theme) {
    getTheme().then(themeClass => {
      const dark = themeClass === 'dark'
      if (settingsBtn) settingsBtn.classList.toggle('dark', dark)
      const panel = document.querySelector('.translate-settings-panel')
      if (panel) panel.classList.toggle('dark', dark)
    })
  }
  if (changes.globalSettingsCollapsed) {
    tsSetGlobalCollapsed(Boolean(changes.globalSettingsCollapsed.newValue))
  }
  if (changes.floatingButtonVisible) {
    floatingButtonVisible = changes.floatingButtonVisible.newValue !== false
    if (floatingButtonVisible) {
      injectSettingsButton()
    } else {
      closeSettingsPanel()
      removeSettingsButton()
    }
    tsSetFloatingButtonVisible(floatingButtonVisible)
  }
})

function getSelectionText() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return null
  const text = sel.toString().trim()
  if (!text || text.length < 2 || text.length > 5000) return null

  const node = sel.anchorNode
  if (node) {
    const el = node.nodeType === 1 ? node : node.parentElement
    if (el) {
      const tag = el.tagName.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return null
      if (el.closest('.translate-container')) return null
    }
  }
  return text
}

function getSelectionRect() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!range) return null
  return range.getBoundingClientRect()
}

function close() {
  if (triggerTimeout) {
    clearTimeout(triggerTimeout)
    triggerTimeout = null
  }
  if (container) {
    container.remove()
    container = null
  }
  // 立即翻译模式下保留 currentText，防止 dismiss 后立刻重新弹出
  // 用户选择不同文本时会自然触发新翻译
  if (triggerMode !== 'immediate') {
    currentText = null
  }
  isBubbleOpen = false
  lastRect = null
}

function positionBubble(bubble) {
  if (!lastRect) return

  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 6

  // 气泡目标宽度 520px，但不超出视口
  const bubbleW = Math.min(520, vw - 16)
  const estH = 200

  // 水平居中于选中区域
  let left = lastRect.left + (lastRect.width - bubbleW) / 2
  left = Math.max(8, Math.min(left, vw - bubbleW - 8))

  // 优先在选中区域下方显示，空间不够则在上方
  let top = lastRect.bottom + gap
  if (top + estH > vh - 8) {
    top = Math.max(8, lastRect.top - estH - gap)
    // 如果上方也不够，紧贴顶部
    if (top < 8) top = 8
  }

  bubble.style.left = `${left}px`
  bubble.style.top = `${top}px`
}

function repositionBubble(bubble) {
  if (!bubble) return
  const rect = bubble.getBoundingClientRect()
  const vh = window.innerHeight

  // 如果气泡超出底部，把它往上挪
  if (rect.bottom > vh - 8) {
    const overflow = rect.bottom - (vh - 8)
    let newTop = parseFloat(bubble.style.top) - overflow
    if (newTop < 8) newTop = 8
    bubble.style.top = `${newTop}px`
  }
}

async function showTrigger(rect, text) {
  close()
  currentText = text
  lastRect = rect

  container = document.createElement('div')
  container.className = 'translate-container'
  currentTheme = await getTheme()
  if (currentTheme) container.classList.add(currentTheme)
  document.body.appendChild(container)

  const btn = document.createElement('div')
  btn.className = 'translate-trigger'
  btn.innerHTML = UI_ICONS.globe

  btn.style.top = `${Math.max(0, rect.bottom + 4)}px`
  btn.style.left = `${Math.min(rect.left, window.innerWidth - 36)}px`
  container.appendChild(btn)

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    btn.remove()
    showBubble(text)
  })

  triggerTimeout = setTimeout(() => {
    if (container && !container.querySelector('.translate-bubble')) {
      close()
    }
  }, 4000)
}

async function showBubble(text) {
  isBubbleOpen = true

  // 如果没有容器（立即翻译模式直接调用），创建一个
  if (!container) {
    container = document.createElement('div')
    container.className = 'translate-container'
    currentTheme = await getTheme()
    if (currentTheme) container.classList.add(currentTheme)
    document.body.appendChild(container)
  }

  const bubble = document.createElement('div')
  bubble.className = 'translate-bubble'

  const header = document.createElement('div')
  header.className = 'translate-bubble-header'
  const headerBrand = document.createElement('div')
  headerBrand.className = 'translate-bubble-brand'
  const logo = document.createElement('img')
  logo.className = 'translate-window-logo'
  logo.src = chrome.runtime.getURL('icons/icon48.png')
  logo.alt = ''
  const title = document.createElement('span')
  title.className = 'translate-bubble-title'
  title.textContent = 'AI 翻译'
  const closeBtn = document.createElement('button')
  closeBtn.className = 'translate-bubble-close'
  closeBtn.title = '关闭'
  closeBtn.setAttribute('aria-label', '关闭')
  closeBtn.innerHTML = UI_ICONS.close
  closeBtn.addEventListener('click', close)
  headerBrand.appendChild(logo)
  headerBrand.appendChild(title)
  header.appendChild(headerBrand)
  header.appendChild(closeBtn)
  bubble.appendChild(header)

  const source = document.createElement('div')
  source.className = 'translate-source-text'
  source.textContent = text
  bubble.appendChild(source)

  const loading = document.createElement('div')
  loading.className = 'translate-loading'
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div')
    dot.className = 'translate-loading-dot'
    loading.appendChild(dot)
  }
  bubble.appendChild(loading)

  container.appendChild(bubble)

  // 气泡定位到选中区域附近
  positionBubble(bubble)

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'translate',
      text,
      historyType: 'selection',
      title: document.title,
      url: location.href
    })
    loading.remove()

    if (response.ok) {
      const result = document.createElement('div')
      result.className = 'translate-result-text'
      result.textContent = response.data
      bubble.appendChild(result)

      const actions = document.createElement('div')
      actions.className = 'translate-bubble-actions'
      const copyBtn = document.createElement('button')
      copyBtn.className = 'translate-icon-text-btn'
      copyBtn.innerHTML = `${UI_ICONS.copy}<span>复制译文</span>`
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(response.data)
          copyBtn.innerHTML = `${UI_ICONS.check}<span>已复制</span>`
          setTimeout(() => { copyBtn.innerHTML = `${UI_ICONS.copy}<span>复制译文</span>` }, 2000)
        } catch {}
      })
      actions.appendChild(copyBtn)
      bubble.appendChild(actions)

      // 内容加载后重新调整位置
      repositionBubble(bubble)
    } else {
      const err = document.createElement('div')
      err.className = 'translate-error'
      err.textContent = response.error || '翻译失败'
      bubble.appendChild(err)
    }
  } catch (err) {
    loading.remove()
    const errDiv = document.createElement('div')
    errDiv.className = 'translate-error'
    let msg = '网络错误，请检查配置和网络连接'
    if (err.message && err.message.includes('context')) {
      msg = '扩展已更新，请刷新页面后重试'
    }
    errDiv.textContent = msg
    bubble.appendChild(errDiv)
  }
}

function checkSelection() {
  if (triggerMode === 'disabled') return
  if (isDragging) return
  const text = getSelectionText()
  if (!text || text === currentText) return
  if (container) return
  const rect = getSelectionRect()
  if (!rect) return

  if (triggerMode === 'immediate') {
    // 立刻翻译：跳过触发器图标，直接弹出翻译框
    currentText = text
    lastRect = rect
    showBubble(text)
  } else {
    // 点击图标翻译：先显示小图标
    showTrigger(rect, text)
  }
}

// ====== 整页翻译 ======

const PAGE_TRANSLATE_BATCH_MAX_TEXTS = 40
const PAGE_TRANSLATE_BATCH_MAX_CHARS = 2800
const PAGE_TRANSLATE_SKIP_SELECTOR = [
  '.translate-container',
  '.translate-settings-overlay',
  '.translate-settings-btn',
  '.translate-page-toast',
  '.translate-page-inline-result',
  'script',
  'style',
  'noscript',
  'iframe',
  'canvas',
  'svg',
  'pre',
  'code',
  'textarea',
  'input',
  'select',
  'option',
  '[contenteditable="true"]',
  '[aria-hidden="true"]'
].join(',')

function startPageTranslation(options = {}) {
  if (pageTranslateState.running) {
    showPageTranslateToast('整页翻译正在进行中…')
    return { ok: false, error: '整页翻译正在进行中' }
  }

  translateCurrentPage(options).catch(err => {
    showPageTranslateToast(err.message || '整页翻译失败', 'error')
  })
  return { ok: true }
}

function restorePageTranslation(options = {}) {
  if (pageTranslateState.running) {
    showPageTranslateToast('整页翻译正在进行中，请稍后再还原', 'error')
    return { ok: false, error: '整页翻译正在进行中' }
  }

  const restoredCount = restorePageTranslationState()
  if (!options.silent) {
    showPageTranslateToast(
      restoredCount ? `已还原网页，共恢复 ${restoredCount} 处内容` : '当前网页没有可还原的翻译内容',
      restoredCount ? 'success' : 'info'
    )
  }
  return { ok: true, data: { restoredCount } }
}

function cancelPageTranslation() {
  if (!pageTranslateState.running) {
    showPageTranslateToast('当前没有正在进行的网页翻译')
    return { ok: true, data: { canceled: false } }
  }

  pageTranslateState.cancelRequested = true
  showPageTranslateToast('正在取消网页翻译，当前批次结束后停止…', 'info', true, true)
  return { ok: true, data: { canceled: true } }
}

async function translateCurrentPage(options = {}) {
  pageTranslateState.running = true
  pageTranslateState.cancelRequested = false
  close()
  closeSettingsPanel()
  showPageTranslateToast('正在扫描页面文本…', 'info', true, true)

  try {
    const mode = await getPageTranslateMode(options.mode)
    restorePageTranslationState()
    const entries = collectPageTextEntries()
    if (!entries.length) {
      throw new Error('当前页面没有可翻译的文本')
    }

    const batches = createPageTranslationBatches(entries)
    let translatedCount = 0
    const sourceHistory = []
    const translatedHistory = []

    for (const batch of batches) {
      if (pageTranslateState.cancelRequested) break

      showPageTranslateToast(`正在翻译当前网页 ${translatedCount}/${entries.length}`, 'info', true, true)
      const response = await requestPageTranslateBatch(batch, options, entries.length, translatedCount)

      const translations = Array.isArray(response.data) ? response.data : []
      if (translations.length !== batch.length) {
        throw new Error('整页翻译返回数量不一致')
      }

      if (pageTranslateState.cancelRequested) break

      batch.forEach((entry, index) => {
        if (!entry.node.isConnected) return
        const translated = String(translations[index] || '').trim()
        if (!translated) return
        applyPageTranslation(entry, translated, mode)
        sourceHistory.push(entry.core)
        translatedHistory.push(translated)
      })
      translatedCount += batch.length
    }

    if (pageTranslateState.cancelRequested) {
      showPageTranslateToast(`网页翻译已取消，已完成 ${translatedCount}/${entries.length}`, 'error')
      return
    }

    pageTranslateState.translatedAt = Date.now()
    await savePageTranslationHistory({
      mode,
      count: translatedCount,
      sourceLang: options.sourceLang || 'auto',
      targetLang: options.targetLang,
      sourceText: sourceHistory.join('\n\n'),
      translatedText: translatedHistory.join('\n\n')
    })
    showPageTranslateToast(`${mode === 'compare' ? '对照翻译' : '整页翻译'}完成，共翻译 ${translatedCount} 处文本`, 'success')
  } finally {
    pageTranslateState.running = false
    pageTranslateState.cancelRequested = false
  }
}

async function requestPageTranslateBatch(batch, options, total, done) {
  const payload = {
    type: 'translateBatch',
    texts: batch.map(item => item.core),
    sourceLang: options.sourceLang || 'auto',
    targetLang: options.targetLang
  }

  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    if (pageTranslateState.cancelRequested) throw new Error('网页翻译已取消')
    const response = await chrome.runtime.sendMessage(payload)
    if (response?.ok) return response

    lastError = new Error(response?.error || '整页翻译失败')
    if (attempt === 0) {
      showPageTranslateToast(`当前批次失败，正在重试 ${done}/${total}`, 'info', true, true)
      await new Promise(resolve => setTimeout(resolve, 600))
    }
  }

  throw lastError
}

async function savePageTranslationHistory(record) {
  try {
    await chrome.runtime.sendMessage({
      type: 'addTranslationHistory',
      record: {
        type: 'page',
        title: document.title,
        url: location.href,
        ...record
      }
    })
  } catch {}
}

async function getPageTranslateMode(mode) {
  if (mode === 'compare') return 'compare'
  if (mode === 'replace') return 'replace'

  try {
    const result = await chrome.storage.sync.get({ pageTranslateMode: 'replace' })
    return result.pageTranslateMode === 'compare' ? 'compare' : 'replace'
  } catch {
    return 'replace'
  }
}

function cleanupPageTranslationArtifacts() {
  const artifacts = Array.from(document.querySelectorAll('.translate-page-inline-result'))
  artifacts.forEach(el => el.remove())
  return artifacts.length
}

function restorePageTranslationState() {
  let restoredCount = cleanupPageTranslationArtifacts()

  pageTranslateState.replacements.forEach(({ node, value }) => {
    if (!node?.isConnected) return
    node.nodeValue = value
    restoredCount += 1
  })
  pageTranslateState.replacements = []
  pageTranslateState.translatedAt = 0
  pageTranslateState.cancelRequested = false
  return restoredCount
}

function applyPageTranslation(entry, translated, mode) {
  if (mode === 'compare') {
    insertCompareTranslation(entry.node, translated)
    return
  }

  pageTranslateState.replacements.push({
    node: entry.node,
    value: entry.node.nodeValue
  })
  entry.node.nodeValue = `${entry.leading}${translated}${entry.trailing}`
}

function insertCompareTranslation(textNode, translated) {
  const parent = textNode.parentNode
  if (!parent) return

  const result = document.createElement('span')
  result.className = 'translate-page-inline-result'
  result.textContent = translated
  parent.insertBefore(result, textNode.nextSibling)
}

function collectPageTextEntries() {
  const entries = []
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement
        if (!parent || shouldSkipPageTranslateElement(parent)) {
          return NodeFilter.FILTER_REJECT
        }
        if (!isElementVisible(parent)) {
          return NodeFilter.FILTER_REJECT
        }
        return isTranslatablePageText(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      }
    }
  )

  let node
  while ((node = walker.nextNode())) {
    const text = node.nodeValue || ''
    const leading = text.match(/^\s*/)?.[0] || ''
    const trailing = text.match(/\s*$/)?.[0] || ''
    const core = text.trim()
    entries.push({ node, leading, trailing, core })
  }

  return entries
}

function shouldSkipPageTranslateElement(element) {
  if (element.closest(PAGE_TRANSLATE_SKIP_SELECTOR)) return true
  const tag = element.tagName?.toLowerCase()
  return ['br', 'hr'].includes(tag)
}

function isElementVisible(element) {
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  return element.getClientRects().length > 0
}

function isTranslatablePageText(text) {
  const value = String(text || '').trim()
  if (value.length < 2 || value.length > 3000) return false
  if (!/\p{L}/u.test(value)) return false
  if (/^[\d\s.,:;!?()[\]{}'"`~@#$%^&*_+=|/\\<>-]+$/.test(value)) return false
  return true
}

function createPageTranslationBatches(entries) {
  const batches = []
  let current = []
  let currentChars = 0

  entries.forEach(entry => {
    const nextChars = currentChars + entry.core.length
    if (
      current.length &&
      (current.length >= PAGE_TRANSLATE_BATCH_MAX_TEXTS || nextChars > PAGE_TRANSLATE_BATCH_MAX_CHARS)
    ) {
      batches.push(current)
      current = []
      currentChars = 0
    }
    current.push(entry)
    currentChars += entry.core.length
  })

  if (current.length) batches.push(current)
  return batches
}

async function showPageTranslateToast(message, type = 'info', persistent = false, cancellable = false) {
  let toast = document.querySelector('.translate-page-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.className = 'translate-page-toast'
    document.body.appendChild(toast)
  }

  toast.classList.remove('success', 'error')
  if (type === 'success' || type === 'error') toast.classList.add(type)
  toast.textContent = ''

  const text = document.createElement('span')
  text.className = 'translate-page-toast-text'
  text.textContent = message
  toast.appendChild(text)

  if (cancellable && pageTranslateState.running) {
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'translate-page-toast-cancel'
    cancelBtn.textContent = '取消'
    cancelBtn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      cancelPageTranslation()
    })
    toast.appendChild(cancelBtn)
  }

  const themeClass = await getTheme()
  toast.classList.toggle('dark', themeClass === 'dark')

  requestAnimationFrame(() => { toast.classList.add('show') })
  clearTimeout(pageTranslateToastTimer)

  if (!persistent) {
    pageTranslateToastTimer = setTimeout(() => {
      toast.classList.remove('show')
      setTimeout(() => toast.remove(), 220)
    }, 2600)
  }
}

// ====== 悬浮设置按钮（可拖拽 + 贴边） ======

const SNAP_THRESHOLD = 80
const BTN_SIZE = 44
const BTN_MARGIN = 4

function injectSettingsButton() {
  if (!floatingButtonVisible) return
  if (settingsBtn) return

  settingsBtn = document.createElement('div')
  settingsBtn.className = 'translate-settings-btn'
  settingsBtn.title = 'AI 翻译设置'

  const iconUrl = chrome.runtime.getURL('icons/icon48.png')
  settingsBtn.innerHTML = `<img src="${iconUrl}" width="28" height="28" alt="AI 翻译">`
  getTheme().then(themeClass => {
    if (settingsBtn) settingsBtn.classList.toggle('dark', themeClass === 'dark')
  })

  // 默认位置（右下角），后面 restore 会覆盖
  settingsBtn.style.right = '20px'
  settingsBtn.style.bottom = '20px'

  // 恢复保存的位置
  restoreBtnPosition()

  settingsBtn.addEventListener('click', (e) => {
    if (settingsBtn._dragging) { settingsBtn._dragging = false; return }
    e.stopPropagation()
    if (document.querySelector('.translate-settings-panel')) {
      closeSettingsPanel()
    } else {
      showSettingsPanel()
    }
  })

  // 拖拽
  let startX, startY, originX, originY, moving = false

  settingsBtn.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    startX = e.clientX
    startY = e.clientY
    const rect = settingsBtn.getBoundingClientRect()
    originX = rect.left
    originY = rect.top
    moving = false
    settingsBtn._dragging = false
    settingsBtn.style.transition = 'none'
    settingsBtn.classList.add('dragging')

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!moving && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moving = true
      if (!moving) return
      settingsBtn._dragging = true
      settingsBtn.style.left = `${originX + dx}px`
      settingsBtn.style.top = `${originY + dy}px`
      settingsBtn.style.right = 'auto'
      settingsBtn.style.bottom = 'auto'
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      settingsBtn.classList.remove('dragging')

      if (!moving) {
        // 没有真正拖动，视为点击
        return
      }

      // 贴边检测
      const rect = settingsBtn.getBoundingClientRect()
      const vw = window.innerWidth
      const cx = rect.left + rect.width / 2
      let snapped = ''

      if (cx < SNAP_THRESHOLD) {
        // 贴左边
        settingsBtn.style.left = `${BTN_MARGIN}px`
        settingsBtn.style.right = 'auto'
        settingsBtn.style.transition = 'left 0.25s ease'
        snapped = 'left'
      } else if (cx > vw - SNAP_THRESHOLD) {
        // 贴右边
        settingsBtn.style.right = `${BTN_MARGIN}px`
        settingsBtn.style.left = 'auto'
        settingsBtn.style.transition = 'right 0.25s ease'
        snapped = 'right'
      }

      // 不超出顶部/底部
      const top = Math.max(BTN_MARGIN, Math.min(parseFloat(settingsBtn.style.top), window.innerHeight - BTN_SIZE - BTN_MARGIN))
      settingsBtn.style.top = `${top}px`

      // 恢复过渡
      setTimeout(() => { settingsBtn.style.transition = '' }, 300)

      // 保存位置
      saveBtnPosition({ top, snapped })
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  getTheme().then(t => {
    if (t) settingsBtn.classList.add(t)
  })

  document.body.appendChild(settingsBtn)
}

function removeSettingsButton() {
  if (!settingsBtn) return
  settingsBtn.remove()
  settingsBtn = null
}

const BTN_POS_KEY = 'floatingBtnPosition'

function saveBtnPosition(pos) {
  try {
    chrome.storage.sync.set({ [BTN_POS_KEY]: pos })
  } catch {}
}

function restoreBtnPosition() {
  try {
    chrome.storage.sync.get({ [BTN_POS_KEY]: null }, (result) => {
      if (chrome.runtime.lastError) return
      const pos = result[BTN_POS_KEY]
      if (!pos) {
        // 默认：右下角
        settingsBtn.style.right = '20px'
        settingsBtn.style.bottom = '20px'
        settingsBtn.style.left = 'auto'
        settingsBtn.style.top = 'auto'
        return
      }
      settingsBtn.style.top = `${pos.top}px`
      settingsBtn.style.left = 'auto'
      settingsBtn.style.bottom = 'auto'
      if (pos.snapped === 'left') {
        settingsBtn.style.left = `${BTN_MARGIN}px`
        settingsBtn.style.right = 'auto'
      } else if (pos.snapped === 'right') {
        settingsBtn.style.right = `${BTN_MARGIN}px`
        settingsBtn.style.left = 'auto'
      } else {
        settingsBtn.style.right = '20px'
        settingsBtn.style.bottom = '20px'
        settingsBtn.style.left = 'auto'
        settingsBtn.style.top = 'auto'
      }
    })
  } catch {}
}

// ====== 内联设置面板 ======

const PROVIDER_NAMES = { deepseek: 'DeepSeek', bailian: '阿里云百炼', zhipu: '智谱 AI', openai: 'OpenAI', ollama: 'Ollama' }

function $(id) { return document.getElementById(id) }

const TS_PROVIDER_DEFAULTS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', locked: true },
  bailian:  { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo', locked: true },
  zhipu:    { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.2', locked: true },
  openai:   { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', locked: false },
  ollama:   { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', locked: false }
}
const TS_DEFAULT_TARGET_LANGUAGE = '简体中文'

const TS_LANGUAGE_OPTIONS = [
  { label: '简体中文（Chinese Simplified）', value: '简体中文' },
  { label: '繁体中文（Chinese Traditional）', value: '繁体中文' },
  { label: '英文（English）', value: '英文' },
  { label: '日语（日本語）', value: '日语' },
  { label: '韩语（한국어）', value: '韩语' },
  { label: '法语（Français）', value: '法语' },
  { label: '德语（Deutsch）', value: '德语' },
  { label: '西班牙语（Español）', value: '西班牙语' },
  { label: '俄语（Русский）', value: '俄语' },
  { label: '葡萄牙语（Português）', value: '葡萄牙语' },
  { label: '意大利语（Italiano）', value: '意大利语' },
  { label: '阿拉伯语（العربية）', value: '阿拉伯语' },
  { label: '印地语（हिन्दी）', value: '印地语' },
  { label: '印尼语（Bahasa Indonesia）', value: '印尼语' },
  { label: '越南语（Tiếng Việt）', value: '越南语' },
  { label: '泰语（ไทย）', value: '泰语' },
  { label: '马来语（Bahasa Melayu）', value: '马来语' },
  { label: '土耳其语（Türkçe）', value: '土耳其语' },
  { label: '荷兰语（Nederlands）', value: '荷兰语' },
  { label: '波兰语（Polski）', value: '波兰语' },
  { label: '乌克兰语（Українська）', value: '乌克兰语' },
  { label: '希腊语（Ελληνικά）', value: '希腊语' },
  { label: '瑞典语（Svenska）', value: '瑞典语' },
  { label: '挪威语（Norsk）', value: '挪威语' },
  { label: '丹麦语（Dansk）', value: '丹麦语' },
  { label: '芬兰语（Suomi）', value: '芬兰语' },
  { label: '捷克语（Čeština）', value: '捷克语' },
  { label: '匈牙利语（Magyar）', value: '匈牙利语' },
  { label: '罗马尼亚语（Română）', value: '罗马尼亚语' },
  { label: '保加利亚语（Български）', value: '保加利亚语' },
  { label: '克罗地亚语（Hrvatski）', value: '克罗地亚语' },
  { label: '斯洛伐克语（Slovenčina）', value: '斯洛伐克语' },
  { label: '斯洛文尼亚语（Slovenščina）', value: '斯洛文尼亚语' },
  { label: '塞尔维亚语（Српски）', value: '塞尔维亚语' },
  { label: '希伯来语（עברית）', value: '希伯来语' },
  { label: '波斯语（فارسی）', value: '波斯语' },
  { label: '乌尔都语（اردو）', value: '乌尔都语' },
  { label: '孟加拉语（বাংলা）', value: '孟加拉语' },
  { label: '泰米尔语（தமிழ்）', value: '泰米尔语' },
  { label: '泰卢固语（తెలుగు）', value: '泰卢固语' },
  { label: '马拉地语（मराठी）', value: '马拉地语' },
  { label: '古吉拉特语（ગુજરાતી）', value: '古吉拉特语' },
  { label: '菲律宾语（Filipino）', value: '菲律宾语' },
  { label: '缅甸语（မြန်မာ）', value: '缅甸语' },
  { label: '高棉语（ភាសាខ្មែរ）', value: '高棉语' },
  { label: '老挝语（ລາວ）', value: '老挝语' },
  { label: '尼泊尔语（नेपाली）', value: '尼泊尔语' },
  { label: '僧伽罗语（සිංහල）', value: '僧伽罗语' },
  { label: '斯瓦希里语（Kiswahili）', value: '斯瓦希里语' },
  { label: '南非荷兰语（Afrikaans）', value: '南非荷兰语' },
  { label: '拉丁语（Latina）', value: '拉丁语' }
]

async function showSettingsPanel() {
  if (document.querySelector('.translate-settings-panel')) return

  const overlay = document.createElement('div')
  overlay.className = 'translate-settings-overlay'

  const panel = document.createElement('div')
  panel.className = 'translate-settings-panel'
  const logoUrl = chrome.runtime.getURL('icons/icon48.png')
  panel.innerHTML = `
    <div class="ts-header">
      <div class="ts-brand">
        <img class="translate-window-logo" src="${logoUrl}" alt="" />
      </div>
      <span class="ts-title">AI 翻译设置</span>
      <button class="ts-close" id="tsClose" title="关闭" aria-label="关闭">${UI_ICONS.close}</button>
    </div>
    <div class="ts-body">
      <div class="ts-global-card">
        <div class="ts-global-head" id="tsGlobalHead" title="展开/收起全局设置">
          <div>
            <div class="ts-control-title">全局设置</div>
            <div class="ts-control-subtitle">独立于模型预设</div>
          </div>
          <button type="button" class="ts-global-toggle" id="tsGlobalToggle" title="展开/收起全局设置" aria-expanded="true">${UI_ICONS.chevron}</button>
        </div>
        <div class="ts-global-grid">
          <div class="ts-global-item">
            <span>主题</span>
            <div class="ts-segmented" id="ts-theme-segment">
              <button data-value="system">跟随系统</button>
              <button data-value="light">浅色</button>
              <button data-value="dark">深色</button>
            </div>
          </div>
          <div class="ts-global-item ts-global-wide">
            <span>翻译触发</span>
            <div class="ts-segmented ts-segmented-wide" id="ts-trigger-segment">
              <button data-value="click">点击图标</button>
              <button data-value="immediate">立即翻译</button>
              <button data-value="disabled">不翻译</button>
            </div>
          </div>
          <div class="ts-global-item ts-global-wide">
            <span>目标语言</span>
            <div class="ts-lang-select" id="ts-globalTargetLangSelect">
              <input type="text" id="ts-globalTargetLang" placeholder="简体中文（Chinese Simplified）" autocomplete="off" />
              <button type="button" class="ts-lang-toggle" id="ts-globalTargetLangToggle" title="展开语言列表" aria-label="展开语言列表">${UI_ICONS.chevron}</button>
              <div class="ts-lang-dropdown" id="ts-globalTargetLangDropdown" hidden></div>
            </div>
          </div>
          <div class="ts-global-item">
            <span>悬浮按钮</span>
            <div class="ts-segmented" id="ts-floating-segment">
              <button data-value="show">显示</button>
              <button data-value="hide">隐藏</button>
            </div>
          </div>
        </div>
      </div>

      <div class="ts-model-head">
        <div>
          <div class="ts-section-title">模型预设</div>
          <div class="ts-section-subtitle" id="tsPresetCount">0 个配置</div>
        </div>
        <button class="ts-btn ts-btn-primary" id="tsAddPreset">${UI_ICONS.plus}<span>新增</span></button>
      </div>

      <div class="ts-model-list" id="tsPresetList"></div>
    </div>
    <div class="ts-editor-drawer" id="tsEditor" hidden>
      <div class="ts-editor-panel">
        <div class="ts-editor-header">
          <div>
            <div class="ts-editor-title" id="tsEditorTitle">新增模型预设</div>
            <div class="ts-editor-subtitle">模型信息将保存到预设列表</div>
          </div>
          <button class="ts-drawer-close" id="tsCancelEdit" title="关闭" aria-label="关闭">${UI_ICONS.close}</button>
        </div>
        <div class="ts-editor-body">
        <div class="ts-field">
          <label>预设名称</label>
          <input type="text" id="ts-presetName" placeholder="例如：内网 Ollama" />
        </div>
        <div class="ts-field">
          <label>LLM 提供商</label>
          <select id="ts-provider">
            <option value="deepseek">DeepSeek</option>
            <option value="bailian">阿里云百炼</option>
            <option value="zhipu">智谱 AI</option>
            <option value="openai">OpenAI 兼容</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>
        <div class="ts-field">
          <label>API Key</label>
          <div class="ts-input-group">
            <input type="password" id="ts-apiKey" spellcheck="false" />
            <button class="ts-eye" id="tsToggleKey" title="显示/隐藏" aria-label="显示/隐藏 API Key">${UI_ICONS.eye}</button>
          </div>
        </div>
        <div class="ts-field">
          <label>API 端点</label>
          <input type="text" id="ts-baseUrl" spellcheck="false" />
        </div>
        <div class="ts-field">
          <label>模型名称（模型ID）</label>
          <input type="text" id="ts-model" spellcheck="false" />
        </div>
        <div class="ts-field ts-checkbox-row">
          <label><input type="checkbox" id="ts-disableThinking" checked /><span>禁用深度思考模式</span></label>
        </div>
        </div>
        <div class="ts-editor-actions">
          <button class="ts-btn" id="tsCancelEditor">取消</button>
          <button class="ts-btn ts-btn-primary" id="tsSavePreset">保存</button>
        </div>
      </div>
    </div>
    <div class="ts-confirm" id="tsConfirm" hidden>
        <div class="ts-confirm-box">
          <div class="ts-confirm-icon">${UI_ICONS.warning}</div>
          <div class="ts-confirm-content">
            <div class="ts-confirm-title">删除模型预设</div>
            <div class="ts-confirm-message" id="tsConfirmMessage">确定删除该预设吗？</div>
          </div>
          <div class="ts-confirm-actions">
            <button class="ts-btn" id="tsConfirmCancel">取消</button>
            <button class="ts-btn ts-btn-danger-solid" id="tsConfirmOk">删除</button>
          </div>
        </div>
      </div>
    <div class="ts-confirm ts-alert" id="tsAlert" hidden>
        <div class="ts-confirm-box">
          <div class="ts-confirm-icon" id="tsAlertIcon">${UI_ICONS.check}</div>
          <div class="ts-confirm-content">
            <div class="ts-confirm-title" id="tsAlertTitle">模型测试</div>
            <div class="ts-confirm-message" id="tsAlertMessage"></div>
          </div>
          <div class="ts-confirm-actions">
            <button class="ts-btn ts-btn-primary" id="tsAlertOk">知道了</button>
          </div>
        </div>
      </div>
  `

  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  positionSettingsPanel(panel)
  await loadTsConfig()
  setupTsListeners()

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSettingsPanel()
  })
}

function closeSettingsPanel() {
  const overlay = document.querySelector('.translate-settings-overlay')
  if (overlay) overlay.remove()
}

function positionSettingsPanel(panel) {
  const btnRect = settingsBtn.getBoundingClientRect()
  const pw = Math.min(380, window.innerWidth - 20)
  const gap = 12
  const margin = 10

  // 先临时放过去测量自然高度
  panel.style.top = '0'
  panel.style.left = '0'
  panel.style.visibility = 'hidden'

  requestAnimationFrame(() => {
    const ph = panel.scrollHeight
    panel.style.visibility = ''

    let top = btnRect.top - ph - gap
    let left = btnRect.right + gap - pw

    if (top < margin) {
      // 上方不够 → 放在按钮下方
      top = btnRect.bottom + gap
      if (top + ph > window.innerHeight - margin) {
        // 下方也不够 → 从顶部开始，最多用满视口
        top = margin
        panel.style.maxHeight = `${window.innerHeight - margin * 2}px`
      }
    }
    if (left < margin) left = margin
    if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin

    panel.style.top = `${top}px`
    panel.style.left = `${left}px`
  })
}

async function loadTsConfig() {
  const cfg = await chrome.storage.sync.get({
    provider: 'deepseek', apiKey: '', baseUrl: '', model: '',
    targetLang: TS_DEFAULT_TARGET_LANGUAGE, theme: 'system', disableThinking: true, triggerMode: 'click',
    floatingButtonVisible: true, globalSettingsCollapsed: false
  })
  tsSetSegmentValue('ts-theme-segment', cfg.theme || 'system')
  tsSetSegmentValue('ts-trigger-segment', cfg.triggerMode || 'click')
  tsSetFloatingButtonVisible(cfg.floatingButtonVisible !== false)
  tsSetTargetLangValue(cfg.targetLang || TS_DEFAULT_TARGET_LANGUAGE)
  tsSetGlobalCollapsed(Boolean(cfg.globalSettingsCollapsed))
  const panel = document.querySelector('.translate-settings-panel')
  if (panel) {
    const themeClass = await getTheme()
    panel.classList.toggle('dark', themeClass === 'dark')
  }
  tsUpdatePlaceholders(cfg.provider)
  $('ts-provider').value = cfg.provider
  $('ts-apiKey').value = cfg.apiKey
  $('ts-baseUrl').value = cfg.baseUrl
  $('ts-model').value = cfg.model
  $('ts-disableThinking').checked = cfg.disableThinking
  refreshTsPresets()
}

function tsGetEditorConfig() {
  return {
    provider: $('ts-provider').value,
    apiKey: $('ts-apiKey').value,
    baseUrl: $('ts-baseUrl').value,
    model: $('ts-model').value,
    disableThinking: $('ts-disableThinking').checked
  }
}

async function tsApplyPreset(preset) {
  const state = await chrome.storage.sync.get({ theme: 'system', triggerMode: 'click', targetLang: TS_DEFAULT_TARGET_LANGUAGE, floatingButtonVisible: true })
  const config = {
    ...preset,
    theme: state.theme || 'system',
    triggerMode: state.triggerMode || 'click',
    targetLang: tsNormalizeLanguage(state.targetLang) || TS_DEFAULT_TARGET_LANGUAGE,
    floatingButtonVisible: state.floatingButtonVisible !== false
  }
  await chrome.storage.sync.set(config)
}

function tsStatus(msg) {
  const panel = document.querySelector('.translate-settings-panel')
  if (!panel) return

  const existing = panel.querySelector('.ts-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = 'ts-toast'
  toast.textContent = msg
  panel.appendChild(toast)

  requestAnimationFrame(() => { toast.classList.add('show') })

  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 200)
  }, 1800)
}

function tsUpdatePlaceholders(provider, resetValues = false) {
  const d = TS_PROVIDER_DEFAULTS[provider] || TS_PROVIDER_DEFAULTS.openai
  $('ts-baseUrl').disabled = d.locked
  $('ts-baseUrl').value = d.baseUrl
  $('ts-model').placeholder = d.model
  if (resetValues) $('ts-model').value = d.model
}

async function refreshTsPresets(selected) {
  const state = await chrome.storage.sync.get({
    translationPresets: {},
    activePresetName: '',
    provider: '', apiKey: '', baseUrl: '', model: '', disableThinking: true
  })
  const presets = state.translationPresets || {}
  const list = $('tsPresetList')
  const count = $('tsPresetCount')
  const rows = Object.keys(presets)
    .map((name, index) => ({ name, index, ...presets[name] }))
    .sort((a, b) => {
      const activeDelta = Number(tsIsActivePreset(b, state)) - Number(tsIsActivePreset(a, state))
      return activeDelta || a.index - b.index
    })

  count.textContent = `${rows.length} 个配置`
  list.innerHTML = rows.length ? '' : '<div class="ts-empty">暂无模型预设</div>'
  rows.forEach(row => {
    const item = document.createElement('div')
    item.className = 'ts-model-item'
    item.innerHTML = `
      <div class="ts-model-main">
        <div class="ts-model-title">
          <span>${tsEscape(row.name)}</span>
          ${tsIsActivePreset(row, state) ? '<em>使用中</em>' : ''}
        </div>
        <div class="ts-model-meta"><b>${PROVIDER_NAMES[row.provider] || row.provider || '未知平台'}</b><span>${tsEscape(row.model || '未配置模型')}</span></div>
        <div class="ts-model-url">${tsEscape(row.baseUrl || '未配置 API 端点')}</div>
      </div>
      <div class="ts-model-actions">
        <button title="设为使用" aria-label="设为使用" data-action="use" data-name="${tsEscapeAttr(row.name)}">${UI_ICONS.check}</button>
        <button title="测试可用性" aria-label="测试可用性" data-action="test" data-name="${tsEscapeAttr(row.name)}">${UI_ICONS.test}</button>
        <button title="编辑" aria-label="编辑" data-action="edit" data-name="${tsEscapeAttr(row.name)}">${UI_ICONS.edit}</button>
        <button title="删除" aria-label="删除" data-action="delete" data-name="${tsEscapeAttr(row.name)}">${UI_ICONS.trash}</button>
      </div>
    `
    list.appendChild(item)
  })

  if (selected && presets[selected]) {
    await tsOpenEditor(selected, presets[selected])
  }
}

async function tsLoadPreset(name) {
  if (!name) return
  const presets = await chrome.storage.sync.get({ translationPresets: {} }).then(r => r.translationPresets)
  const p = presets[name]
  if (!p) return

  const provider = p.provider || 'openai'
  const d = TS_PROVIDER_DEFAULTS[provider] || TS_PROVIDER_DEFAULTS.openai

  $('ts-provider').value = provider
  $('ts-baseUrl').disabled = d.locked
  $('ts-baseUrl').value = d.locked ? d.baseUrl : (p.baseUrl || d.baseUrl)
  $('ts-model').value = p.model || d.model
  $('ts-model').placeholder = d.model
  $('ts-apiKey').value = p.apiKey || ''
  $('ts-disableThinking').checked = p.disableThinking !== false

  await tsApplyPreset(tsGetEditorConfig())
  tsStatus(`已载入预设「${name}」`)
}

function tsIsActivePreset(preset, state) {
  if (state.activePresetName) return state.activePresetName === preset.name
  const keys = ['provider', 'apiKey', 'baseUrl', 'model']
  return keys.every(k => (preset[k] || '') === (state[k] || '')) &&
    (preset.disableThinking !== false) === (state.disableThinking !== false)
}

function tsNormalizePreset(values = {}) {
  const provider = values.provider || 'deepseek'
  const defaults = TS_PROVIDER_DEFAULTS[provider] || TS_PROVIDER_DEFAULTS.deepseek
  return {
    provider,
    apiKey: values.apiKey || '',
    baseUrl: values.baseUrl || defaults.baseUrl,
    model: values.model || defaults.model,
    disableThinking: values.disableThinking !== false
  }
}

function tsSendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(response)
    })
  })
}

async function tsTestPreset(name, preset, button) {
  if (!preset || button?.disabled) return
  if (button) {
    button.disabled = true
    button.classList.add('testing')
  }
  try {
    const response = await tsSendRuntimeMessage({
      type: 'testModelConnection',
      config: tsNormalizePreset(preset)
    })
    if (!response?.ok) throw new Error(response?.error || '模型测试失败')
    tsShowAlert(`「${name}」可用`, `连接成功，耗时 ${response.data?.latencyMs ?? '-'} ms。`, 'success')
  } catch (err) {
    tsShowAlert(`「${name}」不可用`, tsFormatConnectionError(err), 'error')
  } finally {
    if (button) {
      button.disabled = false
      button.classList.remove('testing')
    }
  }
}

function tsFormatConnectionError(err) {
  const msg = err?.message || String(err || '') || '请检查 API Key、端点、模型名称和网络连接。'
  return msg.length > 500 ? `${msg.slice(0, 500)}...` : msg
}

function tsSetSegmentValue(id, value) {
  const segment = $(id)
  if (!segment) return
  segment.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value)
  })
}

function tsSetGlobalCollapsed(collapsed) {
  const card = document.querySelector('.translate-settings-panel .ts-global-card')
  const toggle = $('tsGlobalToggle')
  if (!card || !toggle) return
  card.classList.toggle('collapsed', collapsed)
  toggle.setAttribute('aria-expanded', String(!collapsed))
}

function tsSetFloatingButtonVisible(visible) {
  tsSetSegmentValue('ts-floating-segment', visible ? 'show' : 'hide')
}

function tsSetTargetLangValue(value) {
  const input = $('ts-globalTargetLang')
  if (!input) return
  input.dataset.value = tsNormalizeLanguage(value) || TS_DEFAULT_TARGET_LANGUAGE
  input.value = tsGetLanguageLabel(input.dataset.value)
}

function tsEscape(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function tsEscapeAttr(value) {
  return tsEscape(value).replace(/`/g, '&#96;')
}

async function tsOpenEditor(name = '', preset = null) {
  const editor = $('tsEditor')
  editor.hidden = false
  requestAnimationFrame(() => editor.classList.add('open'))
  editor.dataset.mode = name ? 'edit' : 'add'
  editor.dataset.editingName = name
  $('tsEditorTitle').textContent = name ? '编辑模型预设' : '新增模型预设'

  const p = preset || {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: TS_PROVIDER_DEFAULTS.deepseek.baseUrl,
    model: TS_PROVIDER_DEFAULTS.deepseek.model,
    disableThinking: true
  }
  $('ts-presetName').value = name
  $('ts-provider').value = p.provider || 'deepseek'
  tsUpdatePlaceholders($('ts-provider').value)
  $('ts-apiKey').value = p.apiKey || ''
  $('ts-baseUrl').value = p.baseUrl || TS_PROVIDER_DEFAULTS[$('ts-provider').value].baseUrl
  $('ts-model').value = p.model || TS_PROVIDER_DEFAULTS[$('ts-provider').value].model
  $('ts-disableThinking').checked = p.disableThinking !== false
}

function tsCloseEditor() {
  const editor = $('tsEditor')
  if (!editor) return
  editor.classList.remove('open')
  setTimeout(() => {
    if (!editor.classList.contains('open')) editor.hidden = true
  }, 180)
}

async function tsSaveTargetLang(showSaved = true) {
  const input = $('ts-globalTargetLang')
  if (!input) return
  const targetLang = tsNormalizeLanguage(input.value) || TS_DEFAULT_TARGET_LANGUAGE
  tsSetTargetLangValue(targetLang)
  await chrome.storage.sync.set({ targetLang })
  if (showSaved) tsStatus('目标语言已更新')
}

function tsNormalizeLanguage(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text === '中文') return TS_DEFAULT_TARGET_LANGUAGE
  const option = TS_LANGUAGE_OPTIONS.find(item => item.value === text || item.label === text)
  return option ? option.value : text
}

function tsGetLanguageLabel(value) {
  const option = TS_LANGUAGE_OPTIONS.find(item => item.value === value || item.label === value)
  return option ? option.label : value
}

function tsFilterLanguageOptions(keyword) {
  const text = String(keyword || '').trim().toLowerCase()
  if (!text) return TS_LANGUAGE_OPTIONS
  return TS_LANGUAGE_OPTIONS.filter(item => `${item.label} ${item.value}`.toLowerCase().includes(text))
}

function tsRenderLanguageDropdown(keyword = '') {
  const dropdown = $('ts-globalTargetLangDropdown')
  if (!dropdown) return
  const options = tsFilterLanguageOptions(keyword)
  dropdown.innerHTML = options.length
    ? options.map(item => {
      const selected = item.value === $('ts-globalTargetLang')?.dataset.value
      return `<button type="button" class="ts-lang-option${selected ? ' active' : ''}" data-value="${tsEscapeAttr(item.value)}">${tsEscape(item.label)}</button>`
    }).join('')
    : '<div class="ts-lang-empty">暂无匹配语言</div>'
}

function tsOpenLanguageDropdown(keyword = '') {
  const dropdown = $('ts-globalTargetLangDropdown')
  const select = $('ts-globalTargetLangSelect')
  const input = $('ts-globalTargetLang')
  if (!dropdown || !select || !input) return
  tsRenderLanguageDropdown(keyword)
  dropdown.hidden = false
  select.classList.add('open')
}

function tsCloseLanguageDropdown() {
  const dropdown = $('ts-globalTargetLangDropdown')
  const select = $('ts-globalTargetLangSelect')
  if (dropdown) dropdown.hidden = true
  if (select) select.classList.remove('open')
}

async function tsPickTargetLang(value) {
  const targetLang = tsNormalizeLanguage(value) || TS_DEFAULT_TARGET_LANGUAGE
  tsSetTargetLangValue(targetLang)
  tsCloseLanguageDropdown()
  await chrome.storage.sync.set({ targetLang })
  tsStatus('目标语言已更新')
}

async function tsToggleGlobalSettings() {
  const card = document.querySelector('.translate-settings-panel .ts-global-card')
  if (!card) return
  const collapsed = !card.classList.contains('collapsed')
  tsSetGlobalCollapsed(collapsed)
  await chrome.storage.sync.set({ globalSettingsCollapsed: collapsed })
}

function tsShowDeleteConfirm(name) {
  const confirm = $('tsConfirm')
  if (!confirm) return
  confirm.dataset.name = name
  $('tsConfirmMessage').textContent = `确定删除「${name}」吗？删除后无法恢复。`
  confirm.hidden = false
}

function tsHideDeleteConfirm() {
  const confirm = $('tsConfirm')
  if (!confirm) return
  confirm.hidden = true
  confirm.dataset.name = ''
}

function tsShowAlert(title, message, type = 'success') {
  const alert = $('tsAlert')
  if (!alert) return
  alert.classList.toggle('error', type === 'error')
  alert.classList.toggle('success', type !== 'error')
  $('tsAlertIcon').innerHTML = type === 'error' ? UI_ICONS.warning : UI_ICONS.check
  $('tsAlertTitle').textContent = title
  $('tsAlertMessage').textContent = message
  alert.hidden = false
}

function tsHideAlert() {
  const alert = $('tsAlert')
  if (!alert) return
  alert.hidden = true
}

async function tsDeletePreset(name) {
  if (!name) return
  const presets = await chrome.storage.sync.get({ translationPresets: {} }).then(r => r.translationPresets)
  if (!presets[name]) return
  delete presets[name]
  await chrome.storage.sync.set({ translationPresets: presets })
  const active = await chrome.storage.sync.get({ activePresetName: '' })
  if (active.activePresetName === name) await chrome.storage.sync.set({ activePresetName: '' })
  await refreshTsPresets()
  tsStatus('预设已删除')
}

function setupTsListeners() {
  $('tsClose').addEventListener('click', closeSettingsPanel)

  $('ts-provider').addEventListener('change', function () {
    tsUpdatePlaceholders(this.value, true)
  })

  $('tsToggleKey').addEventListener('click', () => {
    const inp = $('ts-apiKey')
    inp.type = inp.type === 'password' ? 'text' : 'password'
  })

  $('ts-theme-segment').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-value]')
    if (!btn) return
    const theme = btn.dataset.value
    await chrome.storage.sync.set({ theme })
    tsSetSegmentValue('ts-theme-segment', theme)
    const p = btn.closest('.translate-settings-panel')
    if (p) {
      const themeClass = await getTheme()
      p.classList.toggle('dark', themeClass === 'dark')
    }
    tsStatus('主题已更新')
  })

  $('ts-trigger-segment').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-value]')
    if (!btn) return
    const triggerMode = btn.dataset.value
    window.getSelection()?.removeAllRanges()
    if (triggerMode === 'disabled') close()
    await chrome.storage.sync.set({ triggerMode })
    tsSetSegmentValue('ts-trigger-segment', triggerMode)
    tsStatus('触发方式已更新')
  })

  $('ts-floating-segment').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-value]')
    if (!btn) return
    const visible = btn.dataset.value === 'show'
    await chrome.storage.sync.set({ floatingButtonVisible: visible })
    tsSetFloatingButtonVisible(visible)
    tsStatus(visible ? '悬浮按钮已显示' : '悬浮按钮已隐藏')
  })

  $('tsGlobalHead').addEventListener('click', (e) => {
    e.preventDefault()
    tsToggleGlobalSettings()
  })
  $('tsGlobalToggle').addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    tsToggleGlobalSettings()
  })

  $('ts-globalTargetLang').addEventListener('focus', (e) => {
    e.currentTarget.select()
    tsOpenLanguageDropdown()
  })
  $('ts-globalTargetLang').addEventListener('input', (e) => {
    tsOpenLanguageDropdown(e.currentTarget.value)
  })
  $('ts-globalTargetLang').addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      tsCloseLanguageDropdown()
      e.currentTarget.value = tsGetLanguageLabel(e.currentTarget.dataset.value || TS_DEFAULT_TARGET_LANGUAGE)
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const first = $('ts-globalTargetLangDropdown')?.querySelector('.ts-lang-option')
    await tsPickTargetLang(first?.dataset.value || e.currentTarget.value)
  })
  $('ts-globalTargetLang').addEventListener('blur', () => {
    setTimeout(() => {
      const input = $('ts-globalTargetLang')
      const dropdown = $('ts-globalTargetLangDropdown')
      if (!input || !dropdown || dropdown.hidden) return
      tsCloseLanguageDropdown()
      input.value = tsGetLanguageLabel(input.dataset.value || TS_DEFAULT_TARGET_LANGUAGE)
    }, 120)
  })
  $('ts-globalTargetLangToggle').addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const dropdown = $('ts-globalTargetLangDropdown')
    if (dropdown?.hidden) {
      $('ts-globalTargetLang').focus()
      tsOpenLanguageDropdown()
    } else {
      tsCloseLanguageDropdown()
    }
  })
  $('ts-globalTargetLangDropdown').addEventListener('mousedown', (e) => {
    e.preventDefault()
  })
  $('ts-globalTargetLangDropdown').addEventListener('click', async (e) => {
    const option = e.target.closest('.ts-lang-option')
    if (!option) return
    await tsPickTargetLang(option.dataset.value)
  })

  $('tsAddPreset').addEventListener('click', () => tsOpenEditor())
  $('tsCancelEdit').addEventListener('click', tsCloseEditor)
  $('tsCancelEditor').addEventListener('click', tsCloseEditor)
  $('tsEditor').addEventListener('click', (e) => {
    if (e.target === $('tsEditor')) tsCloseEditor()
  })

  $('tsPresetList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]')
    if (!btn) return
    const name = btn.dataset.name
    const presets = await chrome.storage.sync.get({ translationPresets: {} }).then(r => r.translationPresets)
    const preset = presets[name]
    if (!preset) return
    if (btn.dataset.action === 'use') {
      await tsApplyPreset(preset)
      await chrome.storage.sync.set({ activePresetName: name })
      await refreshTsPresets()
      tsStatus(`已使用「${name}」`)
    } else if (btn.dataset.action === 'test') {
      await tsTestPreset(name, preset, btn)
    } else if (btn.dataset.action === 'edit') {
      await tsOpenEditor(name, preset)
    } else if (btn.dataset.action === 'delete') {
      tsShowDeleteConfirm(name)
    }
  })

  $('tsAlertOk').addEventListener('click', tsHideAlert)
  $('tsAlert').addEventListener('click', (e) => {
    if (e.target === $('tsAlert')) tsHideAlert()
  })

  $('tsConfirmCancel').addEventListener('click', tsHideDeleteConfirm)
  $('tsConfirm').addEventListener('click', (e) => {
    if (e.target === $('tsConfirm')) tsHideDeleteConfirm()
  })
  $('tsConfirmOk').addEventListener('click', async () => {
    const name = $('tsConfirm').dataset.name || ''
    await tsDeletePreset(name)
    tsHideDeleteConfirm()
  })

  $('tsSavePreset').addEventListener('click', async () => {
    const name = $('ts-presetName').value.trim()
    if (!name) { $('ts-presetName').focus(); return }
    const editor = $('tsEditor')
    const editingName = editor.dataset.editingName || ''
    const mode = editor.dataset.mode || 'add'
    const presets = await chrome.storage.sync.get({ translationPresets: {} }).then(r => r.translationPresets)
    if (mode === 'add' && presets[name]) { tsStatus('预设名称已存在'); return }
    if (mode === 'edit' && name !== editingName && presets[name]) { tsStatus('预设名称已存在'); return }

    if (mode === 'edit' && editingName && editingName !== name) delete presets[editingName]
    presets[name] = tsGetEditorConfig()
    await chrome.storage.sync.set({ translationPresets: presets })

    const active = await chrome.storage.sync.get({ activePresetName: '' })
    if (active.activePresetName === editingName) {
      await chrome.storage.sync.set({ activePresetName: name })
      await tsApplyPreset(presets[name])
    }

    tsCloseEditor()
    await refreshTsPresets()
    tsStatus(mode === 'edit' ? '预设已更新' : '预设已新增')
  })
}

let selectionTimer = null
document.addEventListener('selectionchange', () => {
  if (selectionTimer) clearTimeout(selectionTimer)
  selectionTimer = setTimeout(checkSelection, 200)
})

document.addEventListener('mouseup', (e) => {
  isDragging = false
  if (container && container.contains(e.target)) return
  if (container) close()
  setTimeout(checkSelection, 50)
})

document.addEventListener('mousedown', (e) => {
  isDragging = true
  if (container && !container.contains(e.target)) {
    close()
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    close()
    closeSettingsPanel()
  }
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'translatePage') {
    sendResponse(startPageTranslation(request))
    return
  }
  if (request.type === 'restorePageTranslation') {
    sendResponse(restorePageTranslation(request))
    return
  }
  if (request.type === 'cancelPageTranslation') {
    sendResponse(cancelPageTranslation())
  }
})
