<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { deletePdf, listPdfs, readPdf, renamePdf, uploadPdf } from '@/services/pdfManageApi'

const selectedFile = ref(null)
const working = ref(false)
const message = ref('')
const errorMessage = ref('')
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

const selectedDocumentId = ref(null)
const selectedDocumentName = ref('')
const renameNewFilename = ref('')
const pdfContent = ref('')
const documents = ref([])
const fileListLoading = ref(false)
let pollTimer = null

function setSuccess(msg) {
  message.value = msg
  errorMessage.value = ''
}

function setError(err) {
  errorMessage.value = err instanceof Error ? err.message : 'Something went wrong'
  message.value = ''
}

function useFile(document) {
  selectedDocumentId.value = document?.id ?? null
  selectedDocumentName.value = document?.filename ?? ''
}

async function refreshFileList({ silent = false } = {}) {
  if (!silent) {
    fileListLoading.value = true
  }

  try {
    const result = await listPdfs()
    documents.value = Array.isArray(result.documents) ? result.documents : []

    if (selectedDocumentId.value !== null) {
      const selectedById = documents.value.find((item) => item.id === selectedDocumentId.value)
      if (selectedById) {
        selectedDocumentName.value = selectedById.filename
      }
    }
  } catch (error) {
    if (!silent) {
      setError(error)
    }
  } finally {
    if (!silent) {
      fileListLoading.value = false
    }
  }
}

function onFileChange(event) {
  const file = event.target.files?.[0]
  selectedFile.value = file || null
}

async function handleUpload() {
  if (!selectedFile.value) {
    setError('Please select a PDF file first.')
    return
  }

  working.value = true
  try {
    const result = await uploadPdf(selectedFile.value)
    setSuccess(result.message || 'Upload successful.')
    selectedDocumentName.value = result.filename || ''
    selectedDocumentId.value = null
    selectedFile.value = null
    await refreshFileList({ silent: true })

    const selectedByFilename = documents.value.find(
      (item) => item.filename === selectedDocumentName.value,
    )
    if (selectedByFilename) {
      useFile(selectedByFilename)
    }
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleRead() {
  if (!selectedDocumentName.value.trim()) {
    setError('Please select a filename to read.')
    return
  }

  working.value = true
  try {
    const result = await readPdf(selectedDocumentName.value.trim())
    pdfContent.value = result.content || ''
    setSuccess(result.message || 'Read successful.')
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleRename() {
  const oldName = selectedDocumentName.value.trim()
  const newName = renameNewFilename.value.trim()

  if (!oldName) {
    setError('Please select a document first.')
    return
  }
  if (!newName) {
    setError('Please enter a new filename.')
    return
  }

  working.value = true
  try {
    const result = await renamePdf(oldName, newName)
    setSuccess(result.message || 'Rename successful.')

    selectedDocumentName.value = result.newFilename || newName
    renameNewFilename.value = ''
    await refreshFileList({ silent: true })

    if (selectedDocumentId.value !== null) {
      const selectedById = documents.value.find((item) => item.id === selectedDocumentId.value)
      if (selectedById) {
        selectedDocumentName.value = selectedById.filename
      }
    }
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleDelete() {
  const fileId = selectedDocumentId.value

  working.value = true
  try {
    const result = await deletePdf(fileId)
    setSuccess(result.message || 'Delete successful.')

    selectedDocumentId.value = null
    selectedDocumentName.value = ''
    pdfContent.value = ''
    renameNewFilename.value = ''
    await refreshFileList({ silent: true })
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleReadFromList(document) {
  useFile(document)
  await handleRead()
}

onMounted(async () => {
  await refreshFileList()
  pollTimer = window.setInterval(() => {
    refreshFileList({ silent: true })
  }, 3000)
})

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
  }
})
</script>

<template>
  <main class="workspace">
    <header class="page-header">
      <div>
        <p class="eyebrow">Paperpal</p>
        <h1>論文管理與閱讀</h1>
        <p class="subtitle">先上傳論文檔案，再在右側閱讀區查看內容。整體流程維持簡單清晰。</p>
      </div>
      <p class="api">API: {{ apiBaseUrl }}</p>
    </header>

    <section class="layout">
      <aside class="control-panel">
        <article class="panel-card">
          <h2>上傳 PDF</h2>
          <input type="file" accept="application/pdf,.pdf" @change="onFileChange" />
          <button class="upload-btn" :disabled="working" @click="handleUpload">Upload</button>
        </article>

        <article class="panel-card">
          <h2>檔案刪除</h2>
          <p class="hint">目標檔案：{{ selectedDocumentName || '尚未選擇' }}</p>
          <button
            class="danger"
            :disabled="working || !selectedDocumentName.trim()"
            @click="handleDelete"
          >
            Delete
          </button>
        </article>

        <article class="panel-card">
          <h2>重新命名</h2>
          <p class="hint">目標檔案：{{ selectedDocumentName || '尚未選擇' }}</p>
          <input v-model="renameNewFilename" placeholder="new-name.pdf" />
          <button
            class="rename-btn"
            :disabled="working || !selectedDocumentName.trim()"
            @click="handleRename"
          >
            Rename
          </button>
        </article>

        <article class="panel-card list-card">
          <div class="list-head">
            <div class="list-title">
              <h2>我的論文</h2>
              <p class="hint">{{ documents.length }} files</p>
            </div>
            <button
              class="secondary list-read"
              :disabled="working || !selectedDocumentName.trim()"
              @click="handleRead"
            >
              讀取目前檔案
            </button>
          </div>
          <p v-if="fileListLoading" class="hint">Loading files...</p>
          <ul v-if="documents.length">
            <li
              v-for="document in documents"
              :key="`${document.id ?? 'none'}-${document.filename}`"
            >
              <div class="file-row">
                <button class="file-link" @click="useFile(document)">
                  {{ document.filename }}
                </button>
                <button class="mini-read" :disabled="working" @click="handleReadFromList(document)">
                  Read
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="hint">No uploaded PDFs found.</p>
        </article>

        <section v-if="message" class="notice success">{{ message }}</section>
        <section v-if="errorMessage" class="notice error">{{ errorMessage }}</section>
      </aside>

      <section class="reader-panel">
        <div class="reader-head">
          <h2>論文閱讀區</h2>
        </div>

        <div class="reader-shell">
          <div class="reader-meta">
            <span>目前檔案</span>
            <strong>{{ selectedDocumentName || '尚未選擇' }}</strong>
          </div>

          <pre v-if="pdfContent">{{ pdfContent }}</pre>
          <div v-else class="placeholder">
            <h3>已預留閱讀空間</h3>
            <p>這裡可放置論文文字內容、段落導覽、或後續 PDF Viewer 元件。</p>
            <p>請先從左側上傳或選擇檔案，再按 Read 載入內容。</p>
          </div>
        </div>
      </section>
    </section>
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

.workspace {
  min-height: 100vh;
  background:
    radial-gradient(circle at 8% 12%, #dfe9d9 0%, transparent 34%),
    radial-gradient(circle at 94% 88%, #dce9e5 0%, transparent 36%), var(--bg);
  color: var(--ink);
  padding: clamp(1rem, 2.2vw, 2rem);
  font-family: 'Noto Sans TC', 'Avenir Next', 'Segoe UI', sans-serif;
}

.page-header {
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

.layout {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.control-panel {
  display: grid;
  gap: 0.85rem;
}

.panel-card,
.reader-shell {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem;
  box-shadow: 0 10px 28px rgba(31, 46, 44, 0.06);
}

.panel-card h2,
.reader-head h2 {
  margin: 0 0 0.65rem;
  font-size: 1rem;
}

input {
  width: 100%;
  margin: 0.35rem 0;
  padding: 0.56rem 0.68rem;
  border: 1px solid #ccd6ce;
  border-radius: 8px;
  background: #fff;
  box-sizing: border-box;
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

.danger {
  background: var(--danger);
}

.danger:hover {
  background: #982f2f;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.list-title {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
}

.upload-btn,
.rename-btn,
.danger {
  color: #ffffff;
  font-weight: 700;
}

.upload-btn {
  background: #144a8a;
}

.upload-btn:hover {
  background: #103e74;
}

.rename-btn {
  background: #0f6a58;
}

.rename-btn:hover {
  background: #0b5648;
}

.danger {
  background: #a21d1d;
}

.danger:hover {
  background: #841616;
}

.list-read {
  margin-top: 0;
  white-space: nowrap;
  font-size: 0.82rem;
  padding: 0.38rem 0.62rem;
}

.hint {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.86rem;
}

ul {
  margin: 0.35rem 0 0;
  padding-left: 1rem;
  max-height: 180px;
  overflow: auto;
}

.file-link {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: #245f56;
  text-decoration: underline;
  font-size: 0.92rem;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.mini-read {
  margin-top: 0;
  padding: 0.34rem 0.58rem;
  font-size: 0.8rem;
}

.notice {
  border-radius: 10px;
  padding: 0.72rem 0.85rem;
  font-size: 0.9rem;
  font-weight: 600;
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

pre {
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

@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .reader-panel {
    min-height: 56vh;
  }

  .api {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 620px) {
  .page-header {
    flex-direction: column;
    gap: 0.6rem;
  }

  .reader-head {
    flex-direction: column;
    align-items: stretch;
  }

  .actions {
    flex-direction: column;
  }

  .list-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
