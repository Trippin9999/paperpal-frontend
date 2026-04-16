<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { deletePdf, listPdfs, readPdf, renamePdf, uploadPdf } from '@/services/pdfManageApi'

const selectedFile = ref(null)
const working = ref(false)
const message = ref('')
const errorMessage = ref('')
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

const targetFilename = ref('')
const renameOldFilename = ref('')
const renameNewFilename = ref('')
const pdfContent = ref('')
const files = ref([])
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

async function refreshFileList({ silent = false } = {}) {
  if (!silent) {
    fileListLoading.value = true
  }

  try {
    const result = await listPdfs()
    files.value = Array.isArray(result.files) ? result.files : []
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
    targetFilename.value = result.filename || ''
    selectedFile.value = null
    await refreshFileList({ silent: true })
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleRead() {
  if (!targetFilename.value.trim()) {
    setError('Please enter a filename to read.')
    return
  }

  working.value = true
  try {
    const result = await readPdf(targetFilename.value.trim())
    pdfContent.value = result.content || ''
    setSuccess(result.message || 'Read successful.')
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleRename() {
  const oldName = renameOldFilename.value.trim()
  const newName = renameNewFilename.value.trim()

  if (!oldName || !newName) {
    setError('Please fill in both old filename and new filename.')
    return
  }

  working.value = true
  try {
    const result = await renamePdf(oldName, newName)
    setSuccess(result.message || 'Rename successful.')
    targetFilename.value = result.newFilename || newName

    renameOldFilename.value = ''
    renameNewFilename.value = ''
    await refreshFileList({ silent: true })
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

async function handleDelete() {
  const filename = targetFilename.value.trim()
  if (!filename) {
    setError('Please enter a filename to delete.')
    return
  }

  working.value = true
  try {
    const result = await deletePdf(filename)
    setSuccess(result.message || 'Delete successful.')
    if (targetFilename.value.trim() === filename) {
      targetFilename.value = ''
    }
    pdfContent.value = ''
    await refreshFileList({ silent: true })
  } catch (error) {
    setError(error)
  } finally {
    working.value = false
  }
}

function useFile(filename) {
  targetFilename.value = filename
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
  <main class="page">
    <section class="hero card">
      <h1>PDF Manage</h1>
      <p>Upload, read content, rename, and delete PDF files through your Spring Boot backend.</p>
      <p class="hint">API base URL: {{ apiBaseUrl }}</p>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Upload PDF</h2>
        <input type="file" accept="application/pdf,.pdf" @change="onFileChange" />
        <button :disabled="working" @click="handleUpload">Upload</button>
      </article>

      <article class="card">
        <h2>Read / Delete</h2>
        <input v-model="targetFilename" placeholder="example.pdf" />
        <div class="actions">
          <button :disabled="working" @click="handleRead">Read</button>
          <button class="danger" :disabled="working" @click="handleDelete">Delete</button>
        </div>
      </article>

      <article class="card">
        <h2>Rename PDF</h2>
        <input v-model="renameOldFilename" placeholder="old-name.pdf" />
        <input v-model="renameNewFilename" placeholder="new-name.pdf" />
        <button :disabled="working" @click="handleRename">Rename</button>
      </article>

      <article class="card">
        <h2>All Documents</h2>
        <p class="hint">Total: {{ files.length }}</p>
        <p v-if="fileListLoading" class="hint">Loading files...</p>
        <ul v-if="files.length">
          <li v-for="file in files" :key="file">
            <button class="link" @click="useFile(file)">{{ file }}</button>
          </li>
        </ul>
        <p v-else>No uploaded PDFs found.</p>
      </article>
    </section>

    <section v-if="message" class="notice success">{{ message }}</section>
    <section v-if="errorMessage" class="notice error">{{ errorMessage }}</section>

    <section class="card content-card">
      <h2>PDF Text Content</h2>
      <pre>{{ pdfContent || 'No content loaded yet.' }}</pre>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 10% 20%, #f8ecd8 0%, transparent 40%),
    radial-gradient(circle at 90% 10%, #dff0ea 0%, transparent 35%),
    linear-gradient(135deg, #f5f3ed 0%, #e5e9ec 100%);
  color: #1f2a31;
  padding: 2rem;
  font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
}

.hero h1 {
  margin: 0 0 0.3rem;
  font-size: clamp(2rem, 4vw, 3rem);
}

.hero p {
  margin: 0.4rem 0;
}

.hint {
  font-size: 0.92rem;
  opacity: 0.75;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.card {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(31, 42, 49, 0.08);
  border-radius: 14px;
  padding: 1rem;
  box-shadow: 0 8px 24px rgba(31, 42, 49, 0.08);
}

.card h2 {
  margin-top: 0;
  font-size: 1.1rem;
}

input {
  width: 100%;
  margin: 0.4rem 0;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid #cfd6dc;
  box-sizing: border-box;
}

button {
  margin-top: 0.45rem;
  border: 0;
  border-radius: 8px;
  padding: 0.55rem 0.8rem;
  background: #0f766e;
  color: #fff;
  cursor: pointer;
}

button:hover {
  background: #0b5f59;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.actions {
  display: flex;
  gap: 0.6rem;
}

.danger {
  background: #b91c1c;
}

.danger:hover {
  background: #991b1b;
}

.link {
  margin: 0;
  padding: 0;
  background: none;
  color: #0f766e;
  text-decoration: underline;
}

ul {
  margin: 0;
  padding-left: 1rem;
}

.notice {
  margin-top: 1rem;
  border-radius: 10px;
  padding: 0.8rem 1rem;
  font-weight: 600;
}

.success {
  background: #dcfce7;
  color: #166534;
}

.error {
  background: #fee2e2;
  color: #991b1b;
}

.content-card {
  margin-top: 1rem;
}

pre {
  white-space: pre-wrap;
  max-height: 320px;
  overflow: auto;
  background: #101828;
  color: #f8fafc;
  border-radius: 10px;
  padding: 1rem;
}
</style>
