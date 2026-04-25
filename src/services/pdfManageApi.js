const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

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
  return parseResponse(response)
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
          id: item?.id ?? null,
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
