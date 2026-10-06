# Verification record

Release: **0.1.0**. Local environment: Windows, Node **24.19.0**, pnpm **11.25.0**, installed Chrome, October 5, 2026.

## Application tests

Sixteen automated tests verify:

- Supported note effects and repeats survive unrelated edits and a Guitar Pro export/import round trip.
- AlphaTex and model exports re-import; MIDI exports are standard multi-track MIDI.
- SQLite preserves score revisions, account authentication and private preferences after restart.
- WAV sample peak/RMS measurements match a known signal; malformed chunk sizes are rejected.
- Bridge freshness, source revisions, operation allowlist, pending/processing blocking and matching receipts.
- Authentication, guest mutation denial, JSON/content type and browser origin checks, session invalidation and personal-data isolation.
- Atomic/idempotent reviewed score actions, stale review conflicts, cancellation and revision restore.
- Practice isolation, revisioned MIDI artifacts and honest unconfigured Satsu templates.
- REAPER command queue status and actual adapter receipt reconciliation.
- Shared DLS SDK discovery, authentication, prepare/apply/receipt and logout.
- Live backup opened on another database handle with a successful SQLite integrity check.
- A test model provider receives bounded real summary context and produces a model-labelled advice artifact.
- Import preview acceptance is atomic and idempotent.
- Lua syntax, Unicode/strict JSON handling and a deferred API harness exercising native undo, command receipts, stale rejection, unknown-command rejection and duplicate-ID prevention.

## Browser flow

The production build is served by the real Fastify backend with a temporary SQLite database. Browser verification signs in, saves a favorite, renders notation from the original model, plays/pauses real browser audio, prepares and applies a tempo edit, restores a revision, selects and edits an actual notation glyph, saves practice notes and a timed session, imports a score, asks for template advice, carries its revision into Studio as MIDI, uploads a WAV, switches themes and checks both app layouts from **320px to 1540px** without horizontal page overflow. JavaScript page errors fail verification.

Screenshots are generated into ignored `test-results/`. No test accounts, private score databases, or generated screenshots are pushed to GitHub.

## Limits of verification

- Live REAPER sessions were not altered. Lua uses a test implementation of the documented REAPER APIs; validate first in a disposable native project.
- The native DLS Satsu theme includes original PNG artwork and complete WALTER layouts. Release tests validate the ZIP/PNG integrity, checksums, reproducibility, font records, control states, readable contrast, and non-overlapping control geometry at supported sizes and 100/150/200% scale. These are structural/layout tests, not a screenshot of REAPER's native renderer. Native dialogs and third-party plugin windows are outside WALTER's scope. No VST3 or embedded Tabs dock is shipped.
- Dockerfiles/Compose are supplied but no Docker engine was available for a local build. CI verifies the Node application and browser flow on Linux.
- The user's private SatsuOS deployment was not contacted. The adapter is tested with a local OpenAI-compatible provider fixture.
- Browser engine coverage is Chromium. Music format coverage includes original AlphaTex and generated Guitar Pro/MIDI/model exports; keep original files for unsupported proprietary features.
- Browser synth output uses the compatibility ScriptProcessor path after reproducing a fast start/pause race in alphaTab's asynchronous worklet output. REAPER audio processing is unaffected by that browser choice.

Commands: `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:browser`. The workflow under `.github/workflows/creative-suite.yml` repeats these checks on GitHub.
