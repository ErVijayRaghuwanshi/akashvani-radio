const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

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

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return preflightResponse()
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed.', {
        status: 405,
        headers: CORS_HEADERS,
      })
    }

    if (!env.OPENAI_API_KEY) {
      return new Response('OpenAI API key not configured.', {
        status: 500,
        headers: CORS_HEADERS,
      })
    }

    try {
      const requestBody = await request.json()
      
      const upstreamHeaders = new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      })

      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(requestBody),
      })

      const responseHeaders = withCorsHeaders(upstream.headers)
      
      if (!upstream.ok) {
        const errorText = await upstream.text()
        return new Response(errorText, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: responseHeaders,
        })
      }

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      })
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
  },
}
