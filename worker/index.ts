export interface WorkerEnvironment {
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const COOKIE_NAME = "appendix_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return mismatch === 0;
}

async function passwordMatches(candidate: string, expected: string): Promise<boolean> {
  const [candidateHash, expectedHash] = await Promise.all([digest(candidate), digest(expected)]);
  return equalBytes(candidateHash, expectedHash);
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

async function createSession(secret: string, now = Date.now()): Promise<string> {
  const expires = String(Math.floor(now / 1000) + SESSION_SECONDS);
  return `${expires}.${await sign(expires, secret)}`;
}

async function validSession(request: Request, secret: string, now = Date.now()): Promise<boolean> {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1);
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) <= Math.floor(now / 1000)) return false;
  const expected = await sign(expires, secret);
  return equalBytes(encoder.encode(signature), encoder.encode(expected));
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === new URL(request.url).origin) return true;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

function redirect(request: Request, path: string, status = 302, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("location", new URL(path, request.url).toString());
  return new Response(null, { status, headers: responseHeaders });
}

function loginPage(error = false, language: "he" | "en" = "he"): Response {
  const english = language === "en";
  const content = english ? {
    title: "Private access",
    body: "Enter the shared password to open the Appendix Compilation workspace.",
    password: "Password",
    submit: "Secure login",
    error: "The password is incorrect. Try again.",
    privacy: "Documents are processed in the browser and are not sent to the server.",
    switchLabel: "עברית",
    switchUrl: "/login",
  } : {
    title: "גישה פרטית",
    body: "הזינו את הסיסמה המשותפת כדי להיכנס לסביבת עריכת תיקי הנספחים.",
    password: "סיסמה",
    submit: "כניסה מאובטחת",
    error: "הסיסמה שגויה. נסו שוב.",
    privacy: "המסמכים מעובדים בדפדפן ואינם נשלחים לשרת.",
    switchLabel: "English",
    switchUrl: "/login?lang=en",
  };
  const errorMarkup = error ? `<p class="error" role="alert">${content.error}</p>` : "";
  const langQuery = english ? "?lang=en" : "";
  const html = `<!doctype html><html lang="${language}" dir="${english ? "ltr" : "rtl"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${content.title} · Appendix Merger</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f3f1eb;color:#182331;font-family:Arial,sans-serif}.card{width:min(410px,100%);padding:38px;background:#fffefa;border:1px solid #dcd8ce;border-top:4px solid #ad7c33;border-radius:10px;box-shadow:0 18px 55px #17283b1c}.language{float:inline-end;color:#394f66;font-size:12px}.mark{width:48px;height:48px;display:grid;place-items:center;margin-bottom:24px;border-radius:8px;background:#17283b;color:white;font:700 21px Georgia}h1{margin:0 0 8px;font:700 29px Georgia,serif;color:#17283b}p{margin:0 0 24px;color:#69747e;line-height:1.6;font-size:14px}label{display:block;margin-bottom:7px;font-size:12px;font-weight:700}input{width:100%;height:45px;padding:10px 12px;border:1px solid #cbc8c0;border-radius:6px;font-size:16px;direction:ltr}input:focus{outline:2px solid #ad7c3355;border-color:#ad7c33}button{width:100%;height:46px;margin-top:15px;border:0;border-radius:6px;background:#17283b;color:white;font-weight:700;cursor:pointer}.error{margin:13px 0 0;padding:9px 11px;border-radius:5px;background:#f6e8e5;color:#8b4037;font-size:12px}.privacy{display:flex;gap:7px;align-items:center;margin:22px 0 0;padding-top:18px;border-top:1px solid #e8e5de;color:#60736c;font-size:11px}
  </style></head><body><main class="card"><a class="language" href="${content.switchUrl}">${content.switchLabel}</a><div class="mark">AM</div><h1>${content.title}</h1><p>${content.body}</p><form method="post" action="/auth/login${langQuery}"><label for="password">${content.password}</label><input id="password" name="password" type="password" required autofocus autocomplete="current-password"><button type="submit">${content.submit}</button>${errorMarkup}</form><div class="privacy">${content.privacy}</div></main></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
  });
}

function secureAssetResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "same-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    const url = new URL(request.url);
    const loginLanguage = url.searchParams.get("lang") === "en" ? "en" : "he";
    const authenticated = await validSession(request, env.SESSION_SECRET);

    if (url.pathname === "/login" && request.method === "GET") {
      return authenticated ? redirect(request, "/") : loginPage(false, loginLanguage);
    }
    if (url.pathname === "/auth/login" && request.method === "POST") {
      if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
      const form = await request.formData();
      const candidate = String(form.get("password") ?? "");
      if (!(await passwordMatches(candidate, env.APP_PASSWORD))) {
        const page = loginPage(true, loginLanguage);
        return new Response(await page.text(), { status: 401, headers: page.headers });
      }
      const token = await createSession(env.SESSION_SECRET);
      return redirect(request, "/", 303, {
        "set-cookie": `${COOKIE_NAME}=${token}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`,
        "cache-control": "no-store",
      });
    }
    if (url.pathname === "/auth/logout" && request.method === "POST") {
      if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
      return redirect(request, "/login", 303, {
        "set-cookie": `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`,
        "cache-control": "no-store",
      });
    }
    if (!authenticated) return redirect(request, "/login");
    return secureAssetResponse(await env.ASSETS.fetch(request));
  },
};
