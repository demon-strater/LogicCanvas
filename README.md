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

AI and Notion integrations require real API keys. Create a local `.env` file from `.env.example` and set `OPENAI_API_KEY` and `NOTION_API_KEY` when you need those features. The app can still open without committing private keys.

## Included Documents

The project report files are included in the repository root as `.md` and `.docx` files, with related source material in:

- `attached_assets/`
