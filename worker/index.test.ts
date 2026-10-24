import { describe, expect, it } from "vitest";
import worker, { type WorkerEnvironment } from "./index";

function environment(): WorkerEnvironment {
  return {
    APP_PASSWORD: "correct horse battery staple",
    SESSION_SECRET: "a-long-independent-session-signing-secret",
    ASSETS: { fetch: async () => new Response("private application") },
  };
}

describe("Authentication Worker", () => {
  it("offers an English login page while keeping Hebrew as the default", async () => {
    const env = environment();
    const hebrew = await worker.fetch(new Request("https://example.test/login"), env);
    expect(await hebrew.text()).toContain('<html lang="he" dir="rtl">');
    const english = await worker.fetch(new Request("https://example.test/login?lang=en"), env);
    expect(await english.text()).toContain('<html lang="en" dir="ltr">');
  });

  it("protects assets, creates a secure seven-day session, and logs out", async () => {
    const env = environment();
    const unauthenticated = await worker.fetch(new Request("https://example.test/"), env);
    expect(unauthenticated.status).toBe(302);
    expect(unauthenticated.headers.get("location")).toBe("https://example.test/login");

    const rejected = await worker.fetch(new Request("https://example.test/auth/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://example.test" },
      body: new URLSearchParams({ password: "wrong" }),
    }), env);
    expect(rejected.status).toBe(401);

    const accepted = await worker.fetch(new Request("https://example.test/auth/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://example.test" },
      body: new URLSearchParams({ password: env.APP_PASSWORD }),
    }), env);
    expect(accepted.status).toBe(303);
    const cookie = accepted.headers.get("set-cookie");
    expect(cookie).toContain("appendix_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Max-Age=604800");

    const authenticated = await worker.fetch(new Request("https://example.test/", {
      headers: { cookie: cookie!.split(";")[0] },
    }), env);
    expect(authenticated.status).toBe(200);
    expect(await authenticated.text()).toBe("private application");

    const logout = await worker.fetch(new Request("https://example.test/auth/logout", {
      method: "POST",
      headers: { cookie: cookie!.split(";")[0], origin: "https://example.test" },
    }), env);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
