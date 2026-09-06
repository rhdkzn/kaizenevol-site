# Supabase auth emails — the client-portal sign-in mail (2026-09-06)

Supabase only lets the email templates be edited once **custom SMTP** is on
(Dashboard → Authentication → Emails → SMTP Settings). Until then the sign-in
mail is Supabase's default ("Your sign-in link", from noreply@mail.app.supabase.io)
and the built-in sender is rate-limited to a handful of emails an hour, which
is not enough for real clients. Law cannot enter the API key into the dashboard
(secrets stay with Rahaid), so this is a two-minute job for Rahaid; the values
and the templates are below, ready to paste.

## SMTP Settings (Resend)

| Field | Value |
|---|---|
| Enable custom SMTP | on |
| Sender email | noreply@mail.kaizenevol.com |
| Sender name | KaizenEvol |
| Host | smtp.resend.com |
| Port | 465 |
| Username | resend |
| Password | a Resend API key (the one on Vercel as RESEND_API_KEY works, or make a new "Sending access" key in Resend just for Supabase) |

Then Rate Limits → "Rate limit for sending emails" can be raised (default 30/h).

## Templates → "Magic link or OTP"

**Subject:** `Your sign-in link for your KaizenEvol client space`

**Body:**

```html
<div style="font-family:Manrope,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#23211E;background:#F7F6F4">
  <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A857C;margin:0 0 20px">KaizenEvol · Client portal</p>
  <h1 style="font-size:24px;font-weight:600;line-height:1.2;margin:0 0 16px">Your sign-in link.</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 24px">Open this on the device you want to use. It works once and expires in an hour.</p>
  <p style="margin:0 0 28px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#23211E;color:#F7F6F4;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px">Open my client space</a></p>
  <p style="font-size:13px;line-height:1.6;color:#6E6A63;margin:0 0 8px">If the button does not work, copy this into your browser:<br><span style="word-break:break-all">{{ .ConfirmationURL }}</span></p>
  <p style="font-size:13px;line-height:1.6;color:#6E6A63;margin:24px 0 0">Did not ask for this? Ignore it, nothing happens without the link. Questions: reply to this email or write to rahaid@kaizenevol.com.</p>
  <p style="font-size:12px;color:#8A857C;margin:32px 0 0;border-top:1px solid #D8D4CC;padding-top:16px">KaizenEvol · kaizenevol.com</p>
</div>
```

## Templates → "Invite user" (not used by the portal — the CRM sends its own invite through Resend — but rebrand it so nothing default-looking can ever go out)

**Subject:** `You have been invited to your KaizenEvol client space`

**Body:** same as above with the heading `Your client space is ready.` and the button text `Set up my sign-in`.

## Templates → "Confirm sign up" (the portal uses shouldCreateUser, so a first-time email may get this instead of the magic link if "Confirm email" is on)

**Subject:** `Confirm your email for your KaizenEvol client space`

**Body:** same as above with the heading `One tap to confirm it is you.` and the button text `Confirm and open my space`.

## What Law already set (2026-09-06, via Rahaid's dashboard session)

- Site URL: `https://kaizenevol.com` (was `http://localhost:3000`)
- Redirect URLs: `https://kaizenevol.com/portal`

The `{{ .ConfirmationURL }}` variable is Supabase's; keep it exactly.
