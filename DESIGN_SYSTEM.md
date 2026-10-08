# 🎨 Mumbai Local Navigation — Design System & Frontend Architecture

This document describes the upgraded modular architecture that makes styling, strokes, colors, and layout components effortless to edit without touching any database logic or backend algorithms.

---

## 🏛️ Architecture Overview

The system is separated into three independent layers:

```
┌────────────────────────────────────────────────────────┐
│  1. BACKEND & DATA ENGINE (Isolated & Untouched)       │
│  - packages/database (SQLite & In-Memory Stores)       │
│  - packages/search   (TrainSearchEngine, LineExplorer) │
│  - services/sync-engine (Timetable Sync & Rollback)    │
└────────────────────────────────────────────────────────┘
                            │ (JSON APIs: /api/stations, /api/trains)
                            ▼
┌────────────────────────────────────────────────────────┐
│  2. DESIGN TOKENS REGISTRY (Single Source of Truth)    │
│  - apps/web-admin/public/css/tokens.css                │
│    All colors, strokes, radii, shadows, and themes     │
└────────────────────────────────────────────────────────┘
                            │ (CSS Variables)
                            ▼
┌────────────────────────────────────────────────────────┐
│  3. MODULAR COMPONENTS (Self-Contained Lego Bricks)    │
│  - css/components/search-box.css (From/To Tabs & Pill) │
│  - apps/web-admin/public/mobile.html                   │
│  - apps/web-admin/public/mobile.js                     │
└────────────────────────────────────────────────────────┘
```

---

## ⚡ How to Edit UI Elements in 5 Seconds

### 1. Changing Any Stroke or Color (Theme Tokens)
Open [`apps/web-admin/public/css/tokens.css`](file:///g:/My%20Drive/6%20-%20Antigravity%20All%20Projects/4%20-%20Mumbai%20Local%20Navigation%20Application/apps/web-admin/public/css/tokens.css):

* **Want to change the unactive tab stroke?**
  ```css
  --search-tab-stroke-unactive: #444452; /* Change this hex code */
  ```
* **Want to change the active tab stroke or glow?**
  ```css
  --search-tab-stroke-active: #C084FC;
  --search-tab-glow-active: 0 0 14px rgba(168, 85, 247, 0.25);
  ```
* **Want to change tab height or corner roundness?**
  ```css
  --search-box-radius: 18px;
  --search-box-height: 50px;
  ```

---

## 🧩 Component Directory Map

All frontend assets live under [`apps/web-admin/public/`](file:///g:/My%20Drive/6%20-%20Antigravity%20All%20Projects/4%20-%20Mumbai%20Local%20Navigation%20Application/apps/web-admin/public):

| File | Purpose | What to edit here |
| :--- | :--- | :--- |
| [`css/tokens.css`](file:///g:/My%20Drive/6%20-%20Antigravity%20All%20Projects/4%20-%20Mumbai%20Local%20Navigation%20Application/apps/web-admin/public/css/tokens.css) | Central Design Token Registry | Colors, strokes, radii, shadows, typography, night/day values |
| [`css/components/search-box.css`](file:///g:/My%20Drive/6%20-%20Antigravity%20All%20Projects/4%20-%20Mumbai%20Local%20Navigation%20Application/apps/web-admin/public/css/components/search-box.css) | Journey Search Box Component | From/To rows, dividers, locate pill, cancel icons, junction drawer |
| [`mobile.css`](file:///g:/My%20Drive/6%20-%20Antigravity%20All%20Projects/4%20-%20Mumbai%20Local%20Navigation%20Application/apps/web-admin/public/mobile.css) | Base Layout Shell | Phone frame container, global typography resets, animations |
| [`mobile.html`](file:///g:/My%20Drive/6%20-%20Antigravity%20All%20Projects/4%20-%20Mumbai%20Local%20Navigation%20Application/apps/web-admin/public/mobile.html) | HTML Structure | Clean semantic tags with component classes |
| [`mobile.js`](file:///g:/My%20Drive/6%20-%20Antigravity%20All%20Projects/4%20-%20Mumbai%20Local%20Navigation%20Application/apps/web-admin/public/mobile.js) | Client Logic | State management (`setActiveSearchTile`, timetable renderers) |

---

## 🔄 Asset Synchronization Workflow

[`apps/web-admin/public/`](file:///g:/My%20Drive/6%20-%20Antigravity%20All%20Projects/4%20-%20Mumbai%20Local%20Navigation%20Application/apps/web-admin/public) is the **single source of truth** during development.

Whenever you want to mirror your local edits into the root build folder (`public/`):
```bash
npm run sync:assets
```
*(This is also executed automatically whenever `npm run build` runs).*
