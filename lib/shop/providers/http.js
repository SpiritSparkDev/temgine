// Minimal fetch wrapper for payment providers.
// Errors never contain headers, body or query string (they may carry keys or personal data).

function describe(method, url) {
  try {
    const u = new URL(url)
    return `${method} ${u.host}${u.pathname}`
  } catch {
    return method
  }
}

// body: plain object -> JSON, string -> sent as is (caller sets Content-Type).
// Returns { status, data } (data = parsed JSON, or null if the body is empty / not JSON).
export async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 10000 } = {}) {
  const init = { method, headers: { ...headers } }
  if (body !== undefined && body !== null) {
    if (typeof body === 'string') {
      init.body = body
    } else {
      init.body = JSON.stringify(body)
      if (!Object.keys(init.headers).some((h) => h.toLowerCase() === 'content-type')) {
        init.headers['Content-Type'] = 'application/json'
      }
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  init.signal = controller.signal

  let res
  try {
    res = await fetch(url, init)
  } catch (e) {
    const timedOut = controller.signal.aborted
    const err = new Error(`${describe(method, url)} ${timedOut ? 'Zeitüberschreitung' : 'Netzwerkfehler'}`)
    err.status = 0
    err.code = timedOut ? 'TIMEOUT' : 'NETWORK'
    throw err
  } finally {
    clearTimeout(timer)
  }

  let data = null
  try {
    const text = await res.text()
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    const err = new Error(`${describe(method, url)} fehlgeschlagen (HTTP ${res.status})`)
    err.status = res.status
    throw err
  }
  return { status: res.status, data }
}
