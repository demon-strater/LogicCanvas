# LogicCanvas

LogicCanvas transforms documents into an interactive logic map.

## Open Locally

Prerequisite: Docker Desktop.

From this folder, run:

```powershell
.\open_local_site.ps1
```

The script starts the app and database with Docker Compose, then opens:

```text
http://127.0.0.1:5000
```

AI features require `OPENAI_API_KEY`.

Notion can be connected in two ways:

- User-facing OAuth: create a public Notion connection and set `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET`, and `NOTION_OAUTH_REDIRECT_URI` in `.env`. Users then click "Notion 연결하기" and select pages in Notion without entering an API key.
- Single-workspace fallback: set `NOTION_API_KEY` for an internal connection.

For local Docker, use this redirect URI in the Notion developer portal:

```text
http://127.0.0.1:5000/api/notion/oauth/callback
```

Also set:

```text
PUBLIC_URL=http://127.0.0.1:5000
COOKIE_SECURE=false
```

The app can still open without committing private keys.

## Included Documents

The project report files are included in the repository root as `.md` and `.docx` files, with related source material in:

- `attached_assets/`
