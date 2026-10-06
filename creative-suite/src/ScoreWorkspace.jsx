import React, { useEffect, useState, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  Repeat2,
  Timer,
  Download,
  History,
  Save,
  Minus,
  Plus,
  Headphones,
  SlidersHorizontal,
  Music2,
  Check,
  ChevronDown,
  Printer,
} from "lucide-react";
import { api, clock } from "./api";
import { Button, Modal } from "./ui";

let alphaPromise;
function loadAlpha() {
  if (window.alphaTab) return Promise.resolve(window.alphaTab);
  if (!alphaPromise)
    alphaPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/assets/alphatab/alphaTab.min.js";
      s.onload = () => resolve(window.alphaTab);
      s.onerror = () =>
        reject(new Error("Notation engine could not load from your host."));
      document.head.appendChild(s);
    });
  return alphaPromise;
}
export default function ScoreWorkspace({
  id,
  scores,
  practice,
  user,
  changed,
  refreshKey,
  notify,
  setContext,
  prepare,
  openScore,
  onHandoff,
}) {
  const [score, setScore] = useState(null),
    [loading, setLoading] = useState(true),
    [track, setTrack] = useState(0),
    [selection, setSelection] = useState(null),
    [fret, setFret] = useState(0),
    [noteString, setNoteString] = useState(6),
    [speed, setSpeed] = useState(0.7),
    [ready, setReady] = useState(false),
    [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0),
    [loop, setLoop] = useState(false),
    [from, setFrom] = useState(1),
    [to, setTo] = useState(4),
    [metro, setMetro] = useState(false),
    [history, setHistory] = useState(null),
    [note, setNote] = useState(""),
    [tempo, setTempo] = useState(92),
    [practiceStart, setPracticeStart] = useState(null),
    [elapsed, setElapsed] = useState(0),
    [records, setRecords] = useState([]),
    [mixer, setMixer] = useState({});
  const canvas = useRef(),
    engine = useRef(),
    mounted = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelection(null);
    api(`/scores/${id}`)
      .then((s) => {
        if (active) {
          setScore(s);
          setTempo(s.tempo);
          setNote(s.preference.note || "");
          setSpeed(s.preference.speed || 0.7);
          setTrack(0);
          setFrom(1);
          setTo(Math.min(4, s.bars));
          setLoop(false);
        }
      })
      .catch((e) => notify(e.message, true))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, refreshKey]);
  useEffect(() => {
    if (score)
      setContext({
        id: score.id,
        title: score.title,
        revision: score.revision,
        tempo: score.tempo,
        selection,
      });
  }, [score, selection]);
  useEffect(() => {
    if (!score || loading || !canvas.current) return;
    let disposed = false;
    setReady(false);
    setPlaying(false);
    setPosition(0);
    setMixer({});
    loadAlpha()
      .then((alpha) => {
        if (disposed) return;
        // Compatibility output avoids alphaTab 1.8.4's async worklet start/pause race.
        const a = new alpha.AlphaTabApi(canvas.current, {
          core: {
            scriptFile: new URL(
              "/assets/alphatab/alphaTab.min.js",
              location.href,
            ).href,
            fontDirectory: "/assets/alphatab/font/",
            engine: "svg",
            includeNoteBounds: true,
          },
          display: { scale: 1, layoutMode: "page", staveProfile: "ScoreTab" },
          player: {
            enablePlayer: true,
            enableCursor: true,
            enableUserInteraction: true,
            outputMode: alpha.PlayerOutputMode.WebAudioScriptProcessor,
            soundFont: "/assets/alphatab/soundfont/sonivox.sf2",
            scrollElement: ".score-scroll",
            scrollMode: 0,
          },
        });
        engine.current = a;
        a.error.on((e) => notify(`Notation: ${e.message || e}`, true));
        a.playerReady.on(() => {
          if (!disposed) {
            setReady(true);
            a.playbackSpeed = speed;
            a.metronomeVolume = metro ? 0.25 : 0;
          }
        });
        a.playerStateChanged.on((e) => {
          if (!disposed) setPlaying(e.state === 1);
        });
        a.playerPositionChanged.on((e) => {
          if (!disposed) {
            setPosition(e.currentTime / 1000);
            setDuration(e.endTime / 1000);
          }
        });
        a.noteMouseDown.on((n) => {
          const b = n.beat,
            bar = b.voice.bar,
            staff = bar.staff;
          const value = {
            track: staff.track.index,
            staff: staff.index,
            bar: bar.index,
            voice: b.voice.index,
            beat: b.index,
            note: b.notes.indexOf(n),
            fret: n.fret,
            string: n.string,
          };
          setSelection(value);
          setFret(n.fret);
          setNoteString(n.string);
        });
        a.renderScore(alpha.model.JsonConverter.jsonToScore(score.source), [
          track,
        ]);
      })
      .catch((e) => notify(e.message, true));
    return () => {
      disposed = true;
      engine.current?.destroy();
      engine.current = null;
    };
  }, [score?.source, loading]);
  useEffect(() => {
    if (engine.current?.score) engine.current.renderTracks([track]);
    setSelection(null);
  }, [track]);
  useEffect(() => {
    if (engine.current) engine.current.playbackSpeed = speed;
  }, [speed]);
  useEffect(() => {
    if (engine.current) engine.current.metronomeVolume = metro ? 0.25 : 0;
  }, [metro]);
  useEffect(() => {
    const a = engine.current;
    if (!a?.score) return;
    a.isLooping = loop;
    if (loop) {
      const start = a.score.masterBars[from - 1],
        end = a.score.masterBars[to - 1];
      if (start && end)
        a.playbackRange = {
          startTick: start.start,
          endTick: end.start + end.calculateDuration(),
        };
    } else a.playbackRange = null;
  }, [loop, from, to, ready]);
  useEffect(() => {
    if (practiceStart) {
      const timer = setInterval(
        () => setElapsed(Math.floor((Date.now() - practiceStart) / 1000)),
        1000,
      );
      return () => clearInterval(timer);
    }
  }, [practiceStart]);
  useEffect(() => {
    if (practice)
      api("/practice")
        .then(setRecords)
        .catch((e) => notify(e.message, true));
  }, [practice, refreshKey]);
  const finishPractice = async () => {
    if (!practiceStart) return;
    const seconds = Math.max(
      1,
      Math.floor((Date.now() - practiceStart) / 1000),
    );
    try {
      await api("/practice", {
        method: "POST",
        body: { scoreId: score.id, seconds, speed },
      });
      setPracticeStart(null);
      setElapsed(0);
      engine.current?.pause();
      notify(`Saved ${clock(seconds)} of focused practice.`);
      setRecords(await api("/practice"));
    } catch (e) {
      notify(e.message, true);
    }
  };
  if (loading || !score)
    return (
      <div className="page-content">
        <p className="muted">Loading score…</p>
      </div>
    );
  return (
    <div className="score-workspace">
      <header className="score-heading">
        <div>
          <span className="eyebrow">
            {practice
              ? "YOUR FOCUS SESSION"
              : "DLS ORIGINALS & YOUR COLLECTION"}
          </span>
          <div className="score-title-row">
            <h1>{score.title}</h1>
            <span className="revision">r{score.revision}</span>
          </div>
          <p>
            {score.artist} <span>·</span> {score.tempo} BPM <span>·</span>{" "}
            {score.bars} bars
          </p>
        </div>
        <div className="score-heading-actions">
          <Button
            icon={Music2}
            disabled={user.role !== "owner"}
            onClick={async () => {
              try {
                await api(`/scores/${id}/handoff`, {
                  method: "POST",
                  body: {},
                });
                changed();
                onHandoff();
                notify("Score revision sent to Studio as MIDI.");
              } catch (e) {
                notify(e.message, true);
              }
            }}
          >
            Send to Studio
          </Button>
          <label className="sr-only" htmlFor="score-select">
            Select score
          </label>
          <select
            id="score-select"
            value={id}
            onChange={(e) => {
              if (practiceStart) {
                notify(
                  "Save this practice session before switching scores.",
                  true,
                );
                return;
              }
              openScore(e.target.value);
            }}
          >
            {scores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <Button
            icon={History}
            onClick={async () => {
              try {
                setHistory(await api(`/scores/${id}/history`));
              } catch (e) {
                notify(e.message, true);
              }
            }}
          >
            History
          </Button>
          <div className="export-menu">
            <details>
              <summary className="button">
                <Download size={16} />
                Export
              </summary>
              <div>
                <a href={`/api/scores/${id}/export/gp`}>Guitar Pro (.gp)</a>
                <a href={`/api/scores/${id}/export/mid`}>MIDI (.mid)</a>
                <a href={`/api/scores/${id}/export/alphatex`}>
                  AlphaTex (.tex)
                </a>
                <a href={`/api/scores/${id}/export/json`}>
                  Score model (.json)
                </a>
                <button onClick={() => window.print()}>
                  <Printer size={14} />
                  Print / PDF
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="score-toolbar">
        <div className="track-tabs">
          {score.tracks.map((t) => (
            <button
              key={t.index}
              className={track === t.index ? "active" : ""}
              onClick={() => setTrack(t.index)}
            >
              <span className={`track-dot track-${t.index % 3}`} />
              {t.name}
            </button>
          ))}
        </div>
        <span className="fine">
          <i className="inline-dot" />
          Saved to your host
        </span>
      </div>
      {practice && (
        <section className="practice-strip">
          <div className="practice-icon">
            <Headphones size={22} />
          </div>
          <div>
            <span className="eyebrow">ONE PHRASE AT A TIME</span>
            <h3>
              {practiceStart
                ? `${clock(elapsed)} of focused practice`
                : "Slow is smooth. Smooth is fast."}
            </h3>
            <p>Loop a phrase, find the feel, then increase the pace.</p>
          </div>
          <Button
            className="primary"
            icon={practiceStart ? Check : Timer}
            onClick={() => {
              if (practiceStart) finishPractice();
              else {
                setPracticeStart(Date.now());
                setElapsed(0);
                engine.current?.play();
              }
            }}
          >
            {practiceStart ? "Save session" : "Start practice"}
          </Button>
        </section>
      )}
      <div className="score-body">
        <div className="score-scroll">
          <div className="score-paper">
            <div className="paper-overline">
              <span>
                PERSONAL SONGBOOK /{" "}
                {String(scores.findIndex((s) => s.id === id) + 1).padStart(
                  2,
                  "0",
                )}
              </span>
              <span>{score.bars} BARS</span>
            </div>
            <div ref={canvas} className="notation" data-testid="notation" />
            <div className="paper-foot">
              DLS TABS <span>MAKE IT YOURS.</span>
            </div>
          </div>
        </div>
        <aside className="score-inspector">
          <div className="inspector-label">
            <SlidersHorizontal size={15} /> WORKBENCH
          </div>
          <section>
            <h3>{selection ? "Selected note" : "Choose a note"}</h3>
            <p className="fine">
              {selection
                ? `Bar ${selection.bar + 1} · beat ${selection.beat + 1} · track ${selection.track + 1}`
                : "Click a fretted note in the score to edit it."}
            </p>
            <div className="field-row">
              <label>
                Fret
                <input
                  type="number"
                  min={0}
                  max={36}
                  value={fret}
                  disabled={!selection}
                  onChange={(e) => setFret(Number(e.target.value))}
                />
              </label>
              <label>
                String
                <input
                  type="number"
                  min={1}
                  max={score.tracks[track]?.tuning.length || 6}
                  value={noteString}
                  disabled={!selection}
                  onChange={(e) => setNoteString(Number(e.target.value))}
                />
              </label>
            </div>
            <Button
              className="wide"
              disabled={!selection || user.role !== "owner"}
              onClick={() =>
                prepare("tabs", id, {
                  type: "note",
                  ...selection,
                  fret,
                  string: noteString,
                })
              }
            >
              Review note edit
            </Button>
          </section>
          <section>
            <h3>Score tempo</h3>
            <div className="tempo-edit">
              <input
                aria-label="Score tempo"
                type="number"
                min={20}
                max={300}
                value={tempo}
                onChange={(e) => setTempo(Number(e.target.value))}
              />
              <span>BPM</span>
            </div>
            <input
              aria-label="Score tempo slider"
              type="range"
              min={20}
              max={300}
              step={1}
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
            />
            <Button
              className="wide"
              disabled={user.role !== "owner"}
              onClick={() =>
                prepare("tabs", id, { type: "tempo", value: tempo })
              }
            >
              Review tempo change
            </Button>
            <p className="fine">Practice speed below changes playback only.</p>
          </section>
          <section>
            <h3>Track listening</h3>
            {score.tracks.map((t) => (
              <div key={t.index} className="mixer-track">
                <span>{t.name}</span>
                <div>
                  {["mute", "solo"].map((key) => (
                    <button
                      key={key}
                      className={mixer[t.index]?.[key] ? "active" : ""}
                      aria-label={`${key} ${t.name}`}
                      onClick={() => {
                        const value = !mixer[t.index]?.[key];
                        setMixer((m) => ({
                          ...m,
                          [t.index]: { ...m[t.index], [key]: value },
                        }));
                        engine.current?.[
                          key === "mute" ? "changeTrackMute" : "changeTrackSolo"
                        ]([engine.current.score.tracks[t.index]], value);
                      }}
                    >
                      {key === "mute" ? "M" : "S"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
          <section>
            <h3>Personal practice notes</h3>
            <textarea
              value={note}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A fingering idea, a tricky transition…"
              rows={4}
            />
            <Button
              icon={Save}
              className="wide"
              onClick={async () => {
                try {
                  await api(`/scores/${id}/preference`, {
                    method: "PUT",
                    body: { note, speed },
                  });
                  notify("Practice notes saved.");
                } catch (e) {
                  notify(e.message, true);
                }
              }}
            >
              Save notes
            </Button>
          </section>
        </aside>
      </div>
      <footer className="transport">
        <div className="transport-buttons">
          <button
            className="icon-button"
            aria-label="Stop playback"
            disabled={!ready}
            onClick={() => engine.current?.stop()}
          >
            <Square size={15} />
          </button>
          <button
            className="play-button"
            aria-label={playing ? "Pause playback" : "Play score"}
            disabled={!ready}
            onClick={() => engine.current?.playPause()}
          >
            {playing ? (
              <Pause size={19} />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>
          <span className="transport-clock">
            {clock(position)} <small>/ {clock(duration)}</small>
          </span>
        </div>
        <div className="speed-control">
          <label>
            Speed <b>{Math.round(speed * 100)}%</b>
          </label>
          <input
            aria-label="Playback speed"
            type="range"
            min={0.25}
            max={1.5}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </div>
        <div className="loop-controls">
          <button
            className={`icon-button ${loop ? "active" : ""}`}
            aria-label="Toggle phrase loop"
            onClick={() => setLoop((x) => !x)}
          >
            <Repeat2 size={19} />
          </button>
          <label>
            Bars{" "}
            <input
              aria-label="Loop start bar"
              type="number"
              min={1}
              max={score.bars}
              value={from}
              onChange={(e) =>
                setFrom(Math.max(1, Math.min(to, Number(e.target.value))))
              }
            />
            <span>–</span>
            <input
              aria-label="Loop end bar"
              type="number"
              min={from}
              max={score.bars}
              value={to}
              onChange={(e) =>
                setTo(
                  Math.max(from, Math.min(score.bars, Number(e.target.value))),
                )
              }
            />
          </label>
          <Button
            className={metro ? "selected" : ""}
            onClick={() => setMetro((v) => !v)}
          >
            Click
          </Button>
        </div>
        <span className="player-status">
          {ready ? "Audio ready" : "Loading audio…"}
        </span>
      </footer>
      {practice && (
        <div className="practice-history">
          <h3>Your recent practice</h3>
          {records.length ? (
            records.slice(0, 6).map((r) => (
              <div key={r.id}>
                <span>{r.title}</span>
                <b>{clock(r.seconds)}</b>
                <small>
                  {Math.round(r.speed * 100)}% ·{" "}
                  {new Date(r.created).toLocaleDateString()}
                </small>
              </div>
            ))
          ) : (
            <p className="fine">Your first saved session will appear here.</p>
          )}
        </div>
      )}
      {history && (
        <Modal title="Score history" onClose={() => setHistory(null)}>
          <p>
            Restoring creates a new revision. Previous versions stay available.
          </p>
          <div className="history-list">
            {history.map((h) => (
              <div key={h.revision}>
                <span className="revision">r{h.revision}</span>
                <div>
                  <b>{h.label}</b>
                  <small>{new Date(h.created).toLocaleString()}</small>
                </div>
                <Button
                  disabled={
                    h.revision === score.revision || user.role !== "owner"
                  }
                  onClick={async () => {
                    try {
                      await api(`/scores/${id}/restore`, {
                        method: "POST",
                        body: { target: h.revision, revision: score.revision },
                      });
                      setHistory(null);
                      changed();
                      notify(`Restored revision ${h.revision}.`);
                    } catch (e) {
                      notify(e.message, true);
                    }
                  }}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
