# Official Data Ingestion — Mumbai Local Timetable Application

## 1. Official Sources of Truth

The application consumes timetable data exclusively from verified Indian Railways official portals:

1. **Western Railway Official Suburban Portal**:
   - URL: `https://wr.indianrailways.gov.in/view_section.jsp?fontColor=black&backgroundColor=LIGHTSTEELBLUE&lang=0&id=0,6,458`
   - Content: Pocket Time Table 79 DN, Pocket Time Table 79 UP, AC EMU SWTT-79, Dahanu Road EMU Services, Harbour Services.
   - Authority: Western Railway CMS Team.

2. **Central Railway Official Suburban Portal**:
   - URL: `https://cr.indianrailways.gov.in/view_section.jsp?fontColor=black&backgroundColor=LIGHTSTEELBLUE&lang=0&id=0,5,2360`
   - Content: Main Line Suburban PTT (DN & UP), Harbour Line PTT (DN & UP), Trans-Harbour Line PTT, Port/Uran Line PTT, AC EMU Services.
   - Authority: Central Railway CMS Team.

3. **Central Railway Pune Suburban Division**:
   - URL: `https://cr.indianrailways.gov.in/view_section.jsp?fontColor=black&backgroundColor=LIGHTSTEELBLUE&lang=0&id=0,5,2361`
   - Content: Lonavala–Pune Suburban PTT (DN & UP).

---

## 2. All 8 Corridors & Ingested Network Coverage

| # | Line Name | Line ID | Official Stations | Trains Loaded | Stop Timings |
|---|:---|:---|:---:|:---:|:---:|
| 1 | **Western Line** | `line_wr_suburban` | 37 stations | 1,182 trains | 21,150 stops |
| 2 | **Central Main Line** | `line_cr_main` | 51 stations | 890 trains | 17,210 stops |
| 3 | **Harbour Line** | `line_cr_harbour` | 35 stations | 553 trains | 8,924 stops |
| 4 | **Trans-Harbour Line** | `line_cr_trans_harbour` | 17 stations | 131 trains | 2,142 stops |
| 5 | **Uran Line (Port Line)** | `line_cr_uran` | 13 stations | 50 trains | 550 stops |
| 6 | **Vasai-Diva-Panvel Line**| `line_cr_vasai_diva_panvel` | 13 stations | 12 trains | 156 stops |
| 7 | **Neral-Matheran Line** | `line_cr_neral_matheran` | 5 stations | 8 trains | 40 stops |
| 8 | **Pune Suburban Line** | `line_cr_pune_suburban` | 22 stations | 24 trains | 820 stops |
| **Total** | **All 8 Corridors** | **8 Lines** | **158 unique stations** | **2,850 trains** | **50,992 stops** |

---

## 3. Storage & Artifacts

All official timetable source PDFs are downloaded and archived under:
- `1- Official Time Tabel Data Storage/`
  - `WR_DN_TRAINS_PTT_79.pdf`
  - `WR_UP_TRAINS_PTT_79.pdf`
  - `WR_DN_AC_TRAINS_PTT_79.pdf`
  - `WR_UP_AC_TRAINS_PTT_79.pdf`
  - `WR_DAHANU_ROAD_SERVICES_PTT.pdf`
  - `WR_HARBOUR_SERVICES_PTT.pdf`
  - `CR_MAIN_DN_PTT.pdf`
  - `CR_MAIN_UP_PTT.pdf`
  - `CR_HARBOUR_DN_PTT.pdf`
  - `CR_HARBOUR_UP_PTT.pdf`
  - `CR_TRANS_HARBOUR_PTT.pdf`
  - `CR_PORT_URAN_LINE_PTT.pdf`
  - `CR_PUNE_LNL_PUNE_PTT.pdf`
  - `CR_PUNE_PUNE_LNL_PTT.pdf`

The parsed and normalized canonical database is published at:
- `storage/google-drive-mock/current/dataset.json`
- `storage/google-drive-mock/current/lines.json`
- `storage/google-drive-mock/current/stations.json`
- `storage/google-drive-mock/current/routes.json`
- `storage/google-drive-mock/current/trains.json`
- `storage/google-drive-mock/current/train-stops.json`
- `storage/google-drive-mock/current/manifest.json`

---

## 4. Normalization & Interchange Deduplication

Stations that serve multiple lines or zones (such as Dadar `DR`, Kurla `CLA`, Thane `TNA`, Kalyan `KYN`, Panvel `PNVL`, Vashi `VSH`, Nerul `NEU`, Belapur `BEPR`, Vasai Road `BSR`, Diva `DIVA`, Andheri `ADH`, Neral `NRL`, Karjat `KJT`) have:
- A single canonical station ID (e.g. `stn_dr`).
- Complete merged aliases (e.g. `["Dadar WR", "Dadar CR", "DDR"]`).
- Multiple routes and train stops linking back to the same station primary key.

