export async function sendEmail(env: Env, to: string, subject: string, html: string, text?: string) {
  if (!env.RESEND_API_KEY) {
    console.log(`[email] (RESEND_API_KEY not set) to=${to} subject=${subject}\n${text ?? html}`);
    return { ok: false, skipped: true as const, detail: "RESEND_API_KEY is not set on the Worker." };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? "Crosscourt Social <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[email] failed", res.status, body);
    let message = body;
    try {
      message = (JSON.parse(body) as { message?: string }).message ?? body;
    } catch {}
    return { ok: false, skipped: false as const, detail: `Resend responded ${res.status}: ${message}` };
  }
  return { ok: true, skipped: false as const, detail: `Sent from ${env.EMAIL_FROM ?? "onboarding@resend.dev"}` };
}

export function loginCodeEmail(code: string, appName: string) {
  const html = `
  <div style="font-family:Inter,Segoe UI,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0E1020;background:#F5F1EA">
    <p style="letter-spacing:.22em;text-transform:uppercase;font-size:12px;margin:0 0 24px">${appName}</p>
    <h1 style="font-size:24px;margin:0 0 12px">Your sign-in code</h1>
    <p style="margin:0 0 20px;color:#45475C">Enter this code in the app. It expires in 10 minutes.</p>
    <p style="font-size:36px;letter-spacing:.3em;font-weight:700;margin:0 0 24px">${code}</p>
    <p style="font-size:13px;color:#6E7082">If you didn't request this, you can ignore this email.</p>
  </div>`;
  return { html, text: `Your ${appName} sign-in code is ${code}. It expires in 10 minutes.` };
}
