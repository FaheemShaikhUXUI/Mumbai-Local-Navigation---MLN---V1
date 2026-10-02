# Deployment Guide — GitHub, Vercel, & Google Drive

## 1. Cloud-Only Architecture (No Dependency on Personal Computer)

As specified in Section 53, the production system **must not require any personal computer to remain powered on**. All scheduled tasks, source checking, and updates execute autonomously on cloud infrastructure.

```
                  GITHUB REPOSITORY (Code & CI/CD)
                                │
                                ▼
                       VERCEL PRODUCTION
            ├── Serverless API Routes (/api/*)
            ├── Vercel Cron (Every 6h scheduled sync)
            └── Web Admin Dashboard
                                │
                                ▼
                     GOOGLE DRIVE REPOSITORY
            ├── Current Dataset & Manifest
            ├── Incremental Patch Packages
            └── Versioned Backups
                                │
                                ▼
                      ANDROID USER DEVICES
```

---

## 2. GitHub Configuration & Security

1. **Repository Setup**:
   - Push code to a private or public GitHub repository.
   - Branch protection on `main` requiring passing tests before merge.
2. **Security & Secrets**:
   - Ensure `.gitignore` is active. Never commit `.env`, `credentials.json`, or private keys.
   - Store deployment credentials in GitHub Repository Secrets:
     - `VERCEL_TOKEN`
     - `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`
     - `GOOGLE_DRIVE_PRIVATE_KEY`
     - `GOOGLE_DRIVE_REPOSITORY_ID`
     - `ADMIN_AUTH_SECRET`

---

## 3. Vercel Deployment

The project includes pre-configured `vercel.json` with cron jobs and serverless functions:

```bash
# Deploy with global vercel CLI
vercel --prod
```

Configure Environment Variables in the Vercel Project Settings:
- `SYNC_INTERVAL_HOURS=6`
- `STORAGE_PROVIDER=google_drive`
- `GOOGLE_DRIVE_REPOSITORY_ID=<your-drive-folder-id>`
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=<your-service-account>`
- `GOOGLE_DRIVE_PRIVATE_KEY=<your-pem-private-key>`
- `ADMIN_AUTH_SECRET=<secure-random-32-byte-hex>`

---

## 4. Google Drive Repository Setup

1. Create a dedicated folder in Google Drive (e.g. `MumbaiLocalTimetable`).
2. Share the folder with the Google Service Account email with `Editor` permissions.
3. Copy the Folder ID from the URL (`https://drive.google.com/drive/folders/<FOLDER_ID>`).
4. Set `GOOGLE_DRIVE_REPOSITORY_ID=<FOLDER_ID>`.
5. On the first sync run, the backend automatically scaffolds:
   - `current/`
   - `updates/`
   - `backups/`
   - `source/`
   - `logs/`
