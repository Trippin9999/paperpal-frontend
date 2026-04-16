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

export async function readPdf(filename) {
  const params = new URLSearchParams({ filename })
  const response = await fetch(`${API_BASE_URL}/api/pdf/read?${params.toString()}`)
  return parseResponse(response)
}

export async function renamePdf(oldFilename, newFilename) {
  const params = new URLSearchParams({ oldFilename, newFilename })
  const response = await fetch(`${API_BASE_URL}/api/pdf/update?${params.toString()}`, {
    method: 'PUT',
  })

  return parseResponse(response)
}

export async function deletePdf(filename) {
  const params = new URLSearchParams({ filename })
  const response = await fetch(`${API_BASE_URL}/api/pdf/delete?${params.toString()}`, {
    method: 'DELETE',
  })

  return parseResponse(response)
}

export async function listPdfs() {
  const response = await fetch(`${API_BASE_URL}/api/pdf/list`)
  return parseResponse(response)
}
