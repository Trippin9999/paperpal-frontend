<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createBookmark,
  createNote,
  listBookmarks,
  listNotes,
  readPdf,
  removeBookmark,
  renameBookmark,
  removeNote,
  updateNote,
} from '@/services/pdfManageApi'

const route = useRoute()
const router = useRouter()

const working = ref(false)
const message = ref('')
const errorMessage = ref('')

const selectedDocumentId = ref(null)
const selectedDocumentName = ref('')
const pdfContent = ref('')
const pdfSegments = ref([])
const selectedPosition = ref(null)
const selectedTextContent = ref('')
const bookmarks = ref([])
const bookmarkListLoading = ref(false)
const bookmarkEdits = reactive({})
const notes = ref([])
const noteListLoading = ref(false)
const noteEdits = reactive({})
const noteColorEdits = reactive({})
const noteType = ref('sticky')
const noteContent = ref('')
const noteColor = ref('#FFE08A')
const selectedNoteId = ref(null)
const segmentRefs = reactive({})
const contentBlockRef = ref(null)
const jumpHighlightSegmentId = ref(null)
const isBookmarkOpen = ref(false)
let jumpTimer = null

const notesBySegmentId = computed(() => {
  const map = {}
  notes.value.forEach((note) => {
    const segmentId = note?.position?.segmentId
    if (segmentId == null) {
      return
    }
    if (!map[segmentId]) {
      map[segmentId] = []
    }
    map[segmentId].push(note)
  })
  return map
})

const stickyNotes = computed(() => notes.value.filter((note) => getNoteKind(note) === 'sticky'))
const stickyNotesBySegmentId = computed(() => {
  const map = {}
  stickyNotes.value.forEach((note) => {
    const segmentId = note?.position?.segmentId
    if (segmentId == null) {
      return
    }
    if (!map[segmentId]) {
      map[segmentId] = []
    }
    map[segmentId].push(note)
  })
  return map
})

const noteItemRefs = reactive({})
const highlightedNoteId = ref(null)
let noteFlashTimer = null

const activeNoteIds = ref([])
const activeStickyNotes = computed(() => {
  return stickyNotes.value.filter(n => activeNoteIds.value.includes(n.noteId))
})

function openStickyNotePanel(noteId) {
  if (!activeNoteIds.value.includes(noteId)) {
    activeNoteIds.value.push(noteId)
  }
}

function closeStickyNotePanel(noteId) {
  activeNoteIds.value = activeNoteIds.value.filter(id => id !== noteId)
}

function setSuccess(msg) {
  message.value = msg
  errorMessage.value = ''
}

function setError(err) {
  errorMessage.value = err instanceof Error ? err.message : 'Something went wrong'
  message.value = ''
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getNoteKind(note) {
  return note?.content ? 'sticky' : 'highlighter'
}

function getNoteLabel(note) {
  return getNoteKind(note) === 'sticky' ? '便條' : '標記'
}

function normalizeRanges(ranges, textLength) {
  const valid = ranges
    .filter((r) => r.start >= 0 && r.end > r.start && r.start < textLength)
    .map((r) => ({ ...r, end: Math.min(r.end, textLength) }))
    .sort((a, b) => a.start - b.start)

  const normalized = []
  let cursor = 0
  valid.forEach((range) => {
    if (range.start < cursor) {
      return
    }
    normalized.push(range)
    cursor = range.end
  })
  return normalized
}

function getMarkRanges(segmentId, textLength) {
  // 回傳這段文字中所有有效且不重疊的 highlight 與 sticky
  const segmentNotes = notesBySegmentId.value[segmentId] || []

  const highlighters = []
  const stickies = []

  segmentNotes.forEach((note) => {
    const start = Number(note?.position?.contentIndex ?? 0)
    const length = Number(note?.position?.contentLength ?? 0)
    const range = {
      noteId: note?.noteId ?? null,
      kind: getNoteKind(note),
      start,
      end: start + length,
      color: note?.backgroundColor || '#ffe08a',
    }
    if (range.kind === 'highlighter') {
      highlighters.push(range)
    } else {
      stickies.push(range)
    }
  })

  return {
    highlighters: normalizeRanges(highlighters, textLength),
    stickies: normalizeRanges(stickies, textLength)
  }
}

function applyStickiesToText(text, startIndex, stickies) {
  if (!text) return ''
  let html = ''
  const endIndex = startIndex + text.length

  const relevantStickies = stickies.filter(s => s.end > startIndex && s.start < endIndex)

  let textCursor = 0
  relevantStickies.forEach(sticky => {
    const sStart = Math.max(startIndex, sticky.start) - startIndex
    const sEnd = Math.min(endIndex, sticky.end) - startIndex

    if (sStart > textCursor) {
      html += escapeHtml(text.slice(textCursor, sStart))
    }
    const noteIdAttr = sticky.noteId != null ? ` data-note-id="${sticky.noteId}"` : ''
    html += `<span class="sticky-underline"${noteIdAttr}>${escapeHtml(text.slice(sStart, sEnd))}</span>`
    textCursor = sEnd
  })

  if (textCursor < text.length) {
    html += escapeHtml(text.slice(textCursor))
  }
  return html
}

function renderSegmentHtml(segment) {
  const content = segment?.content ?? ''
  if (!content) {
    return ''
  }

  const segmentId = segment?.segmentId ?? 1
  const { highlighters, stickies } = getMarkRanges(segmentId, content.length)

  if (!highlighters.length && !stickies.length) {
    return escapeHtml(content)
  }

  let html = ''
  let cursor = 0

  // 以 highlighter 為主框架，將 sticky 拆分或套用在其內部或外部
  highlighters.forEach((h) => {
    if (h.start > cursor) {
      // 在 highlighter 之前的文字，套用 sticky
      html += applyStickiesToText(content.slice(cursor, h.start), cursor, stickies)
    }

    // 渲染 highlighter 內部
    const noteIdAttr = h.noteId != null ? ` data-note-id="${h.noteId}"` : ''
    const removeButton = h.noteId != null
      ? `<button class="highlight-remove" type="button" data-note-id="${h.noteId}">移除</button>`
      : ''

    const innerText = content.slice(h.start, h.end)
    const innerHtml = applyStickiesToText(innerText, h.start, stickies)

    html += `<span class="highlight" style="background-color: ${h.color}"${noteIdAttr}>` +
      `${innerHtml}${removeButton}</span>`

    cursor = h.end
  })

  if (cursor < content.length) {
    html += applyStickiesToText(content.slice(cursor), cursor, stickies)
  }

  return html
}

function setSegmentRef(segmentId, element) {
  if (segmentId == null) {
    return
  }
  if (element) {
    segmentRefs[segmentId] = element
    return
  }
  delete segmentRefs[segmentId]
}

function setNoteItemRef(noteId, element) {
  if (noteId == null) {
    return
  }
  if (element) {
    noteItemRefs[noteId] = element
    return
  }
  delete noteItemRefs[noteId]
}

function flashNoteItem(noteId) {
  highlightedNoteId.value = noteId
  if (noteFlashTimer) {
    window.clearTimeout(noteFlashTimer)
  }
  noteFlashTimer = window.setTimeout(() => {
    highlightedNoteId.value = null
  }, 1400)
}

function flashJumpTarget(segmentId) {
  jumpHighlightSegmentId.value = segmentId
  if (jumpTimer) {
    window.clearTimeout(jumpTimer)
  }
  jumpTimer = window.setTimeout(() => {
    jumpHighlightSegmentId.value = null
  }, 1400)
}

function getSegmentElement(node) {
  if (!node) {
    return null
  }

  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
  return element?.closest?.('[data-segment-id]') || null
}

function buildPositionFromSelection() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return null
  }

  const selectedText = selection.toString()
  if (!selectedText.trim()) {
    return null
  }

  const range = selection.getRangeAt(0)
  const startSegment = getSegmentElement(range.startContainer)
  const endSegment = getSegmentElement(range.endContainer)

  if (!startSegment || startSegment !== endSegment) {
    setError('請在同一段落內選取文字。')
    return null
  }

  const segmentIdRaw = startSegment.dataset.segmentId
  const segmentId = segmentIdRaw != null && segmentIdRaw !== '' ? Number(segmentIdRaw) : null

  const preRange = document.createRange()
  preRange.selectNodeContents(startSegment)
  preRange.setEnd(range.startContainer, range.startOffset)

  const contentIndex = preRange.toString().length
  const contentLength = selectedText.length

  return {
    segmentId,
    contentIndex,
    contentLength,
  }
}

function handleSelection() {
  const position = buildPositionFromSelection()
  if (!position) {
    return
  }

  selectedTextContent.value = window.getSelection()?.toString() || ''
  selectedPosition.value = position
  selectedNoteId.value = null
  jumpHighlightSegmentId.value = null
  setSuccess('已更新選取位置。')
}

function clearSelection() {
  selectedPosition.value = null
  selectedTextContent.value = ''
  selectedNoteId.value = null
  window.getSelection()?.removeAllRanges()
}

function handleHighlightClick(event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }
  if (!target.classList.contains('highlight-remove')) {
    if (target.classList.contains('sticky-underline')) {
      const noteId = Number(target.dataset.noteId)
      if (!Number.isFinite(noteId)) {
        setError('找不到便條資訊。')
        return
      }
      handleJumpToStickyNoteById(noteId)
      openStickyNotePanel(noteId)
    }
    return
  }
  const noteId = Number(target.dataset.noteId)
  if (!Number.isFinite(noteId)) {
    setError('找不到標記資訊。')
    return
  }
  handleRemoveNote(noteId)
}


async function fetchBookmarkList(documentId, { silent = false } = {}) {
  if (!documentId) {
    return
  }

  if (!silent) {
    bookmarkListLoading.value = true
  }

  try {
    const result = await listBookmarks(documentId)
    bookmarks.value = Array.isArray(result.bookmarks) ? result.bookmarks : []

    bookmarks.value.forEach((bookmark) => {
      if (bookmark?.bookmarkId != null && bookmarkEdits[bookmark.bookmarkId] == null) {
        bookmarkEdits[bookmark.bookmarkId] = bookmark.title || ''
      }
    })
  } catch (error) {
    if (!silent) {
      setError(error)
    }
  } finally {
    if (!silent) {
      bookmarkListLoading.value = false
    }
  }
}

async function fetchNoteList(documentId, { silent = false } = {}) {
  if (!documentId) {
    return
  }

  if (!silent) {
    noteListLoading.value = true
  }

  try {
    const result = await listNotes(documentId)
    notes.value = Array.isArray(result.notes) ? result.notes : []
    notes.value.forEach((note) => {
      if (note?.noteId == null) {
        return
      }
      if (noteEdits[note.noteId] == null) {
        noteEdits[note.noteId] = note.content || ''
      }
      if (noteColorEdits[note.noteId] == null) {
        noteColorEdits[note.noteId] = note.backgroundColor || '#FFE08A'
      }
    })
  } catch (error) {
    if (!silent) {
      setError(error)
    }
  } finally {
    if (!silent) {
      noteListLoading.value = false
    }
  }
}

async function handleCreateBookmark() {
  if (!selectedDocumentId.value) {
    setError('請先選擇檔案。')
    return
  }
  if (!selectedPosition.value) {
    setError('請先在閱讀區選取文字。')
    return
  }

  working.value = true
  try {
    const result = await createBookmark(selectedDocumentId.value, selectedPosition.value)
    await fetchBookmarkList(selectedDocumentId.value, { silent: true })
    setSuccess(result.message || 'Bookmark 建立成功')
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleCreateNote() {
  if (!selectedDocumentId.value) {
    setError('請先選擇檔案。')
    return
  }
  if (!selectedPosition.value) {
    setError('請先在閱讀區選取文字。')
    return
  }

  const payload = {}
  if (noteType.value === 'sticky') {
    const content = noteContent.value.trim()
    if (!content) {
      setError('請輸入便條內容。')
      return
    }
    payload.content = content
  } else {
    const style = noteColor.value.trim()
    if (!style) {
      setError('請選擇標記顏色。')
      return
    }
    payload.style = style
  }

  working.value = true
  try {
    const result = await createNote(selectedDocumentId.value, selectedPosition.value, payload)
    await fetchNoteList(selectedDocumentId.value, { silent: true })
    noteContent.value = ''
    setSuccess(result.message || 'Note 建立成功')

    if (noteType.value === 'sticky') {
      const newNoteId = result.note?.noteId || Math.max(...stickyNotes.value.map(n => n.noteId), -1)
      if (newNoteId !== -1 && Number.isFinite(newNoteId)) {
        openStickyNotePanel(newNoteId)
      }
    }
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleUpdateNote(note) {
  if (!note?.noteId) {
    setError('請先選擇 Note。')
    return
  }

  const payload = {}
  if (getNoteKind(note) === 'sticky') {
    const content = (noteEdits[note.noteId] || '').trim()
    if (!content) {
      setError('請輸入便條內容。')
      return
    }
    payload.content = content
  } else {
    const style = (noteColorEdits[note.noteId] || '').trim()
    if (!style) {
      setError('請選擇標記顏色。')
      return
    }
    payload.style = style
  }

  working.value = true
  try {
    const result = await updateNote(note.noteId, payload)
    await fetchNoteList(selectedDocumentId.value, { silent: true })
    setSuccess(result.message || 'Note 更新成功')
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleRemoveNote(noteId) {
  if (!noteId) {
    setError('請先選擇 Note。')
    return
  }

  working.value = true
  try {
    const result = await removeNote(noteId)
    await fetchNoteList(selectedDocumentId.value, { silent: true })
    setSuccess(result.message || 'Note 刪除成功')
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleRenameBookmark(bookmarkId) {
  const newTitle = (bookmarkEdits[bookmarkId] || '').trim()
  if (!bookmarkId) {
    setError('請先選擇 Bookmark。')
    return
  }
  if (!newTitle) {
    setError('請輸入新的 Bookmark 名稱。')
    return
  }

  working.value = true
  try {
    const result = await renameBookmark(bookmarkId, newTitle)
    await fetchBookmarkList(selectedDocumentId.value, { silent: true })
    setSuccess(result.message || 'Bookmark 更新成功')
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleRemoveBookmark(bookmarkId) {
  if (!bookmarkId) {
    setError('請先選擇 Bookmark。')
    return
  }

  working.value = true
  try {
    const result = await removeBookmark(bookmarkId)
    await fetchBookmarkList(selectedDocumentId.value, { silent: true })
    setSuccess(result.message || 'Bookmark 刪除成功')
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

function handleSelectNote(note) {
  if (!note) {
    return
  }
  selectedNoteId.value = note.noteId
  selectedPosition.value = note.position || null
  setSuccess('已選取 Note 位置。')
}

function handleJumpToBookmark(bookmark) {
  if (!bookmark?.position) {
    setError('書籤沒有位置資訊。')
    return
  }

  const segmentId = bookmark.position.segmentId ?? 1
  const targetEl = pdfSegments.value.length ? segmentRefs[segmentId] : contentBlockRef.value

  if (!targetEl) {
    setError('找不到對應段落。')
    return
  }

  selectedPosition.value = bookmark.position
  selectedNoteId.value = null

  const contentIndex = bookmark.position.contentIndex || 0
  const walk = document.createTreeWalker(targetEl, NodeFilter.SHOW_TEXT, null, false)
  let n
  let currentLen = 0
  let foundNode = null
  let foundOffset = 0

  while ((n = walk.nextNode())) {
    const len = n.nodeValue.length
    if (currentLen + len >= contentIndex) {
      foundNode = n
      foundOffset = contentIndex - currentLen
      break
    }
    currentLen += len
  }

  if (foundNode) {
    const range = document.createRange()
    const safeOffset = Math.min(Math.max(0, foundOffset), foundNode.nodeValue.length)
    range.setStart(foundNode, safeOffset)
    range.setEnd(foundNode, safeOffset)
    const span = document.createElement('span')
    range.insertNode(span)
    span.scrollIntoView({ behavior: 'smooth', block: 'start' })
    span.remove()
    targetEl.normalize()
  } else {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  flashJumpTarget(segmentId)
  setSuccess('已跳轉至書籤位置。')
}

function handleJumpToStickyNote(note) {
  if (!note?.noteId) {
    return
  }
  const targetEl = noteItemRefs[note.noteId]
  if (!targetEl) {
    return
  }
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
  flashNoteItem(note.noteId)
}

function handleJumpToStickyNoteById(noteId) {
  const note = notes.value.find((item) => item?.noteId === noteId)
  if (!note || getNoteKind(note) !== 'sticky') {
    return
  }
  handleJumpToStickyNote(note)
}

function toggleBookmarkRail() {
  isBookmarkOpen.value = !isBookmarkOpen.value
}

function handleBack() {
  router.push({ name: 'pdf-manage' })
}

async function loadFromRoute() {
  const documentId = route.params.documentId
  if (!documentId) {
    return
  }
  selectedDocumentId.value = String(documentId)
  selectedDocumentName.value = route.query.name ? String(route.query.name) : ''

  working.value = true
  try {
    const result = await readPdf(selectedDocumentId.value)
    pdfSegments.value = Array.isArray(result.segmentList) ? result.segmentList : []
    pdfContent.value = result.content || ''
    selectedPosition.value = null
    selectedTextContent.value = ''
    await fetchBookmarkList(selectedDocumentId.value, { silent: true })
    await fetchNoteList(selectedDocumentId.value, { silent: true })
    setSuccess(result.message || 'Read successful.')
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

watch(
  () => route.params.documentId,
  () => {
    loadFromRoute()
  },
)

onMounted(() => {
  loadFromRoute()
})

onBeforeUnmount(() => {
  if (jumpTimer) {
    window.clearTimeout(jumpTimer)
  }
  if (noteFlashTimer) {
    window.clearTimeout(noteFlashTimer)
  }
})
</script>

<template>
  <main class="reader-workspace">
    <header class="reader-header">
      <div>
        <p class="eyebrow">Paperpal</p>
        <h1>閱讀模式</h1>
        <p class="subtitle">在右側管理書籤與標註，左側專注閱讀內容。</p>
      </div>
      <div class="header-actions">
        <p class="api" v-if="selectedDocumentName">{{ selectedDocumentName }}</p>
        <button class="secondary" type="button" @click="handleBack">返回管理</button>
      </div>
    </header>

    <section class="reader-layout" :class="{ 'rail-open': isBookmarkOpen }">
      <aside class="bookmark-rail" :class="{ open: isBookmarkOpen }">
        <button class="rail-toggle" type="button" @click="toggleBookmarkRail">
          {{ isBookmarkOpen ? '收合' : '書籤' }}
        </button>
        <div v-if="isBookmarkOpen" class="bookmark-rail-body">
          <div class="bookmark-head">
            <h3>Bookmark</h3>
            <button
              class="primary"
              :disabled="working || !selectedPosition || !selectedDocumentId"
              type="button"
              @click="handleCreateBookmark"
            >
              建立
            </button>
          </div>
          <p v-if="bookmarkListLoading" class="hint">Loading bookmarks...</p>
          <ul v-else-if="bookmarks.length" class="bookmark-list">
            <li v-for="bookmark in bookmarks" :key="bookmark.bookmarkId" class="bookmark-item">
              <div class="bookmark-title">
                <button
                  class="bookmark-link"
                  type="button"
                  @click="handleJumpToBookmark(bookmark)"
                >
                  {{ bookmark.title || '未命名 Bookmark' }}
                </button>
              </div>
              <div class="bookmark-actions">
                <input v-model="bookmarkEdits[bookmark.bookmarkId]" placeholder="new title" />
                <button
                  class="secondary"
                  type="button"
                  :disabled="working"
                  @click="handleRenameBookmark(bookmark.bookmarkId)"
                >
                  Rename
                </button>
                <button
                  class="secondary"
                  type="button"
                  @click="handleRemoveBookmark(bookmark.bookmarkId)"
                >
                  Remove
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="hint">尚未建立 Bookmark。</p>
        </div>
      </aside>
      <section class="reader-panel">
        <div class="reader-head">
          <h2>論文閱讀區</h2>
        </div>

        <div
          class="reader-shell"
          @mouseup="handleSelection"
          @keyup="handleSelection"
          @click="handleHighlightClick"
        >
          <div class="reader-meta">
            <span>目前檔案</span>
            <strong>{{ selectedDocumentName || selectedDocumentId || '尚未選擇' }}</strong>
          </div>

          <div
            v-if="!pdfSegments.length && pdfContent"
            ref="contentBlockRef"
            data-segment-id="1"
            class="content-block"
            :class="{ 'jump-target': jumpHighlightSegmentId === 1 }"
            v-html="renderSegmentHtml({ segmentId: 1, content: pdfContent })"
          ></div>
          <ul v-else-if="pdfSegments.length" class="segment-list">
            <li
              v-for="segment in pdfSegments"
              :key="segment.segmentId ?? segment.content"
              class="segment-item"
              :data-segment-id="segment.segmentId"
              :ref="(el) => setSegmentRef(segment.segmentId, el)"
              :class="{ 'jump-target': jumpHighlightSegmentId === segment.segmentId }"
            >
              <div class="segment-text" v-html="renderSegmentHtml(segment)"></div>
            </li>
          </ul>
          <div v-else class="placeholder">
            <h3>已預留閱讀空間</h3>
            <p>請先從管理頁面選擇檔案，再進入閱讀模式。</p>
          </div>
        </div>
      </section>

      <aside class="reader-sidebar">
        <div class="selection-preview">
          <span class="preview-text">
            {{ selectedTextContent ? `選取內容：${selectedTextContent}` : '尚未選取閱讀區文字' }}
          </span>
          <button
            class="clear-selection-btn"
            type="button"
            :disabled="!selectedTextContent"
            @click="clearSelection"
          >
            取消選取
          </button>
        </div>

        <section class="note-panel">
          <div class="note-head">
            <h3>Note</h3>
            <button
              class="primary"
              type="button"
              :disabled="working || !selectedPosition || !selectedDocumentId"
              @click="handleCreateNote"
            >
              建立
            </button>
          </div>

          <div class="note-form">
            <label class="note-field">
              類型
              <select v-model="noteType">
                <option value="sticky">便條</option>
                <option value="highlighter">標記</option>
              </select>
            </label>
            <label v-if="noteType === 'sticky'" class="note-field">
              內容
              <textarea v-model="noteContent" rows="3" placeholder="輸入便條內容"></textarea>
            </label>
            <label v-else class="note-field">
              標記顏色
              <input v-model="noteColor" type="color" />
            </label>
          </div>
          <p v-if="noteListLoading" class="hint">Loading notes...</p>
          <ul v-else-if="activeStickyNotes.length" class="note-list">
            <li
              v-for="note in activeStickyNotes"
              :key="note.noteId"
              class="note-item"
              :class="{ 'note-highlight': highlightedNoteId === note.noteId }"
              :ref="(el) => setNoteItemRef(note.noteId, el)"
            >
              <div class="note-title">
                <strong>{{ getNoteLabel(note) }} #{{ note.noteId }}</strong>
                <div class="note-title-actions">
<!--                  <span class="hint">Segment {{ note.position?.segmentId ?? '-' }}</span>-->
                  <button class="close-panel-btn" type="button" title="關閉顯示" @click="closeStickyNotePanel(note.noteId)">×</button>
                </div>
              </div>
              <div class="note-edit">
                <label class="note-field">
                  內容
                  <textarea v-model="noteEdits[note.noteId]" rows="2"></textarea>
                </label>
              </div>
              <div class="bookmark-actions">
                <button class="secondary" type="button" @click="handleUpdateNote(note)">
                  update
                </button>
                <button
                  class="secondary"
                  type="button"
                  style="opacity: 1; visibility: visible; display: inline-flex"
                  @click="handleRemoveNote(note.noteId)"
                >
                  Remove
                </button>
              </div>
            </li>
          </ul>
          <p v-else-if="stickyNotes.length" class="hint">尚未開啟任何便條。<br>請點擊閱讀區內的便條底線或建立新便條來顯示內容。</p>
          <p v-else class="hint">尚未建立便條 Note。</p>
        </section>
      </aside>
    </section>

    <section v-if="message" class="notice success">{{ message }}</section>
    <section v-if="errorMessage" class="notice error">{{ errorMessage }}</section>
  </main>
</template>

<style scoped>
:root {
  --bg: #f6f7f3;
  --panel: #ffffff;
  --panel-muted: #f3f5ef;
  --ink: #1b2528;
  --ink-soft: #617175;
  --line: #d9dfd3;
  --accent: #2c6e63;
  --accent-strong: #1e574e;
  --danger: #b43636;
}

.reader-workspace {
  min-height: 100vh;
  background:
    radial-gradient(circle at 8% 12%, #dfe9d9 0%, transparent 34%),
    radial-gradient(circle at 94% 88%, #dce9e5 0%, transparent 36%), var(--bg);
  color: var(--ink);
  padding: clamp(1rem, 2.2vw, 2rem);
  font-family: 'Noto Sans TC', 'Avenir Next', 'Segoe UI', sans-serif;
}

.reader-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.6rem 0.2rem 1rem;
}

.eyebrow {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.75rem;
  color: var(--ink-soft);
}

h1 {
  margin: 0.2rem 0 0.45rem;
  font-family: 'Noto Serif TC', 'Palatino Linotype', serif;
  font-size: clamp(1.45rem, 2.5vw, 2.3rem);
  font-weight: 600;
}

.subtitle {
  margin: 0;
  color: var(--ink-soft);
  max-width: 56ch;
}

.api {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.88rem;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.reader-layout {
  display: grid;
  --bookmark-rail: 64px;
  grid-template-columns: var(--bookmark-rail) minmax(0, 1fr) minmax(280px, 360px);
  gap: 1rem;
  align-items: start;
}

.reader-layout.rail-open {
  --bookmark-rail: 260px;
}

.bookmark-rail {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 0.6rem;
  display: grid;
  gap: 0.75rem;
  box-shadow: 0 10px 28px rgba(31, 46, 44, 0.06);
  transition: width 0.2s ease;
  overflow: hidden;
}

.bookmark-rail.open {
  padding: 0.9rem;
}

.rail-toggle {
  margin-top: 0;
  width: 100%;
  font-size: 0.85rem;
  background: transparent;
  color: #111;
  border: 1px solid #111;
}

.rail-toggle:hover {
  background: transparent;
  color: #111;
  border-color: #111;
}

.bookmark-rail-body {
  display: grid;
  gap: 0.75rem;
}

.bookmark-rail .bookmark-head {
  align-items: stretch;
  gap: 0.5rem;
}

.bookmark-rail .bookmark-head h3 {
  font-size: 0.95rem;
}

.bookmark-rail .bookmark-actions,
.bookmark-rail .bookmark-title {
  flex-direction: column;
  align-items: stretch;
}

.bookmark-rail .bookmark-link,
.bookmark-rail .bookmark-actions button,
.bookmark-rail .bookmark-actions input {
  width: 100%;
}

.bookmark-rail .bookmark-actions button {
  margin-top: 0;
}

.bookmark-rail .bookmark-list {
  max-height: 50vh;
}

.reader-panel {
  min-height: 72vh;
  display: grid;
  gap: 0.7rem;
}

.reader-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.15rem 0.2rem;
}

.reader-shell {
  background: linear-gradient(180deg, #ffffff 0%, var(--panel-muted) 100%);
  min-height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.7rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem;
  box-shadow: 0 10px 28px rgba(31, 46, 44, 0.06);
}

.reader-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.7rem;
  color: var(--ink-soft);
  font-size: 0.86rem;
  border-bottom: 1px solid var(--line);
  padding-bottom: 0.55rem;
}

.reader-meta strong {
  color: var(--ink);
  max-width: 70%;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.reader-sidebar {
  display: grid;
  gap: 1rem;
  align-self: stretch;
  min-width: 0;
}

.note-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem;
  box-shadow: 0 10px 28px rgba(31, 46, 44, 0.06);
  min-height: 72vh;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
}

.note-head,
.bookmark-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.65rem;
}

.note-head h3,
.bookmark-head h3 {
  margin: 0;
  font-size: 1rem;
}

.note-form {
  display: grid;
  gap: 0.6rem;
}

.note-field {
  display: grid;
  gap: 0.25rem;
  font-size: 0.9rem;
  color: var(--ink-soft);
}

.note-edit {
  margin: 0.3rem 0 0.6rem;
}

.selection-preview {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  background: var(--panel-muted);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.preview-text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 0;
  min-width: 0;
}

.clear-selection-btn {
  flex: 0 0 auto;
  white-space: nowrap;
  background: var(--danger);
  color: #fff;
  margin-top: 0;
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-selection-btn:hover {
  background: #982f2f;
}

.clear-selection-btn:disabled {
  background: #e1e6db;
  color: #8fa094;
  cursor: not-allowed;
  opacity: 1;
}

input,
select,
textarea {
  width: 100%;
  margin: 0.35rem 0;
  padding: 0.56rem 0.68rem;
  border: 1px solid #ccd6ce;
  border-radius: 8px;
  background: #fff;
  box-sizing: border-box;
  font-family: inherit;
}

textarea {
  resize: vertical;
}

input[type='color'] {
  padding: 0.2rem;
  height: 2.4rem;
}

button {
  margin-top: 0.4rem;
  border: 0;
  border-radius: 8px;
  padding: 0.56rem 0.78rem;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}

button:hover {
  background: var(--accent-strong);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary {
  margin-top: 0;
  background: #3e4f53;
}

.secondary:hover {
  background: #2f4044;
}

.primary {
  margin-top: 0;
  background: #225b9a;
}

.primary:hover {
  background: #1b4b80;
}

.danger {
  background: var(--danger);
}

.danger:hover {
  background: #982f2f;
}

.hint {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.86rem;
}

.bookmark-list,
.note-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
  max-height: 52vh;
  overflow: auto;
  display: grid;
  gap: 0.75rem;
}

.bookmark-item,
.note-item {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.85);
}

.bookmark-title,
.note-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.note-title-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.close-panel-btn {
  background: transparent;
  border: none;
  color: var(--ink-soft);
  font-size: 1.25rem;
  line-height: 1;
  padding: 0 0.15rem;
  margin: 0;
  cursor: pointer;
  font-weight: 500;
}
.close-panel-btn:hover {
  color: var(--danger);
  background: transparent;
}

.bookmark-link {
  border: 0;
  background: none;
  padding: 0;
  margin: 0;
  color: #1f4e47;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.bookmark-link:hover {
  text-decoration: underline;
}

.bookmark-position,
.note-detail {
  margin: 0.3rem 0 0.6rem;
}

.bookmark-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.note-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid #bfc9c1;
  vertical-align: middle;
  margin-right: 0.4rem;
}

.content-block {
  margin: 0;
  white-space: pre-wrap;
  overflow: auto;
  max-height: 62vh;
  background: #101a1b;
  color: #e8f2ef;
  border-radius: 10px;
  padding: 1rem;
  line-height: 1.55;
}

.segment-list {
  margin: 0;
  padding-left: 1.2rem;
  list-style: none;
  max-height: 62vh;
  overflow: auto;
  color: #1f2a2c;
  line-height: 1.6;
}

.segment-list li {
  margin-bottom: 0.75rem;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.8rem 0.9rem;
  scroll-margin-top: 1rem;
}

.segment-text {
  margin-bottom: 0.5rem;
}

.reader-shell :deep(.highlight) {
  position: relative;
  padding: 0 0.08rem;
  border-radius: 4px;
  box-shadow: inset 0 -0.35em 0 rgba(255, 255, 255, 0.12);
}

.reader-shell :deep(.sticky-underline) {
  text-decoration: underline;
  text-decoration-thickness: 1.5px;
  text-decoration-skip-ink: none;
  cursor: pointer;
}

.reader-shell :deep(.sticky-underline:hover) {
  background-color: rgba(34, 91, 154, 0.1);
  color: #1b4b80;
  text-decoration-thickness: 3px;
  transition: all 0.2s ease;
}

.reader-shell :deep(.highlight-remove) {
  position: absolute;
  top: -1.4rem;
  right: 0;
  opacity: 0 !important;
  pointer-events: none !important;
  visibility: hidden;
  border: 0;
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  background: #b32424;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.reader-shell :deep(.highlight:hover .highlight-remove) {
  opacity: 1 !important;
  pointer-events: auto !important;
  visibility: visible;
}

.note-highlight {
  box-shadow:
    0 0 0 2px rgba(34, 91, 154, 0.35),
    0 0 0 6px rgba(34, 91, 154, 0.18);
  transition: box-shadow 0.2s ease;
}

.jump-target {
  box-shadow:
    0 0 0 2px rgba(34, 91, 154, 0.3),
    0 0 0 6px rgba(34, 91, 154, 0.12);
  border-radius: 10px;
  transition: box-shadow 0.2s ease;
}

.placeholder {
  border: 1px dashed #b8c5ba;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 10px;
  padding: 1rem;
  color: #425457;
}

.placeholder h3 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}

.placeholder p {
  margin: 0.35rem 0;
  line-height: 1.6;
}

.notice {
  border-radius: 10px;
  padding: 0.72rem 0.85rem;
  font-size: 0.9rem;
  font-weight: 600;
  margin-top: 1rem;
}

.success {
  background: #e7f7e9;
  color: #1d5f35;
  border: 1px solid #b9e5c0;
}

.error {
  background: #fbe8e8;
  color: #922f2f;
  border: 1px solid #efc5c5;
}

@media (max-width: 1024px) {
  .reader-layout {
    grid-template-columns: 1fr;
  }

  .reader-sidebar {
    order: -1;
  }
}

@media (max-width: 620px) {
  .reader-header {
    flex-direction: column;
    gap: 0.6rem;
  }

  .header-actions {
    align-self: stretch;
    justify-content: space-between;
  }
}
</style>
