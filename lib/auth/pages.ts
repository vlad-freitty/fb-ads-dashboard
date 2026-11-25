// Sign-in page shown before Microsoft (same pattern as the GBP dashboard and the CS Wiki).
// Also used for sign-in errors and sign-out.

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function landing({ status = 200, title = 'Вхід у дашборд', note = '', tone = '', ret = '/', button = true, headers = {} }:
  { status?: number; title?: string; note?: string; tone?: 'ok' | ''; ret?: string; button?: boolean; headers?: Record<string, string> } = {}) {
  const href = '/api/auth/login' + (ret && ret !== '/' ? '?r=' + encodeURIComponent(ret) : '');
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Freight Box Hub Ads</title>
<style>
:root{--bg:#f4f6f9;--surface:#fff;--fg:#141a23;--muted:#5a6474;--line:#e2e6ec;--accent:#2e58d1;--accent-fg:#fff;
  --warn:#8a5a00;--warn-soft:#fff4d6;--ok:#18794a;--ok-soft:#e3f4ea;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,"Helvetica Neue",Arial,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--surface:#151a22;--fg:#e6e9ef;--muted:#97a0af;--line:#262d38;--accent:#7d9bff;--accent-fg:#0d1117;
  --warn:#f0b34a;--warn-soft:rgba(240,165,64,.15);--ok:#4cc38a;--ok-soft:rgba(76,195,138,.15);color-scheme:dark}}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--fg);font-family:var(--font)}
body{display:grid;place-items:center;min-height:100vh;padding:24px 16px}
.card{width:100%;max-width:420px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:30px 28px 26px;box-shadow:0 18px 48px rgba(10,20,40,.08)}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.mk{width:42px;height:42px;border-radius:10px;background:var(--accent);color:var(--accent-fg);display:grid;place-items:center;font-weight:700;font-size:15px}
.brand b{display:block;font-size:18px;font-weight:600}
.brand span{color:var(--muted);font-size:14px}
h1{font-size:22px;font-weight:600;margin:0 0 8px;text-wrap:balance}
p{color:var(--muted);line-height:1.55;margin:0 0 20px;font-size:15px}
.note{border-radius:8px;padding:10px 12px;margin:0 0 18px;font-size:14px;line-height:1.5;background:var(--warn-soft);color:var(--warn);overflow-wrap:anywhere}
.note.ok{background:var(--ok-soft);color:var(--ok)}
.note code{font-size:13px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:12px 16px;border-radius:9px;background:var(--accent);color:var(--accent-fg);text-decoration:none;font-weight:600;font-size:15.5px}
.btn:hover{filter:brightness(1.06)}
.btn:focus-visible{outline:3px solid var(--fg);outline-offset:2px}
.ms{display:grid;grid-template-columns:8px 8px;gap:2px}
.ms i{width:8px;height:8px;display:block}
.foot{margin-top:18px;font-size:12.5px;color:var(--muted);line-height:1.5}
</style></head><body>
<main class="card">
  <div class="brand"><div class="mk">FA</div><div><b>Freight Box Hub Ads</b><span>Ліди з Facebook Ads</span></div></div>
  <h1>${esc(title)}</h1>
  ${note ? `<div class="note ${tone === 'ok' ? 'ok' : ''}" role="status">${note}</div>` : ''}
  ${button ? `<p>Витрати, ліди і ціна ліда по клієнтах Greenline і Freitty.</p>
  <a class="btn" href="${esc(href)}"><span class="ms" aria-hidden="true"><i style="background:#f25022"></i><i style="background:#7fba00"></i><i style="background:#00a4ef"></i><i style="background:#ffb900"></i></span>Увійти через Microsoft</a>
  <div class="foot">Лише для працівників компанії, робочим акаунтом Microsoft 365. Якщо доступу немає, зверніться до власника дашборда.</div>` : ''}
</main></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...headers },
  });
}

export function notConfigured(missing: string[]) {
  return landing({
    status: 500, title: 'Вхід ще не налаштовано', button: false,
    note: `У Vercel (Settings → Environment Variables) немає: <code>${missing.map(esc).join(', ')}</code>. Додайте їх і зробіть Redeploy.`,
  });
}
