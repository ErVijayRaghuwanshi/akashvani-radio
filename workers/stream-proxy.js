const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Range,Icy-MetaData',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,Content-Type,icy-metaint,icy-name,icy-br',
}

const AUDIO_CONTENT_TYPE_PATTERN =
  /audio\/|application\/vnd\.apple\.mpegurl|application\/x-mpegurl|application\/octet-stream/i

function withCorsHeaders(headers) {
  const next = new Headers(headers)
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    next.set(key, value)
  })
  return next
}

function preflightResponse() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

function validateTarget(target) {
  if (!target) {
    return 'Missing url query param.'
  }

  try {
    const parsed = new URL(target)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'Only http/https stream URLs are allowed.'
    }
  } catch {
    return 'Invalid stream URL.'
  }

  return ''
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return preflightResponse()
    }

    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed.', {
        status: 405,
        headers: CORS_HEADERS,
      })
    }

    const url = new URL(request.url)
    const target = url.searchParams.get('url')
    const validationError = validateTarget(target)
    if (validationError) {
      return new Response(validationError, {
        status: 400,
        headers: CORS_HEADERS,
      })
    }

    const upstreamHeaders = new Headers()
    const range = request.headers.get('Range')
    const icyMetaData = request.headers.get('Icy-MetaData')

    if (range) upstreamHeaders.set('Range', range)
    if (icyMetaData) upstreamHeaders.set('Icy-MetaData', icyMetaData)

    const upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow',
    })

    const contentType = upstream.headers.get('content-type') || ''
    if (contentType && !AUDIO_CONTENT_TYPE_PATTERN.test(contentType)) {
      return new Response(`Rejected non-audio content type: ${contentType}`, {
        status: 415,
        headers: CORS_HEADERS,
      })
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: withCorsHeaders(upstream.headers),
    })
  },
}
