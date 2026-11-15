<div align="center">
  <img src="app/Assets/marca/urdume-icone.svg" width="84" alt="Urdume Público app icon" />
  <h1>Urdume Público</h1>
  <p><strong>Your day, on your device.</strong><br />
  Tasks, projects, habits and calendar with an AI assistant that runs on your own API key.</p>

  <p>
    <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&amp;logoColor=white" />
    <img alt="TypeScript 5.8" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&amp;logoColor=white" />
    <img alt="Platform: Android and web" src="https://img.shields.io/badge/platform-Android%20%C2%B7%20web-3DDC84?logo=android&amp;logoColor=white" />
    <img alt="Tests: 571 passing" src="https://img.shields.io/badge/tests-571%20passing-2EA043" />
    <img alt="Status: beta" src="https://img.shields.io/badge/status-beta-D96C47" />
    <img alt="License: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-6E7681" />
  </p>

  <sub><strong>English</strong> · <a href="README.pt-BR.md">Português</a></sub>
</div>

> [!NOTE]
> The app interface and the in-depth documentation are written in Portuguese (pt-BR).
> This page describes the project in English; the code and the architecture are
> language-neutral.

> [!WARNING]
> **Beta.** The app works and has 571 automated tests, but it has not seen
> prolonged use on many devices. Expect defects. Read
> [known limits](docs/LIMITES.md) (Portuguese) before entrusting it with your
> data, and export a backup from time to time.

---

## Why this exists

Many productivity apps ask for an account, keep your data on a server you cannot
see, and add an AI assistant that bills you through a proxy. Urdume Público takes
the opposite route:

- **Local-first.** The database is IndexedDB inside the app. No account, no
  login, no cloud, no author server.
- **Your key, your bill.** There is no embedded API key and no proxy. Requests
  go from your device straight to the provider you choose.
- **Android and web.** The same React app ships as an APK through Capacitor and
  runs as a PWA in the browser.
- **Small and legible.** React 19, TypeScript, Vite and Dexie. No UI framework,
  no analytics SDK, no telemetry.

## Screenshots

<table>
  <tr>
    <td align="center"><img src="docs/img/02-hoje.png" width="200" alt="Today screen" /><br /><sub>Today</sub></td>
    <td align="center"><img src="docs/img/03-tarefas.png" width="200" alt="Tasks screen" /><br /><sub>Tasks</sub></td>
    <td align="center"><img src="docs/img/04-projetos.png" width="200" alt="Projects screen" /><br /><sub>Projects</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/img/05-agenda.png" width="200" alt="Calendar screen" /><br /><sub>Calendar</sub></td>
    <td align="center"><img src="docs/img/06-habitos.png" width="200" alt="Habits screen" /><br /><sub>Habits</sub></td>
    <td align="center"><img src="docs/img/07-ajustes.png" width="200" alt="Settings screen" /><br /><sub>Settings</sub></td>
  </tr>
</table>

<sub>Screenshots from the web build at phone size, in Portuguese, with sample data.</sub>

## What it does

| Area | What you get |
|---|---|
| **Tasks** | Scheduled day, separate deadline, time, duration, priority, tags and subtasks. "I will do this on Thursday" and "I must deliver this on Friday" are different fields, not free text. Every item is a task, a reminder (no deadline pressure) or an idea (someday). |
| **Projects** | Free-form category, its own priority (separate from manual order), deadline, milestones, dated notes and configurable blocks. Five sorting criteria. |
| **Habits** | Weekday schedule, numeric goal, streak, heatmap and a 30-day consistency figure. |
| **Calendar** | Month view, selectable day, and timed or repeating events. |
| **Reminders** | Local notifications at the set time, even with the app closed. |
| **Search** | Across tasks, subtasks, projects, events and reminders, ignoring accents and case. |
| **Trash** | Everything deleted, in one place: restore or delete for good, with confirmation. Normal deletion is soft and reversible. |
| **Jarvis** | Reads your day, points out what is stuck and **proposes** actions: create a task, check a habit, add a note to a project. Nothing runs without confirmation, and every action can be undone. |
| **Data** | Local IndexedDB database, JSON backup export and import, no account. |

### The assistant

Jarvis is not a chat window bolted onto a to-do list. It reads the actual state
of your day — tasks, deadlines, projects, habits — and turns it into a short
briefing with suggested actions. Each proposal is a structured object that you
accept or reject; the model never writes to the database directly.

There are silent, manual and paused modes, plus a local monthly spending cap
based on a price table in the code. The cap is a local guard, not a guarantee
about your provider invoice.

On screen, Jarvis is a floating island at the top that appears only when it has
something to say. Conversations are kept per session, with a summary of older
turns.

<p align="center">
  <img src="docs/img/09-jarvis-conversa.png" width="200" alt="Jarvis conversation screen with example tasks" />
  <img src="docs/img/10-jarvis-ajustes.png" width="200" alt="Jarvis settings: provider, key hint and monthly cap" />
  <br />
  <sub>The real screens: conversation, and Settings → Jarvis and AI (provider,
  key hint and monthly cap). Sample data — no live provider call in this
  capture.</sub>
</p>

<p align="center">
  <img src="docs/img/08-projeto.png" width="260" alt="Project detail: progress, milestones, tasks and dated notes" />
  <br />
  <sub>Project detail: progress, milestones, tasks and dated notes.</sub>
</p>

## What it does not do

Stated up front so nobody expects the wrong thing:

| Not included | Why |
|---|---|
| Account, login, cloud | The database is local. There is no server. |
| Sync between devices | Not part of this public variant; each device is independent. |
| Drawing board | Removed for licensing: tldraw has its own terms. |
| Graph memory, automatic thoughts, profile, insights | Exclusive to the main version. Here the assistant reads the day and proposes actions; it does not accumulate a graph of facts about you. |
| AI without your key | No embedded key and no proxy; you pay your provider directly. |
| iOS version | Android and the browser only. |
| Home-screen widget | Not implemented. |
| Automatic backup | Android backup is disabled on purpose, so only the export you make exists. |
| Encryption at rest | None; the API key is stored in plaintext. Device lock is the real protection. |
| Reliable AI in the browser | Providers often block cross-origin calls (CORS). Use the APK. |
| A desktop layout | Designed for phones; on a desktop it shows a narrow column. |
| A screen-reader audit | Labels and focus exist, but TalkBack has not been audited. |

The full list, including notification delays and migration caveats, is in
[docs/LIMITES.md](docs/LIMITES.md) (Portuguese).

## Privacy, in plain words

- **No telemetry.** No analytics, no crash reporting, no author server. The app
  contacts no third-party service unless you ask the assistant.
- **What leaves the device:** a summary of your day (task titles, deadlines,
  project names) and the conversation text. Free-form notes and the rest of the
  database stay on the device.
- **What stays:** everything else, in IndexedDB. The backup is a JSON file you
  export and store wherever you want. Importing a backup replaces the whole
  database.
- **The API key** lives only on the device, in a table excluded from exported
  backups. It is not encrypted: anyone with the unlocked phone can read it.
- **No account means no recovery.** A lost phone without a backup is lost data.

## Quick start

### 1. Install the APK (Android 7.0+)

Download `urdume-publico-0.2.0.apk` from
[Releases](https://github.com/ReiThomato/urdume-publico/releases/latest) and
open it on the phone. Android will ask permission to install from an unknown
source. The release page publishes the SHA-256 checksum of the file.

The APK is also tracked in [`dist-apk/`](dist-apk/) in this repository.

### 2. Run it in the browser

Requirements: Node 20+.

```bash
cd app
npm install
npm run dev
```

It opens at `http://localhost:5173` and works offline after the first load. AI
calls may be blocked by CORS in the browser; the app tells you when that
happens. For the full assistant, use the APK.

### 3. Build the APK yourself

Requirements: Node 20+, JDK 17+ and the Android SDK.

```bash
cd app
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK is written to `app/android/app/build/outputs/apk/debug/app-debug.apk`.

### 4. Connect the AI

You need a key from a provider. The app does **not** ship one.

1. Open **Settings → Jarvis and AI**.
2. Pick a provider.
3. Tap **Add** and paste the key.
4. Go back to Jarvis.

| Provider | Where to get a key | Default model |
|---|---|---|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-4o-mini` |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-2.0-flash` |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | `claude-3-5-haiku-latest` |
| DeepSeek | [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) | `deepseek-chat` |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | `anthropic/claude-3.5-haiku` |

## How the assistant talks to providers

One module (`app/src/lib/jarvis/provedores.ts`) holds the three dialects. They
are **not** compatible with each other, and that is the part that usually
breaks:

| | OpenAI and compatible | Gemini | Anthropic |
|---|---|---|---|
| Endpoint | `/v1/chat/completions` | `/<model>:generateContent` | `/v1/messages` |
| Authentication | `Authorization: Bearer` | `x-goog-api-key` | `x-api-key` + version |
| System instruction | `messages[0]` | `systemInstruction` | `system` |
| Response | `choices[0].message.content` | `candidates[0].content.parts[]` | `content[]` |
| Forced JSON | `response_format` | `responseMimeType` | prompt only |

Adding a provider that speaks the OpenAI format is one entry in `PROVEDORES`
with `dialeto: 'openai'`. The test `provedores.test.ts` checks that every
declared provider can build a request body, build headers and read a response.

There is no proxy, gateway or author address in the path: the request leaves
your device and goes straight to the provider, with your key.

### What the assistant may and may not do

It may propose: create and edit a task, project, milestone, event, reminder or
habit; complete a task, milestone, event, subtask or reminder; check a habit;
add a note to a project; organise a project (category and priority); warn you
about something. It also runs **batches** ("complete the overdue tasks in
project X"), and always shows how many items will be affected before applying.

It never runs without confirmation, and never deletes, restores a backup,
changes settings or changes its own autonomy level.

## How it is built

```
WebView (APK) / browser
  screens/  ──►  db/repo.ts  ──►  Dexie (IndexedDB)
     │              ▲
     ▼              │
  ui/  ◄────────────┘  (reactive useLiveQuery)

  lib/jarvis/ ──► AI provider (HTTPS, your key)
     │
     └──► local notifications (Android)
```

No server. No account. The only network egress is the AI provider call.

```
app/src/
  app/        router, theme, Today blocks, create menu
  db/         Dexie schema, repository, migrations
  lib/
    jarvis/   assistant: signals, relevance, executor, autonomy, providers
    date.ts   local dates (the app counts the day in the device timezone)
  screens/    one screen per route
  ui/         shared components
  styles/     plain CSS per area, no framework
app/android/  Capacitor project
docs/         documentation beyond this README
```

The code comments and in-depth documentation are in Portuguese, following the
conventions described in [docs/CONTRIBUINDO.md](docs/CONTRIBUINDO.md).

## Tests

```bash
cd app
npm ci
npm test        # 571 tests
npx tsc -b      # type check
```

54 test files cover the database, migrations, the assistant signals, the action
executor and its undo, batches, the three provider dialects, APK hygiene and the
isolation of this variant. Automated tests cover logic, not the behaviour of
Android on every manufacturer — see the beta warning above.

## Documentation

The complete manual is in Portuguese:

| Document | What it covers |
|---|---|
| [Arquitetura](docs/ARQUITETURA.md) | layers, data model, assistant pipeline and design decisions |
| [Limites e falhas conhecidas](docs/LIMITES.md) | what does not exist, what is not guaranteed, what was actually tested |
| [Contribuindo](docs/CONTRIBUINDO.md) | code and test conventions, and what does not get merged |
| [Licença](LICENSE) | the full license text |

## License

**Source-available, not OSI open source.** Urdume Público is distributed under
the [PolyForm Noncommercial 1.0.0](LICENSE).

You may use, study, modify and share it for personal use, study, research or
nonprofit projects. You may not sell it, charge for it or use it to generate
revenue. Commercial use requires an agreement with the author. The binding text
is [LICENSE](LICENSE).

## Origins and credits

This is a derivative of a personal app, published as a source-available variant.
Three things from the original are **not** here, by licensing and privacy
decisions:

- **the drawing board** (tldraw), which has its own license and cannot be
  redistributed this way;
- **sync with a personal server**, which depended on the author's
  infrastructure;
- **the newer intelligence engine** (graph memory, automatic thoughts, profile
  and insights), which stays exclusive to the main version.

What remains is the core: routine, projects and the assistant. It was adapted to
accept a key from any provider, with its own app and database identity so it
does not conflict with the original on the same device.

Built with React, Vite, Capacitor, Dexie, Lucide and Material Color Utilities.
Android is a trademark of Google LLC. AI provider names are trademarks of their
respective owners. No affiliation with any of them.
