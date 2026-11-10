import { timingSafeEqual } from 'node:crypto'

const encoder = new TextEncoder()
const reportUrl = 'https://api.brevo.com/v3/smtp/statistics/aggregatedReport?days=1'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })

  const token = Deno.env.get('AUTH_EMAIL_BREVO_CHECK_TOKEN')
  if (!token) return new Response(null, { status: 503 })

  const received = encoder.encode(request.headers.get('Authorization') ?? '')
  const expected = encoder.encode(`Bearer ${token}`)
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    return new Response(null, { status: 401 })

  const key = Deno.env.get('AUTH_EMAIL_BREVO_KEY')
  if (!key) return new Response(null, { status: 503 })

  try {
    const report = await fetch(reportUrl, {
      headers: { 'api-key': key },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    })
    if (!report.ok) console.error('Brevo backup key check returned HTTP', report.status)
    await report.body?.cancel()
    return new Response(null, { status: report.ok ? 204 : 502 })
  } catch {
    console.error('Brevo backup key check could not reach Brevo.')
    return new Response(null, { status: 502 })
  }
})
