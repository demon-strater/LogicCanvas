# LogicCanvas Data Backups

`current_site_archive_20260711.sql` is the saved state for the current site:

- 41 reports
- 5 groups
- Group hierarchy: `봉산마을 로컬 DX 프로젝트` > monthly work groups

Restore on another machine:

```powershell
.\backups\restore_current_site_archive.ps1
```

This script clears report/group related tables, restores the archive, and restarts Docker Compose.
