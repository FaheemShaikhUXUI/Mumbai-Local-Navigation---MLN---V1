# Official Data Ingestion — Mumbai Local Timetable Application

## 1. Official Sources of Truth

The application consumes timetable data exclusively from verified Indian Railways portals:

1. **Western Railway Official Suburban Portal**:
   - URL: `https://wr.indianrailways.gov.in/view_section.jsp?fontColor=black&backgroundColor=LIGHTSTEELBLUE&lang=0&id=0,6,458`
   - Content: Pocket Time Table 79 DN, Pocket Time Table 79 UP, AC EMU SWTT-79, Dahanu Road EMU Services.
   - Authority: Western Railway CMS Team.

2. **Central Railway Official Suburban Portal**:
   - URL: `https://cr.indianrailways.gov.in/view_section.jsp?fontColor=black&backgroundColor=LIGHTSTEELBLUE&lang=0&id=0,5,2360`
   - Content: Main Line Suburban PTT (DN & UP), Harbour Line PTT (DN & UP), Trans-Harbour Line PTT, Port/Uran Line PTT, AC EMU Services.
   - Authority: Central Railway CMS Team.

---

## 2. Ingestion Pipeline & Architecture

Each railway administration has an isolated adapter module:
```
services/data-sources/
  ├── src/
  │   ├── western-railway/
  │   │   ├── source.ts      # HTTP client, header sniffing, link extractor
  │   │   ├── parser.ts      # Service generator / tabular parser
  │   │   ├── normalizer.ts  # Station codes & names normalization
  │   │   └── validator.ts   # Sequence & timing validation
  │   ├── central-railway/
  │   │   ├── source.ts
  │   │   ├── parser.ts
  │   │   ├── normalizer.ts
  │   │   └── validator.ts
  │   └── CanonicalCompiler.ts # Unified merger & deduplication
```

---

## 3. Change Detection Mechanisms

To prevent redundant downloads and heavy server load, the source adapters use three layers of change detection:
1. **HTTP `If-None-Match` (ETag)**: If server returns HTTP 304 Not Modified, sync finishes immediately with `SYNC_NO_CHANGE`.
2. **HTTP `If-Modified-Since` (Last-Modified)**: Verifies publication timestamp header.
3. **Cryptographic SHA-256 Checksum**: If headers are omitted by legacy government servers, the raw page content is hashed and compared with `lastSourceHash`.

---

## 4. Normalization & Interchange Deduplication

Stations that serve multiple lines or zones (such as Dadar `DR`, Kurla `CLA`, Thane `TNA`, Kalyan `KYN`, Panvel `PNVL`) must **never** be duplicated into multiple station rows.
`CanonicalCompiler` enforces:
- A single canonical station ID (e.g. `stn_dr`).
- Merged aliases (e.g. `["Dadar WR", "Dadar CR", "DDR"]`).
- Multiple routes and train stops linking back to the same station primary key.
