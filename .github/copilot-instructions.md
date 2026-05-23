# Project Guidelines

## Code Style
- TypeScript/React with strict compiler settings and bundler module resolution; keep path aliases consistent with [tsconfig.json](tsconfig.json#L1-L22) and [vite.config.ts](vite.config.ts#L1-L25).
- Client entry renders the app in [client/src/main.tsx](client/src/main.tsx#L1-L4); routing and providers live in [client/src/App.tsx](client/src/App.tsx#L1-L30).
- Tailwind is the styling system; class scanning targets are in [tailwind.config.ts](tailwind.config.ts#L1-L68).

## Architecture
- Full-stack TypeScript: React SPA in client/ and Express server in server/ with shared DB types in [shared/schema.ts](shared/schema.ts#L1-L200).
- Server bootstraps Express, registers routes, and serves Vite in dev vs static assets in prod in [server/index.ts](server/index.ts#L1-L107).
- Production build outputs `dist/index.cjs` (server) and `dist/public` (client) as defined in [script/build.ts](script/build.ts#L1-L63) and [vite.config.ts](vite.config.ts#L1-L25).

## Build and Test
- `npm run dev` (tsx dev server), `npm run build` (Vite + esbuild), `npm run start` (prod server), `npm run check` (tsc), `npm run db:push` (Drizzle) in [package.json](package.json#L1-L15).

## Project Conventions
- Vite runs in middleware mode during development in [server/vite.ts](server/vite.ts#L1-L67) and production uses static assets from `dist/public` via [server/static.ts](server/static.ts#L1-L20).
- Database schema and Zod types are centralized in [shared/schema.ts](shared/schema.ts#L1-L200); Drizzle config requires `DATABASE_URL` in [drizzle.config.ts](drizzle.config.ts#L1-L13).

## Integration Points
- OpenAI integration uses `OPENAI_API_KEY` in [server/ai.ts](server/ai.ts#L1-L70).
- Notion integration uses `NOTION_API_KEY` in [server/notion.ts](server/notion.ts#L1-L75).
- Postgres connection uses `DATABASE_URL` in [server/db.ts](server/db.ts#L1-L9).

## Security
- Treat `OPENAI_API_KEY`, `NOTION_API_KEY`, and `DATABASE_URL` as secrets; never log or hardcode them (see usages in [server/ai.ts](server/ai.ts#L1-L20), [server/notion.ts](server/notion.ts#L1-L10), and [server/db.ts](server/db.ts#L1-L9)).
