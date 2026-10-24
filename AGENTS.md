# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the React/TypeScript application. Keep domain rules in `src/domain/`, file inspection in `src/files/`, browser persistence in `src/persistence/`, and PDF composition in `src/pdf/`; `generation.worker.ts` is the processing boundary. Reusable UI belongs in `src/components/`. `worker/` contains the Cloudflare password gate, `e2e/` holds Playwright workflows, and `public/fonts/` contains the bundled Hebrew fonts. Architectural decisions live in `docs/adr/`; read them before changing processing location, authentication, or workflow boundaries. Keep terminology aligned with `GLOSSARY.md` when modifying domain behavior or labels.

## Build, Test, and Development Commands

Use Node.js 22.18 or newer and install with `npm install`. Run `npm run dev` for Vite at `http://localhost:5173`. `npm test` runs Vitest once; `npm run test:e2e` exercises the complete browser workflow; `npm run build` performs strict TypeScript checks and creates `dist/`. Run `npm run check` before review. `npm run deploy` publishes the built app through the Cloudflare Worker after its secrets are configured.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, semicolons, and double quotes. Name React components, component files, and exported types with `PascalCase`; use `camelCase` for functions and variables and `kebab-case` for other filenames. Keep PDF byte transformations and browser storage behind typed module interfaces. Main-app UI text must use the translation catalog rather than inline language checks. Hebrew is the default: preserve logical text order, explicit `dir`, keyboard access, and mirrored RTL layout.

## Testing Guidelines

Place unit tests beside source as `*.test.ts` or `*.test.tsx`; put user journeys in `e2e/*.spec.ts`. Add regression coverage before changing a seam. PDF tests must cover mixed files, long indexes, numbering, and 0/90/180/270-degree pages. Validate output structure programmatically, then visually render affected pages. Browser tests must check Hebrew RTL, English switching, keyboard-reachable controls, and console errors. Never use confidential documents as fixtures.

## Commits & Pull Requests

Use focused, imperative subjects; the existing history commonly uses `Fix: ...`. Pull requests should describe user-visible behavior, identify the affected seam, link the issue, and list exact verification commands. Include sanitized before/after screenshots for UI changes and rendered sample pages for PDF layout changes. Note any change to authentication, local storage, size limits, or the `.appendix` format.
