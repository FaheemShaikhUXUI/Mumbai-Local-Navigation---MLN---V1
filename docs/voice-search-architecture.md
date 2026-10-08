# Voice Search System — Architecture & Engineering Specification

## 1. Executive Summary & Design Principles

The **Voice Search System** is an offline-capable, multi-lingual voice navigation interface designed for Mumbai suburban railway commuters. It enables commuters to speak naturally in **Hindi**, **Marathi**, or **English** to locate suburban trains instantly without typing station codes or browsing directories.

### Core Visual & Interaction Specifications (As Illustrated in Design):
1. **Normal State**: A floating circular purple action button (`54px × 54px`) anchored at bottom-right (`bottom: 24px, right: 24px`) with ambient neon purple glow (`rgba(138, 43, 226, 0.45)`).
2. **Hold-to-Record (1-Second Threshold)**:
   - When pressed down (`touchstart` / `pointerdown`), a circular SVG progress track animates from `0%` to `100%` over 1000ms.
   - At 1000ms, haptic feedback triggers (`40ms` vibration) and the button smoothly expands horizontally to the left into a **276px capsule pill**.
3. **Animated Voice Visualizer**:
   - Inside the capsule (to the left of the microphone icon), 25 frequency equalizer bars oscillate in organic waveforms (`|||l|i||l|||||l|i||||`) with white-to-light-violet gradients and soft neon illumination.
4. **Release-to-Search**:
   - When the user releases the mic button (`touchend` / `pointerup`), speech processing finalizes.
   - The spoken sentence is passed to the **Multi-Lingual NLP Engine**, which extracts origin and destination stations.
   - The capsule collapses, the `From` and `To` search fields are auto-populated, and the application immediately displays the live train timetable results screen (e.g. Dadar to Borivali).

---

## 2. High-Level Architecture Diagram

```
                 USER VOICE INPUT (Hold Mic Button 1s)
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │             GESTURE & INTERACTION CONTROLLER           │
       │  • 1-Second Press & Hold Lifecycle Timer               │
       │  • SVG Radial Progress Ring Animation (0ms -> 1000ms)  │
       │  • Haptic Tactile Pulse (40ms)                         │
       └────────────────────────────┬───────────────────────────┘
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │                CAPSULE & WAVEFORM UI MORPH             │
       │  • Horizontal Morph: Circle (54px) -> Capsule (276px)  │
       │  • 25-Band Symmetrical Audio Equalizer Soundwave       │
       │  • Web Audio API AnalyserNode / Procedural Physics     │
       │  • Floating Frosted-Glass Live Transcript HUD Bubble   │
       └────────────────────────────┬───────────────────────────┘
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │         AUDIO RECOGNITION (Web Speech API)             │
       │  • SpeechRecognition / webkitSpeechRecognition         │
       │  • Multi-lingual continuous stream: hi-IN, mr-IN, en-IN│
       └────────────────────────────┬───────────────────────────┘
                                    │
                          Spoken Text Transcript
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │        MULTI-LINGUAL NLP ENTITY & INTENT ENGINE        │
       │                                                        │
       │  1. Devanagari Mapping & Script Normalizer             │
       │     ("दादर" -> Dadar, "बोरिवली" -> Borivali)            │
       │                                                        │
       │  2. Suffix Decomposition (Marathi & Hindi)             │
       │     - Origin Markers: -varun, -hun, -pasun, -se        │
       │     - Destination Markers: -la, -paryant, -tak         │
       │                                                        │
       │  3. Grammar & Reversal Pattern Recognition             │
       │     - "From X to Y" / "X se Y" / "X varun Y la"        │
       │     - "Y jana hai X se" / "Y la jaychay X varun"       │
       │     - Single Destination: "Y jana hai" -> From=Current │
       │                                                        │
       │  4. Canonical Station Matcher & Alias Directory        │
       │     - 158 Mumbai Suburban Stations                     │
       │     - Codes (DR, BVI, VR, CCG, KYN, TNA, CSMT, etc.)   │
       │     - Colloquial aliases (VT, Bombay Central, etc.)    │
       └────────────────────────────┬───────────────────────────┘
                                    │
                       Resolved Route Entity
                       { from: 'Dadar', to: 'Borivali', type: 'ALL' }
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │               SEARCH & NAVIGATION ROUTER               │
       │  • Auto-populates 'From' and 'To' Search Input Tiles   │
       │  • Triggers searchTrains(fromId, toId)                 │
       │  • Switches Screen -> screen-train-results             │
       │  • Renders Live Scheduled Trains (e.g. 411 Trains)     │
       └────────────────────────────────────────────────────────┘
```

---

## 3. Multi-Lingual Grammar & NLP Specification

The NLP engine supports natural spoken utterances across **Hindi**, **Marathi**, and **English**:

### A. Hindi / Hinglish Patterns
| User Utterance | Detected Language | Origin | Destination | Notes |
|:---|:---:|:---:|:---:|:---|
| *"Mujhe Dadar se Borivali jana hai"* | Hindi | Dadar | Borivali | User reference example |
| *"दादर से बोरिवली जाना है"* | Hindi | Dadar | Borivali | Devanagari script query |
| *"Dadar se Borivali train"* | Hindi | Dadar | Borivali | Direct inquiry |
| *"Churchgate se Virar fast train"* | Hindi | Churchgate | Virar | Detects `FAST` train filter |
| *"Thane se CSMT kaise jaye"* | Hindi | Thane | CSMT | Colloquial query |
| *"Andheri se Mumbai Central jana hai"* | Hindi | Andheri | Mumbai Central | Multi-word station entity |
| *"Borivali jana hai Dadar se"* | Hindi | Dadar | Borivali | Inverted grammar handling |
| *"Borivali jana hai"* | Hindi | Current (Dadar) | Borivali | Single destination fallback |

### B. Marathi / Marathlish Patterns
| User Utterance | Detected Language | Origin | Destination | Notes |
|:---|:---:|:---:|:---:|:---|
| *"Mala Dadar varun Borivali la jaycha aahe"* | Marathi | Dadar | Borivali | Standard Marathi phrasing |
| *"मला दादरवरून बोरिवलीला जायचं आहे"* | Marathi | Dadar | Borivali | Devanagari script query |
| *"Dadar te Borivali train"* | Marathi | Dadar | Borivali | `te` (to) connective |
| *"Dadarhun Borivali"* | Marathi | Dadar | Borivali | `-hun` suffix form |
| *"Thanyavarun Dadar"* | Marathi | Thane | Dadar | `-varun` suffix + oblique form |
| *"Dadar pasun Borivali paryant gadi"* | Marathi | Dadar | Borivali | `pasun` (from) + `paryant` (till) |
| *"Borivalila jaycha aahe Dadar varun"* | Marathi | Dadar | Borivali | Inverted destination-first phrasing |
| *"Borivalila jaychay"* | Marathi | Current (Dadar) | Borivali | Destination-only suffix query |

### C. English Patterns
| User Utterance | Detected Language | Origin | Destination | Notes |
|:---|:---:|:---:|:---:|:---|
| *"Dadar to Borivali"* | English | Dadar | Borivali | Concise route query |
| *"I want to go from Dadar to Borivali"* | English | Dadar | Borivali | Full conversational English |
| *"Trains from Churchgate to Virar"* | English | Churchgate | Virar | Informational query |
| *"Fast train to Borivali from Dadar"* | English | Dadar | Borivali | Inverted phrasing + `FAST` filter |
| *"Train to Borivali"* | English | Current (Dadar) | Borivali | Destination only |

---

## 4. UI Components & CSS Morphing Specification

### 1. Capsule Pill Expansion
```css
.voice-capsule-bar {
  width: 54px; /* Collapsed: Circular Button */
  height: 54px;
  border-radius: 27px;
  transition: width 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.25);
}

.voice-capsule-bar.recording-active {
  width: 276px; /* Expanded: Capsule Bar */
  background: linear-gradient(90deg, rgba(28, 12, 48, 0.96) 0%, rgba(68, 20, 110, 0.96) 100%);
  border: 1.5px solid rgba(179, 136, 255, 0.55);
  box-shadow: 0 10px 32px rgba(123, 44, 191, 0.65), 0 0 20px rgba(192, 132, 252, 0.4);
}
```

### 2. Audio Waveform Bars
The waveform area features 25 staggered equalizer bars centered around a peak height at the 13th bar:
```css
.wave-bar {
  width: 2.5px;
  border-radius: 3px;
  background: linear-gradient(180deg, #FFFFFF 0%, #D8B4FE 100%);
  box-shadow: 0 0 6px rgba(216, 180, 254, 0.7);
}

.voice-capsule-bar.recording-active .wave-bar {
  animation: voiceWaveOscillate 0.85s infinite ease-in-out alternate;
}
```

---

## 5. Verification & Testing Evidence

- **Automated NLP Test Suite**: `test_nlp.js` ran 24 complex multi-lingual sentences across Hindi, Marathi, and English with **100% pass rate (24/24 passed)**.
- **Interactive Browser Subagent Session**:
  - Live test at `http://localhost:3001/mobile`.
  - Tested 1-second press/hold gesture and Voice HUD popup.
  - Tested Hindi query *"Mujhe Dadar se Borivali jana hai"* -> Correctly resolved **Dadar ➔ Borivali** and transitioned to 411 train timetable results.
  - Tested Marathi query *"Mala Dadar varun Borivali la jaycha aahe"* -> Correctly resolved **Dadar ➔ Borivali** and loaded train timetable results.
