const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

function normalizeSegments(segmentList) {
  if (!Array.isArray(segmentList)) {
    return []
  }

  return segmentList
    .map((segment) => ({
      segmentId: segment?.segmentId ?? segment?.id ?? null,
      content: segment?.content ?? '',
    }))
    .filter((segment) => segment.content)
}

function normalizeBookmarks(bookmarkList) {
  if (!Array.isArray(bookmarkList)) {
    return []
  }

  return bookmarkList.map((bookmark) => ({
    bookmarkId: bookmark?.bookmarkId ?? bookmark?.bookmarkid ?? bookmark?.id ?? null,
    title: bookmark?.title ?? '',
    layer: bookmark?.layer ?? null,
    position: bookmark?.position ?? null,
  }))
}

function normalizeNotes(noteList) {
  if (!Array.isArray(noteList)) {
    return []
  }

  return noteList.map((note) => ({
    noteId: note?.noteId ?? note?.id ?? null,
    position: note?.position ?? null,
    content: note?.content ?? null,
    backgroundColor: note?.backgroundColor ?? note?.style ?? null,
  }))
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = data?.message || `Request failed (${response.status})`
    throw new Error(message)
  }

  return data
}

export async function uploadPdf(file) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/api/pdf/upload`, {
    method: 'POST',
    body: formData,
  })

  return parseResponse(response)
}

export async function readPdf(documentId) {
  const params = new URLSearchParams({ documentId })
  const response = await fetch(`${API_BASE_URL}/api/pdf/read?${params.toString()}`)
  const data = await parseResponse(response)
  const segmentList = normalizeSegments(data.segmentList)
  const content =
    data.content ?? (segmentList.length ? segmentList.map((segment) => segment.content).join('\n\n') : '')

  return {
    ...data,
    segmentList,
    content,
  }
}

export async function renamePdf(documentId, newFilename) {
  const params = new URLSearchParams({ documentId, newFilename })
  const response = await fetch(`${API_BASE_URL}/api/pdf/update?${params.toString()}`, {
    method: 'PUT',
  })

  return parseResponse(response)
}

export async function deletePdf(fileId) {
  const params = new URLSearchParams({ fileId })
  const response = await fetch(`${API_BASE_URL}/api/pdf/delete?${params.toString()}`, {
    method: 'DELETE',
  })

  return parseResponse(response)
}

export async function listPdfs() {
  const response = await fetch(`${API_BASE_URL}/api/pdf/list`)
  const data = await parseResponse(response)

  const documents = Array.isArray(data.documents)
    ? data.documents
        .map((item) => ({
          id: item?.id != null ? String(item.id) : null,
          filename: item?.filename ?? '',
        }))
        .filter((item) => item.filename)
    : Array.isArray(data.files)
      ? data.files.map((filename) => ({ id: null, filename }))
      : []

  return {
    ...data,
    documents,
  }
}

export async function createBookmark(documentId, position) {
  const params = new URLSearchParams({ documentId })
  const response = await fetch(`${API_BASE_URL}/api/content/createBookmark?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(position),
  })

  return parseResponse(response)
}

export async function renameBookmark(bookmarkId, newTitle) {
  const params = new URLSearchParams({ bookmarkId, newTitle })
  const response = await fetch(`${API_BASE_URL}/api/content/renameBookmark?${params.toString()}`, {
    method: 'POST',
  })

  return parseResponse(response)
}

export async function removeBookmark(bookmarkId) {
  const params = new URLSearchParams({ bookmarkId })
  const response = await fetch(`${API_BASE_URL}/api/content/removeBookmark?${params.toString()}`, {
    method: 'POST',
  })

  return parseResponse(response)
}

export async function listBookmarks(documentId) {
  const params = new URLSearchParams({ documentId })
  const response = await fetch(`${API_BASE_URL}/api/content/bookmarkList?${params.toString()}`)
  const data = await parseResponse(response)

  return {
    bookmarks: normalizeBookmarks(data),
  }
}

export async function createNote(documentId, position, { content, style } = {}) {
  const params = new URLSearchParams({ documentId })
  if (content) {
    params.set('content', content)
  }
  if (style) {
    params.set('style', style)
  }

  const response = await fetch(`${API_BASE_URL}/api/content/createNote?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(position),
  })

  return parseResponse(response)
}

export async function listNotes(documentId) {
  const params = new URLSearchParams({ documentId })
  const response = await fetch(`${API_BASE_URL}/api/content/noteList?${params.toString()}`)
  const data = await parseResponse(response)

  return {
    notes: normalizeNotes(data),
  }
}

export async function updateNote(noteId, { content, style } = {}) {
  const params = new URLSearchParams({ noteId })
  if (content) {
    params.set('content', content)
  }
  if (style) {
    params.set('style', style)
  }

  const response = await fetch(`${API_BASE_URL}/api/content/updateNote?${params.toString()}`, {
    method: 'POST',
  })

  return parseResponse(response)
}

export async function removeNote(noteId) {
  const params = new URLSearchParams({ noteId })
  const response = await fetch(`${API_BASE_URL}/api/content/removeNote?${params.toString()}`, {
    method: 'POST',
  })

  return parseResponse(response)
}
