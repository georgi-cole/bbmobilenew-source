import { Webhook } from 'npm:standardwebhooks@1.0.0'

const sender = { name: 'The Big Eye', email: 'sign-in@auth.kolequant.xyz' }
const quotaErrors = new Set(['daily_quota_exceeded', 'monthly_quota_exceeded', 'email_above_quota'])
const notifications: Record<string, string> = {
  password_changed_notification: 'Your password was changed',
  email_changed_notification: 'Your email address was changed',
  phone_changed_notification: 'Your phone number was changed',
  identity_linked_notification: 'A sign-in method was added',
  identity_unlinked_notification: 'A sign-in method was removed',
  mfa_factor_enrolled_notification: 'A verification method was added',
  mfa_factor_unenrolled_notification: 'A verification method was removed',
}

type AuthEmail = {
  user: { email: string; new_email?: string }
  email_data: {
    email_action_type: string
    token: string
    token_hash: string
    token_new?: string
    token_hash_new?: string
    redirect_to?: string
    old_email?: string
  }
}

type Message = { to: string; subject: string; text: string; html: string }

function requiredSecret(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Missing auth email configuration.')
  return value
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function message(
  to: string,
  subject: string,
  instruction: string,
  detail: string,
  detailHtml: string
) {
  const footer = 'If you did not request this, you can ignore this email.'
  return {
    to,
    subject,
    text: [instruction, detail, footer].filter(Boolean).join('\n\n'),
    html: `<div style="max-width:480px;margin:24px auto;padding:28px;border:1px solid #594825;border-radius:16px;background:#17131e;color:#fff5dc;font-family:Arial,sans-serif;line-height:1.5">
      <p style="color:#eac67e;letter-spacing:3px;font-size:12px;font-weight:bold">THE BIG EYE</p>
      <h1 style="font-size:24px">${escapeHtml(subject)}</h1>
      <p>${escapeHtml(instruction)}</p>
      ${detailHtml}
      <p style="color:#e4d8c2;font-size:14px">${footer}</p>
    </div>`,
  }
}

function codeEmail(to: string, token: string, subject: string, instruction: string) {
  if (!/^\d{6}$/.test(token)) throw new Error('Invalid auth email code.')
  return message(
    to,
    subject,
    instruction,
    token,
    `<p style="padding:12px 16px;border:1px solid #75572d;border-radius:8px;background:#261f25;color:#ffdb8f;font-family:monospace;font-size:30px;font-weight:bold;letter-spacing:6px">${token}</p>`
  )
}

function authMessages({ user, email_data: data }: AuthEmail): Message[] {
  const action = data.email_action_type
  function linkEmail(to: string, hash: string, subject: string, label: string) {
    if (!hash) throw new Error('Missing auth email token hash.')
    const url = new URL('/auth/v1/verify', requiredSecret('SUPABASE_URL'))
    url.searchParams.set('token', hash)
    url.searchParams.set('type', action)
    if (data.redirect_to) url.searchParams.set('redirect_to', data.redirect_to)
    return message(
      to,
      subject,
      label,
      url.href,
      `<p><a style="color:#ffdb8f" href="${escapeHtml(url.href)}">${escapeHtml(label)}</a></p>`
    )
  }

  switch (action) {
    case 'signup':
    case 'magiclink':
      return [
        codeEmail(
          user.email,
          data.token,
          'Your The Big Eye sign-in code',
          action === 'signup'
            ? 'Enter this six-digit code in The Big Eye to verify your email and sign in.'
            : 'Enter this six-digit code in The Big Eye to sign in.'
        ),
      ]
    case 'reauthentication':
      return [
        codeEmail(
          user.email,
          data.token,
          'Confirm your identity',
          'Enter this verification code in The Big Eye.'
        ),
      ]
    case 'recovery':
      return [linkEmail(user.email, data.token_hash, 'Reset your password', 'Reset your password')]
    case 'invite':
      return [
        linkEmail(
          user.email,
          data.token_hash,
          'You are invited to The Big Eye',
          'Accept your invitation'
        ),
      ]
    case 'email_change': {
      const next = linkEmail(
        user.new_email ?? '',
        data.token_hash,
        'Confirm your new email address',
        'Confirm your new email address'
      )
      // Supabase sends the current address hash in token_hash_new when both addresses must confirm.
      return data.token_hash_new
        ? [
            linkEmail(
              user.email,
              data.token_hash_new,
              'Confirm your email change',
              'Confirm your email change'
            ),
            next,
          ]
        : [next]
    }
    default: {
      const subject = Object.hasOwn(notifications, action) ? notifications[action] : undefined
      if (!subject) throw new Error('Unsupported auth email action.')
      const to = action === 'email_changed_notification' ? (data.old_email ?? '') : user.email
      const instruction = `${subject} on your The Big Eye account. If you did not make this change, contact support@kolequant.xyz.`
      return [{ to, subject, text: instruction, html: `<p>${escapeHtml(instruction)}</p>` }]
    }
  }
}

async function brevoIdempotencyKey(key: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  )
  digest[6] = (digest[6] & 0x0f) | 0x80
  digest[8] = (digest[8] & 0x3f) | 0x80
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function deliver({ to, subject, text, html }: Message, key: string) {
  const resend = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredSecret('AUTH_EMAIL_RESEND_KEY')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify({
      from: `${sender.name} <${sender.email}>`,
      to: [to],
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(1900),
  })
  if (resend.ok) return
  const rejection = await resend.json().catch(() => null)
  // A timeout or ambiguous failure could already have accepted the email.
  if (!quotaErrors.has(rejection?.name)) throw new Error('Primary email delivery failed.')

  const brevo = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': requiredSecret('AUTH_EMAIL_BREVO_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: sender.name, email: 'sign-in@backup-auth.kolequant.xyz' },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
      headers: { idempotencyKey: await brevoIdempotencyKey(key) },
    }),
    signal: AbortSignal.timeout(1900),
  })
  if (brevo.ok) return
  const failure = await brevo.json().catch(() => null)
  if (failure?.code === 'duplicate_parameter' && /idempotency/i.test(failure.message)) return
  throw new Error('Backup email delivery failed.')
}

function reject(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reject(405, 'Method not allowed.')
  const secret = Deno.env.get('AUTH_EMAIL_HOOK_SECRET')
  if (!secret) return reject(503, 'Email delivery is temporarily unavailable.')

  let payload: AuthEmail
  try {
    const webhook = new Webhook(secret.replace(/^v1,whsec_/, ''))
    payload = webhook.verify(await request.text(), Object.fromEntries(request.headers)) as AuthEmail
  } catch {
    return reject(401, 'Invalid email hook signature.')
  }

  try {
    const messages = authMessages(payload)
    if (messages.some(({ to }) => !to)) return reject(400, 'Invalid email recipient.')
    const eventId = request.headers.get('webhook-id')
    await Promise.all(
      messages.map((email, index) => deliver(email, `supabase-auth/${eventId}/${index}`))
    )
    return Response.json({})
  } catch {
    return reject(503, 'Email delivery is temporarily unavailable.')
  }
})
