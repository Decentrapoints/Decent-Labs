import React, { useEffect, useState, useRef } from "react";
import {
  Music2,
  AudioLines,
  Library,
  BookOpen,
  Timer,
  Upload,
  Plug,
  Search,
  Plus,
  Star,
  ArrowUpRight,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
  Check,
  X,
  History,
  Download,
  Command,
  Activity,
  Headphones,
} from "lucide-react";
import { api, upload, clock } from "./api";
import { Button, Modal } from "./ui";
import ScoreWorkspace from "./ScoreWorkspace";
import Studio from "./Studio";
import SatsuPanel from "./SatsuPanel";

function Login({ status, onLogin }) {
  const [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <div className="login-art">
        <div className="brand">
          <span className="brand-mark">dls</span>
          <span>
            DECENT LABS
            <br />
            <small>CREATIVE SUITE</small>
          </span>
        </div>
        <div className="login-heading">
          <span className="eyebrow">A SPACE FOR YOUR NEXT IDEA</span>
          <h1>
            Less friction.
            <br />
            More music.
          </h1>
          <p>
            Your scores, your sessions, your Satsu.
            <br />A quiet workspace you can host yourself.
          </p>
          <div className="staff-art">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <i key={i} />
            ))}
            <span>0</span>
            <span>3</span>
            <span>5</span>
            <span>7</span>
          </div>
        </div>
        <small>Designed for focus. Built for ownership.</small>
      </div>
      <div className="login-form">
        <div>
          <span className="eyebrow">WELCOME TO YOUR WORKSPACE</span>
          <h2>Make room for music.</h2>
          {status.setupRequired ? (
            <>
              <p>
                Create your first owner account on the host, then sign in here.
              </p>
              <code>pnpm run setup</code>
              <Button onClick={() => location.reload()} icon={Plug}>
                Check setup again
              </Button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  onLogin(
                    await api("/auth/login", {
                      method: "POST",
                      body: { name, password },
                    }),
                  );
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Username
                <input
                  autoComplete="username"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <Button className="primary wide" disabled={busy}>
                {busy ? "Signing in…" : "Enter workspace"}
                <ArrowUpRight size={17} />
              </Button>
            </form>
          )}
          <p className="fine">
            Your account and music stay in this host’s local workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
function LibraryView({
  scores,
  openScore,
  favorite,
  newScore,
  filter,
  setFilter,
}) {
  return (
    <div className="page-content library-view">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR SELF-HOSTED SONGBOOK</span>
          <h1>Keep the good ideas close.</h1>
          <p>A collection to learn from, return to, and make your own.</p>
        </div>
        <Button className="primary" icon={Plus} onClick={newScore}>
          New score
        </Button>
      </div>
      <div className="library-controls">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search songbook"
            placeholder="Find a song, artist, or idea…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <span className="muted">
          {scores.length} scores · stored on your host
        </span>
      </div>
      <div className="song-grid">
        {scores
          .filter((s) =>
            `${s.title} ${s.artist}`
              .toLowerCase()
              .includes(filter.toLowerCase()),
          )
          .map((s, i) => (
            <article className={`song-card tint-${i % 3}`} key={s.id}>
              <div
                className="song-art"
                onClick={() => openScore(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openScore(s.id);
                }}
                aria-label={`Open ${s.title}`}
              >
                <div className="art-lines">
                  {[0, 1, 2, 3, 4, 5].map((x) => (
                    <i key={x} />
                  ))}
                  <b>{s.title.slice(0, 1)}</b>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <span className="art-label">{s.artist}</span>
                <Music2 size={20} />
              </div>
              <div className="song-info">
                <div>
                  <h2>
                    <button
                      className="text-button"
                      onClick={() => openScore(s.id)}
                    >
                      {s.title}
                    </button>
                  </h2>
                  <p>{s.artist}</p>
                </div>
                <button
                  className={`icon-button ${s.favorite ? "active" : ""}`}
                  aria-label={`${s.favorite ? "Unfavorite" : "Favorite"} ${s.title}`}
                  onClick={() => favorite(s)}
                >
                  <Star size={17} fill={s.favorite ? "currentColor" : "none"} />
                </button>
              </div>
              <div className="song-meta">
                <span>{s.tempo} BPM</span>
                <span>{s.bars} bars</span>
                <span>
                  {s.tracks.length} track{s.tracks.length === 1 ? "" : "s"}
                </span>
                <span>r{s.revision}</span>
              </div>
            </article>
          ))}
      </div>
      <div className="library-footer">
        <BookOpen size={25} />
        <div>
          <h3>Every score has a story.</h3>
          <p>
            Bring in Guitar Pro, MusicXML, or AlphaTex. Keep source provenance
            and every saved revision.
          </p>
        </div>
      </div>
    </div>
  );
}
function Connections({ connections, user, reload, notify }) {
  const [guest, setGuest] = useState(""),
    [password, setPassword] = useState("");
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ONE WORKSPACE. SHARED CONTEXT.</span>
          <h1>Everything has a place.</h1>
          <p>See what is connected, and what each app can do.</p>
        </div>
        <Button icon={Plug} onClick={reload}>
          Refresh connections
        </Button>
      </div>
      <div className="connection-grid">
        <section className="panel">
          <div className="panel-icon">
            <Library />
          </div>
          <h2>DLS Tabs</h2>
          <p>
            Persistent scores, revision history, practice records and notation
            playback.
          </p>
          <span className="status">
            <i />
            Local storage ready
          </span>
          <dl>
            <dt>Storage</dt>
            <dd>SQLite + named volume or data folder</dd>
            <dt>Access</dt>
            <dd>Owner edits · guests practice</dd>
            <dt>Your role</dt>
            <dd>{user.role}</dd>
          </dl>
        </section>
        <section className="panel">
          <div className="panel-icon">
            <AudioLines />
          </div>
          <h2>REAPER / SatsuAudio</h2>
          <p>
            Session context, reviewed transport and track changes, loop ranges,
            markers, and WAV measurement.
          </p>
          <span
            className={`status ${connections?.reaper.connected ? "" : "quiet"}`}
          >
            <i />
            {connections?.reaper.connected
              ? "REAPER connected"
              : "Bridge awaiting REAPER"}
          </span>
          <p className="fine">
            Load reaper/DLS_Satsu_Bridge.lua in REAPER’s Actions list. Choose
            this bridge folder:
          </p>
          <code className="path-code">{connections?.reaper.directory}</code>
          <p className="fine">
            REAPER and the service share a filesystem folder. Browser clients
            can use another machine.
          </p>
        </section>
        <section className="panel">
          <div className="panel-icon">
            <Command />
          </div>
          <h2>Satsu</h2>
          <p>
            Contextual advice through your configured model route. Every
            mutation gets its own review and receipt.
          </p>
          <span
            className={`status ${connections?.satsu.configured ? "" : "quiet"}`}
          >
            <i />
            {connections?.satsu.mode || "Checking route"}
          </span>
          <p className="fine">
            Configure SATSU_BASE_URL, SATSU_MODEL and optional SATSU_API_KEY on
            the host. The current adapter uses an OpenAI-compatible chat route.
          </p>
          <p className="fine">
            Only the selected score summary or session summary and your request
            are sent. Audio and passwords are never part of this context.
          </p>
        </section>
      </div>
      <section className="panel setup-panel">
        <h2>Pick up on another machine.</h2>
        <p>
          Run one host and open its address from your other computer. It shares
          your songbook and history automatically. A separate installation gets
          its own library unless you restore a backup.
        </p>
        <div className="capability-row">
          <span>Score revisions</span>
          <span>Reviewed commands</span>
          <span>Idempotent actions</span>
          <span>Host backups</span>
        </div>
        <p className="fine">
          See the repository README for Docker, LAN access, encrypted remote
          access, and REAPER setup. Keep the service on a trusted network or
          behind your authenticated HTTPS proxy.
        </p>
      </section>
      {user.role === "owner" && (
        <section className="panel setup-panel">
          <h2>Add a guest</h2>
          <p>
            Guests can read scores and save their own practice notes. They
            cannot edit the shared songbook or control REAPER.
          </p>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/users", {
                  method: "POST",
                  body: { name: guest, password },
                });
                setGuest("");
                setPassword("");
                notify("Guest account created.");
              } catch (e) {
                notify(e.message, true);
              }
            }}
          >
            <label>
              Username
              <input
                value={guest}
                onChange={(e) => setGuest(e.target.value)}
                minLength={3}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                required
                autoComplete="new-password"
              />
            </label>
            <Button>Add guest</Button>
          </form>
        </section>
      )}
    </div>
  );
}
function Imports({ artifacts, refresh, notify, onAccepted, user }) {
  const input = useRef(),
    [busy, setBusy] = useState(false);
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">BRING YOUR COLLECTION HOME</span>
          <h1>From file to songbook.</h1>
          <p>Preview each import before adding it to the shared library.</p>
        </div>
      </div>
      <section className="import-drop panel">
        <Upload size={36} />
        <h2>A new chapter starts here.</h2>
        <p>
          Guitar Pro · MusicXML · AlphaTex
          <br />
          Score files up to 8 MB
        </p>
        <Button
          className="primary"
          icon={Upload}
          disabled={busy || user.role !== "owner"}
          onClick={() => input.current.click()}
        >
          {busy ? "Reading score…" : "Choose score file"}
        </Button>
        <input
          hidden
          ref={input}
          type="file"
          accept=".gp,.gp3,.gp4,.gp5,.gpx,.musicxml,.xml,.mxl,.tex,.alphatex"
          onChange={async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            setBusy(true);
            try {
              await upload("/imports", f);
              await refresh();
              notify("Import ready for review.");
            } catch (e) {
              notify(e.message, true);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </section>
      <h2 className="section-title">Import previews</h2>
      <div className="import-list">
        {artifacts
          .filter((a) => a.kind === "score-import")
          .map((a) => (
            <section className="panel import-row" key={a.id}>
              <div className="panel-icon">
                <Music2 />
              </div>
              <div>
                <h3>{a.payload.summary.title}</h3>
                <p>
                  {a.name} · {a.payload.summary.bars} bars ·{" "}
                  {a.payload.summary.tracks.length} tracks
                </p>
                <small>{new Date(a.created).toLocaleString()}</small>
              </div>
              <Button
                onClick={async () => {
                  try {
                    const s = await api(`/imports/${a.id}/accept`, {
                      method: "POST",
                      body: {},
                    });
                    await refresh();
                    onAccepted(s.id);
                    notify("Added to songbook.");
                  } catch (e) {
                    notify(e.message, true);
                  }
                }}
              >
                Add to songbook
                <ChevronRight size={16} />
              </Button>
            </section>
          ))}
      </div>
    </div>
  );
}
export default function App() {
  const [status, setStatus] = useState(null),
    [user, setUser] = useState(null),
    [app, setApp] = useState(location.hash === "#studio" ? "studio" : "tabs"),
    [view, setView] = useState("songbook"),
    [scores, setScores] = useState([]),
    [scoreId, setScoreId] = useState("demo-1"),
    [connections, setConnections] = useState(null),
    [artifacts, setArtifacts] = useState([]),
    [filter, setFilter] = useState(""),
    [theme, setTheme] = useState(localStorage.getItem("dls-theme") || "dark"),
    [toast, setToast] = useState(null),
    [modal, setModal] = useState(null),
    [proposal, setProposal] = useState(null),
    [refreshKey, setRefreshKey] = useState(0),
    [scoreContext, setScoreContext] = useState(null),
    [satsuOpen, setSatsuOpen] = useState(true);
  const notify = (text, error = false) => setToast({ text, error });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dls-theme", theme);
  }, [theme]);
  useEffect(() => {
    api("/auth/status")
      .then((s) => {
        setStatus(s);
        setUser(s.user);
      })
      .catch((e) => notify(e.message, true));
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const refresh = async () => {
    const [s, c, a] = await Promise.all([
      api("/scores"),
      api("/connections"),
      api("/artifacts"),
    ]);
    setScores(s);
    setConnections(c);
    setArtifacts(a);
  };
  useEffect(() => {
    if (user) refresh().catch((e) => notify(e.message, true));
  }, [user, refreshKey]);
  const openScore = (id) => {
    setScoreId(id);
    setView("score");
    setApp("tabs");
  };
  const changed = () => setRefreshKey((k) => k + 1);
  const prepare = async (app, resource, operation) => {
    try {
      setProposal(
        await api("/actions/prepare", {
          method: "POST",
          body: { app, resource, operation },
        }),
      );
    } catch (e) {
      notify(e.message, true);
    }
  };
  if (!status)
    return (
      <div className="loading">
        <span className="brand-mark">dls</span>
        <p>Opening your workspace…</p>
        {toast?.text}
      </div>
    );
  if (!user) return <Login status={status} onLogin={setUser} />;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#tabs" onClick={() => setApp("tabs")}>
          <span className="brand-mark">dls</span>
          <span>
            DECENT LABS
            <br />
            <small>CREATIVE SUITE</small>
          </span>
        </a>
        <div className="app-switch">
          <button
            className={app === "tabs" ? "selected" : ""}
            onClick={() => {
              setApp("tabs");
              location.hash = "tabs";
            }}
          >
            <Music2 size={17} />
            Tabs
          </button>
          <button
            className={app === "studio" ? "selected" : ""}
            onClick={() => {
              setApp("studio");
              location.hash = "studio";
            }}
          >
            <AudioLines size={17} />
            Studio
          </button>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav>
          {[
            { id: "songbook", label: "Songbook", icon: Library },
            { id: "score", label: "Score editor", icon: BookOpen },
            { id: "practice", label: "Practice", icon: Timer },
            { id: "imports", label: "Imports", icon: Upload },
            { id: "connections", label: "Connections", icon: Plug },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "selected" : ""}
              onClick={() => setView(id)}
            >
              <Icon size={17} />
              {label}
              {id === "songbook" && <small>{scores.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-label">PINNED SCORES</div>
        <div className="pinned-list">
          {scores
            .filter((s) => s.favorite)
            .map((s) => (
              <button key={s.id} onClick={() => openScore(s.id)}>
                <span className="pin-dot" />
                {s.title}
                <ChevronRight size={14} />
              </button>
            ))}
          {!scores.some((s) => s.favorite) && (
            <p>Star a score to keep it here.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="host-status">
            <i />
            <div>
              Workspace online<small>Self-hosted · v0.1.0</small>
            </div>
          </div>
          <div className="user-row">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              {user.name}
              <small>{user.role}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await api("/auth/logout", { method: "POST", body: {} });
                setUser(null);
                setStatus({ ...status, user: null });
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            DLS {app === "tabs" ? "Tabs" : "Studio"}
            <ChevronRight size={13} />
            <b>
              {view === "songbook"
                ? app === "tabs"
                  ? "Songbook"
                  : "Session"
                : view[0].toUpperCase() + view.slice(1)}
            </b>
          </div>
          <div className="topbar-actions">
            <span className="local-chip">
              <i />
              YOUR HOST
            </span>
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Button
              icon={Command}
              className={satsuOpen ? "selected" : ""}
              onClick={() => setSatsuOpen((v) => !v)}
            >
              Satsu
            </Button>
          </div>
        </header>
        <div className={`workspace ${satsuOpen ? "with-satsu" : ""}`}>
          <div className="primary-workspace">
            {view === "connections" ? (
              <Connections
                connections={connections}
                user={user}
                reload={() => refresh().catch((e) => notify(e.message, true))}
                notify={notify}
              />
            ) : view === "imports" ? (
              <Imports
                artifacts={artifacts}
                refresh={refresh}
                notify={notify}
                user={user}
                onAccepted={openScore}
              />
            ) : app === "studio" ? (
              <Studio
                connections={connections}
                refreshConnections={() =>
                  api("/connections").then(setConnections)
                }
                artifacts={artifacts}
                refresh={refresh}
                prepare={prepare}
                notify={notify}
                user={user}
              />
            ) : view === "songbook" ? (
              <LibraryView
                scores={scores}
                openScore={openScore}
                favorite={async (s) => {
                  try {
                    await api(`/scores/${s.id}/preference`, {
                      method: "PUT",
                      body: { favorite: !s.favorite },
                    });
                    await refresh();
                  } catch (e) {
                    notify(e.message, true);
                  }
                }}
                newScore={() => setModal("new-score")}
                filter={filter}
                setFilter={setFilter}
              />
            ) : (
              <ScoreWorkspace
                id={scoreId}
                scores={scores}
                practice={view === "practice"}
                user={user}
                openScore={openScore}
                changed={changed}
                refreshKey={refreshKey}
                notify={notify}
                setContext={setScoreContext}
                onHandoff={() => {
                  setApp("studio");
                  location.hash = "studio";
                }}
                prepare={prepare}
              />
            )}
          </div>
          {satsuOpen && (
            <SatsuPanel
              app={app}
              context={scoreContext}
              connections={connections}
              prepare={prepare}
              user={user}
              notify={notify}
              refreshKey={refreshKey}
            />
          )}
        </div>
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <X size={17} /> : <Check size={17} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "new-score" && (
        <NewScore
          onClose={() => setModal(null)}
          onCreated={(s) => {
            changed();
            openScore(s.id);
            setModal(null);
          }}
          notify={notify}
          user={user}
        />
      )}{" "}
      {proposal && (
        <Modal title="Review action" onClose={() => setProposal(null)}>
          <div className="review-heading">
            <span className="panel-icon">
              <Command />
            </span>
            <div>
              <span className="eyebrow">
                PREPARED · {proposal.app.toUpperCase()}
              </span>
              <h3>{proposal.description}</h3>
            </div>
          </div>
          <dl className="review-details">
            <dt>Resource</dt>
            <dd>{proposal.resource}</dd>
            <dt>Expected revision</dt>
            <dd>{proposal.revision}</dd>
            <dt>Operation</dt>
            <dd>
              <pre>{JSON.stringify(proposal.operation, null, 2)}</pre>
            </dd>
          </dl>
          <p className="fine">
            The source revision is checked again when you apply. Score changes
            can be restored from history. REAPER changes use its native undo
            history.
          </p>
          <div className="modal-actions">
            <Button
              onClick={async () => {
                await api(`/actions/${proposal.id}/cancel`, {
                  method: "POST",
                  body: {},
                });
                setProposal(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="primary"
              onClick={async () => {
                try {
                  const a = await api(`/actions/${proposal.id}/apply`, {
                    method: "POST",
                    body: {},
                  });
                  notify(a.receipt?.message || a.status);
                  setProposal(null);
                  changed();
                } catch (e) {
                  notify(e.message, true);
                }
              }}
            >
              Apply reviewed action
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function NewScore({ onClose, onCreated, notify, user }) {
  const [title, setTitle] = useState("New idea"),
    [tempo, setTempo] = useState(92),
    [tex, setTex] = useState(
      "0.6.4 3.5.4 5.4.4 7.3.4 | 0.6.4 3.5.4 5.4.4 7.3.4",
    ),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Create a score" onClose={onClose}>
      <p>
        Start with a short phrase in AlphaTex. Use fret.string.duration,
        separated by bars.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const titleSafe = title.replace(/["\\]/g, "");
            onCreated(
              await api("/scores", {
                method: "POST",
                body: {
                  alphatex: `\\title "${titleSafe}" \\tempo ${tempo} . ${tex}`,
                },
              }),
            );
          } catch (e) {
            notify(e.message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field-row">
          <label>
            Title
            <input
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label>
            Tempo
            <input
              type="number"
              min={20}
              max={300}
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
            />
          </label>
        </div>
        <label>
          Notation
          <textarea
            value={tex}
            onChange={(e) => setTex(e.target.value)}
            rows={6}
          />
        </label>
        <p className="fine">
          Example: 3.6.4 means fret 3, string 6, quarter note. Imported scores
          preserve their full alphaTab model, including supported effects and
          repeats.
        </p>
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button className="primary" disabled={busy || user.role !== "owner"}>
            {busy ? "Creating…" : "Create score"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
