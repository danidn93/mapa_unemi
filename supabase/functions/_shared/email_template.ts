// Plantilla de email institucional Mapa UNEMI (OTP).

const LOGO = "https://www.unemi.edu.ec/wp-content/uploads/2021/09/LOGO-WEB-BLANCO-300x120.png";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function b64utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function buildRawEmail(from: string, to: string, subject: string, html: string): string {
  const encodedSubject = `=?UTF-8?B?${b64utf8(subject)}?=`;
  const headers =
    `From: =?UTF-8?B?${b64utf8("Mapa UNEMI")}?= <${from}>\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${encodedSubject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n`;
  const body = b64utf8(html);
  const raw = headers + body;
  // Gmail API expects base64url-encoded RFC 2822 message
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function renderOtpEmail(opts: { name?: string; code: string; title: string; intro: string }): string {
  const { name = "", code, title, intro } = opts;
  const greeting = name ? `Hola ${escapeHtml(name)}` : "Hola";
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Inter,Arial,sans-serif;color:#0F172A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06)">
        <tr><td style="background:linear-gradient(135deg,#003B7A 0%,#0058B0 100%);padding:32px;text-align:center">
          <img src="${LOGO}" alt="UNEMI" width="180" style="display:block;margin:0 auto 12px"/>
          <h1 style="color:#fff;font-size:20px;margin:0;font-weight:600">Mapa UNEMI</h1>
        </td></tr>
        <tr><td style="background:#FF7A1A;padding:14px;text-align:center">
          <span style="color:#fff;font-weight:700;font-size:15px;letter-spacing:.5px">${escapeHtml(title)}</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="color:#0F172A;font-size:22px;margin:0 0 12px">${greeting}</h2>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px">${escapeHtml(intro)}</p>
          <div style="background:#F1F5F9;border:2px dashed #FF7A1A;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
            <div style="font-size:42px;letter-spacing:12px;font-weight:700;color:#003B7A;font-family:'Courier New',monospace">
              ${escapeHtml(code)}
            </div>
          </div>
          <p style="color:#94A3B8;font-size:13px;text-align:center;margin:0">
            Este código expira en <b>10 minutos</b>. No lo compartas con nadie.
          </p>
        </td></tr>
        <tr><td style="background:#F8FAFC;padding:24px;text-align:center;border-top:1px solid #E2E8F0">
          <p style="color:#94A3B8;font-size:12px;margin:0 0 6px">
            Correo automático del Sistema Mapa UNEMI · Por favor no responda a este mensaje.
          </p>
          <p style="color:#CBD5E1;font-size:11px;margin:6px 0 0">
            © ${new Date().getFullYear()} Universidad Estatal de Milagro
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
