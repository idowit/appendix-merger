# Appendix Merger

A Hebrew-first desktop web application for compiling legal appendices. It combines a main document with ordered PDF, JPG, and PNG appendices; can add a page-accurate table of contents, plain covers, appendix markers, and continuous page numbers from page one; and keeps every source file inside the browser.

The application also includes a lightweight **Quick Merge** workflow for joining files without appendix formatting. Drafts are stored locally, and a portable Appendix Compilation File (`.appendix`) can be exported for transfer.

## Local development

Requires Node.js 22.18 or newer.

```powershell
npm install
npm run dev
```

Vite serves the application at `http://localhost:5173`. Useful checks:

```powershell
npm test          # unit and component tests
npm run test:e2e # Chromium workflow and RTL checks
npm run build    # strict TypeScript check and production bundle
```

PDF generation runs in `src/pdf/generation.worker.ts`; changing it should not make the interface unresponsive. Generated PDFs and uploaded client documents must remain outside version control.

## Private deployment on Cloudflare

The production build is served by a Cloudflare Worker. The Worker authenticates every page and asset with one shared password and a signed, seven-day secure cookie. Uploaded documents are never sent to the Worker.

1. Create a free Cloudflare account and authenticate the CLI with `npx wrangler login`.
2. Set the shared password with `npx wrangler secret put APP_PASSWORD`.
3. Set a separate high-entropy signing value with `npx wrangler secret put SESSION_SECRET`.
4. Run `npm run deploy`.

Rotate either secret with the same `wrangler secret put` command. `wrangler.jsonc` contains the remaining deployment configuration; no payment credentials or cloud document storage are required.

## Privacy and compatibility

Processing, draft storage, previews, and `.appendix` archives stay on the local computer. The supported target is current desktop browsers on Windows and macOS. The total size limit for one workspace is 250 MB.
