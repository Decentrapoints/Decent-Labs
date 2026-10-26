# DLS Creative Suite

A self-hosted songbook and REAPER companion with one visual language, persistent music data, and a shared Satsu action contract.

**DLS Tabs** is the parchment-and-graphite workbench. **DLS Studio / SatsuAudio** is the session control and audio measurement workspace. They run together on one host; other machines use a browser to access the same library.

## Start on this or another computer

Install Node.js **24.x** and pnpm **11.25.0**. This release was verified with Node 24.19.0 on Windows. Keep the package lockfile.

```sh
git clone --branch feat/dls-creative-suite https://github.com/Decentrapoints/Decent-Labs.git
cd Decent-Labs/creative-suite
pnpm install --frozen-lockfile
pnpm run setup
pnpm build
pnpm start
```

Choose your own owner username and password during `setup`; passwords are masked. There is no default account. Open **http://localhost:4310** and sign in. Three original DLS demo scores are included.

The branch name above works before the PR is merged. After merge, clone the repository's default branch instead. An installation on a new machine has a new local library; GitHub contains the software, not your private music database or account credentials.

### Use the same songbook from another machine

Choose one computer or server as the host. Copy `.env.example` to `.env` locally and set:

```dotenv
DLS_HOST=0.0.0.0
DLS_PORT=4310
```

Restart the app. From another computer on your trusted network, open `http://YOUR-HOST:4310`. Allow port 4310 through the host's firewall only for the networks you intend to use. Your browser uses the host's SQLite database, so favorites, score revisions and practice records are shared across your devices without copying files.

For access away from home, use your existing encrypted private network or authenticated HTTPS reverse proxy. If the browser-facing origin is HTTPS, set its exact origin and secure cookies:

```dotenv
DLS_PUBLIC_ORIGIN=https://music.example.test
DLS_COOKIE_SECURE=true
```

`music.example.test` is a placeholder, not a deployed service. The origin has no trailing slash. Cookies are HttpOnly and SameSite Strict, and write requests reject mismatched browser origins. There is no public hosting or private infrastructure address embedded in this repository.

### Docker

```sh
docker compose up --build -d
docker compose exec creative-suite pnpm run setup
```

The default compose port is bound to **127.0.0.1**. Set `DLS_BIND_ADDRESS=0.0.0.0` in the local `.env` for trusted LAN access. Accounts and scores live in the `dls-data` named volume. `docker compose down` preserves it; `docker compose down -v` deletes it.

Docker files are provided, but a container build was not run in the Windows verification environment. The application, backup, browser and Lua tests were run directly with Node.

For a containerized service to control desktop REAPER, the `./bridge-runtime` bind mount must point to the same **host folder** selected in the Lua script. On Linux, provision the bind-mount folders with write access for the container's `node` user (UID 1000). The default Compose folder is intentionally local; do not share a command spool over an untrusted network.

## What works in this release

| App                 | Implemented behavior                                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabs                | Searchable songbook, personal favorites, multi-track score rendering, browser synth playback, speed control, metronome, phrase loops, mute/solo listening, fretted-note edits, reviewed tempo changes, full revision history and restore |
| Authoring / imports | Create an AlphaTex score; preview and accept Guitar Pro, MusicXML, AlphaTex or exported score-model imports; retain the full supported alphaTab model and source checksum; export Guitar Pro, MIDI, AlphaTex or JSON; browser print/PDF  |
| Practice            | Elapsed session timer, saved practice duration and speed, personal notes and recent session history                                                                                                                                      |
| Studio              | Real REAPER session context and track meters through the bridge; reviewed play/pause/stop, mute/solo, gain, loop range and marker commands; execution receipts                                                                           |
| SatsuAudio          | Local integer PCM WAV measurement: sample peak, RMS, near-full-scale sample count, channel count, duration, bit depth and sample rate; durable result artifacts                                                                          |
| Handoffs            | Send a particular Tabs revision to Studio as a standard multi-track MIDI artifact; download and import it into REAPER                                                                                                                    |
| Satsu               | Contextual advice through a configurable OpenAI-compatible model route; clearly labelled local templates when unconfigured; reviewed actions, source revision validation, cancellation and receipts shared across both apps              |
| Hosting             | Owner/guest accounts, persistent SQLite, live database backup, environment configuration, Docker setup and GitHub Actions checks                                                                                                         |

Imported format support follows alphaTab 1.8.4. Proprietary features outside its model may not round-trip; retain your original files. Import provenance stores the filename and SHA-256 plus the parsed model, not an archival copy of the original binary. Imported backing-audio bytes are not archived. WAV uploads are measured and discarded; the measurement and checksum are stored.

The editor modifies existing fretted notes and score tempo. It does not yet add/delete notes or voices through a graphical notation editor; use AlphaTex authoring or import for structural composition. Browser phrase loops use the score's bar tick positions; complicated repeated passages may need a smaller loop. Save an active practice session before navigating away.

Browser playback uses alphaTab's compatibility ScriptProcessor output to avoid an observed 1.8.4 asynchronous worklet start/pause race. Synth rendering is separate from REAPER playback. Browser timing is not a replacement for REAPER's audio clock.

## Connect REAPER

REAPER **7**, its built-in Lua support, and filesystem access on the service host are required. No SWS or ReaImGui extension is required.

1. Start the suite and open **Connections**. Copy the displayed REAPER bridge folder path.
2. In REAPER, open **Actions → Show action list → New action → Load ReaScript**.
3. Load `reaper/DLS_Satsu_Bridge.lua`. Keep `reaper/json.lua` beside it.
4. Run the bridge action. Select the exact host folder from Connections when prompted.
5. Open **Studio**. Tracks, meters and transport context should appear. Prepare a change, inspect its review, then apply it.

The chosen folder is saved in REAPER's local `DLS / BridgeDirectory` setting. To choose another folder, clear that REAPER extension setting or edit it locally. Stop the deferred action from REAPER's running-script prompt to disconnect.

The bridge uses the master track GUID plus a bridge-run identifier as an opaque session key. Each command also carries `GetProjectStateChangeCount`, a 15-second deadline, and a unique ID. The Lua side validates these again immediately before execution. Track changes, loops and markers receive a native REAPER undo block. Transport commands do not create an undo block.

The bridge first renames a command to `processing-*`, then executes it and writes a durable receipt. A crash between those steps is **unknown**, never automatically retried. Inspect the session and the processing file before clearing a stalled command. Keep receipt files while their actions remain in use. Read [the contract](docs/INTEGRATION.md) for recovery details.

### Native REAPER theme

**DLS Satsu** is included as a complete `.ReaperThemeZip`, with original artwork and WALTER layouts for track panels, mixer, master track, envelopes, transport, and toolbar controls. The arrange view, MIDI editor, waveforms, regions, and meters share the suite's graphite/lavender colors. It includes Studio, Compact, Recording, and Inspector variants plus 100%, 150%, and 200% artwork/layouts.

Open **Connections → Download REAPER theme** and drag the downloaded archive into REAPER. Alternatively, open `reaper/theme/dist/DLS Satsu.ReaperThemeZip` directly or copy it to your REAPER resource directory's `ColorThemes` folder. Choose **Options → Themes → DLS Satsu**. Choose panel variants under **Options → Layouts**. [Theme guide and installer](reaper/theme/README.md).

For a reversible application action, load `reaper/DLS_Load_Theme.lua` through **Actions → Show action list → New action → Load ReaScript** and run it. It installs the packaged theme and remembers the previous theme. `DLS_Restore_Theme.lua` restores that selection. These two actions do not need SWS, ReaImGui, or the service.

For the complete Windows workspace, close REAPER and run `./reaper/theme/install.ps1 -QuickAccess -NativeControls`. This installs the bottom Playback panel, draggable BPM/speed numbers, resettable sliders, expandable pitch tools, guitar tuner and practice shortcuts, plus links to Tabs and Satsu. Add `-SuiteURL 'https://music.example.com'` for your server. Native transport BPM dragging uses the optional checksum-verified js_ReaScriptAPI extension; the standalone panel does not need it. Open Playback once per REAPER session to activate native gestures. Collapsing the dock returns its space to the arrangement; reopen it from the Playback toolbar button. Existing toolbars/settings receive backups. See the [theme guide](reaper/theme/README.md) for installation and verification details.

The theme does not embed the web companion or Tabs inside REAPER; those remain separate connected applications. Native dialogs, third-party plugin windows, and OS window chrome retain their own layouts. The REAPER bridge supplies session integration separately from the theme.

### Legacy palette action

Load `reaper/DLS_Satsu_Palette.lua` as another action and run it to apply the DLS graphite/lavender palette to the current theme. Run it again to restore the colors saved before applying. Restore before changing native themes.

Use the packaged theme for the full DLS layout. The legacy palette action only changes colors in another theme. No VST3 is shipped. Confirm bridge session controls in a disposable project before using them on important work.

## Connect SatsuOS

On the host, configure `.env` for a route you provision:

```dotenv
SATSU_BASE_URL=http://localhost:11434/v1
SATSU_MODEL=your-local-model
# SATSU_API_KEY=your-locally-provisioned-key
```

The example is a local OpenAI-compatible chat endpoint. The adapter calls `/chat/completions`; it is not an assumption about your existing SatsuOS private API. A remote route is also possible if you deliberately configure one. In a container, `localhost` refers to the container, so use the reachable service name or host route you manage.

The current model path produces **advice only**. It does not execute tools. Score changes and REAPER commands have separate prepared-action reviews. The UI sends the selected score summary/selection or the current REAPER summary, plus related songbook context when available. It does not upload raw audio or the entire score to the model. Related score context does not imply that its MIDI has been imported into REAPER.

`sdk/dls-client.mjs` and `/api/capabilities` establish a shared `dls-action/1` contract for future DLS adapters. [Integration documentation](docs/INTEGRATION.md) describes the endpoints, lifecycle and example client. Other DLS apps are not silently connected by this release; each needs an adapter and authorization in your Satsu deployment.

## Accounts, storage and backups

Owners edit the common library and control REAPER. Guests read scores, play them, and save their own notes, favorites and practice records. Guests cannot import, change scores, analyze uploads, or apply DAW commands. Add guests in Connections or with `pnpm run setup --guest`. Reset an account password locally with `pnpm run setup --reset`; this also invalidates its sessions.

All durable application data is in `data/dls.sqlite`, or the directory selected by `DLS_DATA_DIR`. Local `.env`, databases, bridge spools, backups and generated test images are ignored by Git. Passwords are salted with scrypt; session tokens are stored as hashes and expire after seven days.

```sh
pnpm backup
# optional explicit destination:
pnpm backup /your/private/backup-folder
# container:
docker compose exec creative-suite pnpm backup
```

The backup command uses SQLite's live backup API. A backup contains the database and a manifest. It includes account hashes, scores, history, practice, imported models and artifacts; treat it as private. It does not contain environment keys, REAPER project files, uploaded audio, or the bridge spool. A tested backup can be opened on another host with SQLite integrity checks intact.

To move a library, stop the destination service, preserve its existing data folder, place the backed-up `dls.sqlite` in its configured data directory, and restart. Do not copy an active SQLite database and ignore its WAL file. Provision the destination `.env` separately. Invalidate old sessions after a restore with the local password-reset command. Never restore an old bridge command queue into an active REAPER session.

## Development and verification

```sh
pnpm dev
# development UI: http://localhost:5173 (API: localhost:4310)
pnpm check
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

The development proxy expects API port 4310. Production port selection comes from `.env`. Set `PLAYWRIGHT_EXECUTABLE_PATH` to an installed Chrome/Chromium binary if you prefer; on Windows the test also detects the standard Chrome installation.

The automated suite covers score effect/repeat preservation, export formats, database restart persistence, stale/conflicting edits, action idempotency, restore history, account/guest boundaries, origin checks, user isolation, WAV validation, bridge receipts and crash leftovers, Lua compilation and execution, genuine model routing against a test provider, SDK operation, import acceptance and live backup. Browser checks exercise actual rendered notation, playback, reviewed tempo/note edits, restore, imports, handoff, WAV upload, practice, Satsu templates, themes and narrow layouts.

CI runs the same application tests and browser flow on Linux. See `docs/VALIDATION.md` for the local verification record and limits.

## Layout and ownership

```text
src/           React interfaces and shared design tokens
server/        Fastify, SQLite, auth, Satsu route, audio and bridge adapters
shared/        Score import/edit/export contracts
reaper/        Deferred Lua bridge, JSON codec and native palette preset
sdk/           Shared DLS API client for additional adapters
scripts/       Account setup, development runner and backup
tests/         Application, integration, Lua and browser verification
docs/          Integration contract and verification record
```

The repository's existing ownership/licensing terms apply to original code. Dependency code and assets retain their own licenses. See [third-party notices](THIRD_PARTY.md). No commercial song tabs or private infrastructure data are included.
