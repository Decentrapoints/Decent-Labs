import React, { useState, useEffect, useRef } from "react";
import {
  AudioLines,
  Play,
  Pause,
  Square,
  Upload,
  Plug,
  Activity,
  Flag,
  Repeat2,
  SlidersHorizontal,
} from "lucide-react";
import { api, upload, clock } from "./api";
import { Button } from "./ui";

export default function Studio({
  connections,
  refreshConnections,
  artifacts,
  refresh,
  prepare,
  notify,
  user,
}) {
  const context = connections?.reaper,
    [selected, setSelected] = useState(null),
    [volume, setVolume] = useState(1),
    [loopStart, setLoopStart] = useState(0),
    [loopEnd, setLoopEnd] = useState(8),
    [marker, setMarker] = useState("New idea"),
    [busy, setBusy] = useState(false),
    input = useRef();
  useEffect(() => {
    const timer = setInterval(() => refreshConnections().catch(() => {}), 1500);
    return () => clearInterval(timer);
  }, []);
  const tracks = context?.tracks || [],
    current = tracks.find((t) => t.id === selected);
  const reviewsDisabled = !context?.connected || user.role !== "owner";
  const audio = artifacts.filter((a) => a.kind === "audio-analysis");
  const handoffs = artifacts.filter((a) => a.kind === "score-handoff");
  return (
    <div className="studio-workspace">
      <StudioHandoffs handoffs={handoffs} />
      <div className="page-heading studio-heading">
        <div>
          <span className="eyebrow">SATSU AUDIO / REAPER COMPANION</span>
          <h1>
            {context?.connected ? context.name : "A little more headroom."}
          </h1>
          <p>
            {context?.connected
              ? `${tracks.length} tracks · ${context.tempo?.toFixed(1)} BPM · revision ${context.revision}`
              : "A calm control surface for your session, your audio, and your next decision."}
          </p>
        </div>
        <span className={`status ${context?.connected ? "" : "quiet"}`}>
          <i />
          {context?.connected ? "Live REAPER context" : "No session connected"}
        </span>
      </div>
      <div className="studio-top-metrics">
        <div>
          <span>PLAY POSITION</span>
          <strong>{clock(context?.position || 0)}</strong>
        </div>
        <div>
          <span>SESSION TEMPO</span>
          <strong>
            {context?.tempo?.toFixed(1) || "—"}
            <small> BPM</small>
          </strong>
        </div>
        <div>
          <span>TRACKS</span>
          <strong>{tracks.length.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>CONTROL MODE</span>
          <strong className="metric-text">Review → Apply</strong>
        </div>
      </div>
      <section className="session-panel panel">
        <header className="panel-heading">
          <div>
            <AudioLines size={18} />
            <h2>Session overview</h2>
          </div>
          <span className="fine">Native REAPER audio clock</span>
        </header>
        {context?.connected ? (
          <div className="track-table">
            <div className="track-table-head">
              <span>TRACK</span>
              <span>LEVEL</span>
              <span>STATE</span>
              <span>FX</span>
            </div>
            {tracks.map((t, i) => (
              <button
                key={t.id}
                className={`session-track ${selected === t.id ? "selected" : ""}`}
                onClick={() => {
                  setSelected(t.id);
                  setVolume(t.volume);
                }}
              >
                <span>
                  <i className={`track-dot track-${i % 3}`} />
                  <small>{String(t.number).padStart(2, "0")}</small>
                  <b>{t.name}</b>
                </span>
                <div className="stereo-meter">
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(0, t.peakLeft) * 100)}%`,
                    }}
                  />
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(0, t.peakRight) * 100)}%`,
                    }}
                  />
                </div>
                <span>
                  <em className={t.mute ? "active" : ""}>M</em>
                  <em className={t.solo ? "active" : ""}>S</em>
                </span>
                <span className="fine">{t.fxCount}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="session-empty">
            <div className="empty-spectrum">
              {Array.from({ length: 36 }, (_, i) => (
                <i
                  key={i}
                  style={{ height: `${12 + (Math.sin(i * 0.58) + 1) * 28}px` }}
                />
              ))}
            </div>
            <h2>Your session, in focus.</h2>
            <p>
              Start the DLS bridge in REAPER to see your real tracks,
              <br />
              meters, tempo and transport here.
            </p>
            <code>reaper/DLS_Satsu_Bridge.lua</code>
            <Button
              icon={Plug}
              onClick={() =>
                refreshConnections().catch((e) => notify(e.message, true))
              }
            >
              Check bridge
            </Button>
            <small>
              The shape above is decorative. No live audio is connected.
            </small>
          </div>
        )}
        <div className="studio-transport">
          <div className="transport-buttons">
            <Button
              icon={Play}
              disabled={reviewsDisabled}
              onClick={() =>
                prepare("studio", context.project, { type: "play" })
              }
            >
              Play
            </Button>
            <Button
              icon={Pause}
              disabled={reviewsDisabled}
              onClick={() =>
                prepare("studio", context.project, { type: "pause" })
              }
            >
              Pause
            </Button>
            <Button
              icon={Square}
              disabled={reviewsDisabled}
              onClick={() =>
                prepare("studio", context.project, { type: "stop" })
              }
            >
              Stop
            </Button>
          </div>
          <span className="fine">
            Prepare a command, then review its target.
          </span>
        </div>
      </section>
      <div className="studio-detail-grid">
        <section className="panel">
          <header className="panel-heading">
            <div>
              <SlidersHorizontal size={17} />
              <h2>Track inspector</h2>
            </div>
          </header>
          <h3>{current?.name || "Choose a track"}</h3>
          <p className="fine">
            {current
              ? "Changes are executed by the REAPER bridge."
              : "Track controls become available with a connected session."}
          </p>
          <div className="track-controls">
            <Button
              disabled={reviewsDisabled || !current}
              className={current?.mute ? "selected" : ""}
              onClick={() =>
                prepare("studio", context.project, {
                  type: "mute",
                  track: current.id,
                  value: !current.mute,
                })
              }
            >
              Mute
            </Button>
            <Button
              disabled={reviewsDisabled || !current}
              className={current?.solo ? "selected" : ""}
              onClick={() =>
                prepare("studio", context.project, {
                  type: "solo",
                  track: current.id,
                  value: !current.solo,
                })
              }
            >
              Solo
            </Button>
          </div>
          <label className="gain-slider">
            Gain{" "}
            <b>{volume > 0 ? (20 * Math.log10(volume)).toFixed(1) : "−∞"} dB</b>
            <input
              aria-label="Selected track gain"
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              disabled={!current}
            />
          </label>
          <Button
            className="wide"
            disabled={reviewsDisabled || !current}
            onClick={() =>
              prepare("studio", context.project, {
                type: "volume",
                track: current.id,
                value: volume,
              })
            }
          >
            Review gain change
          </Button>
        </section>
        <section className="panel">
          <header className="panel-heading">
            <div>
              <Repeat2 size={17} />
              <h2>Phrase & markers</h2>
            </div>
          </header>
          <div className="field-row">
            <label>
              Loop start (s)
              <input
                type="number"
                min={0}
                step={0.1}
                value={loopStart}
                onChange={(e) => setLoopStart(Number(e.target.value))}
              />
            </label>
            <label>
              Loop end (s)
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={loopEnd}
                onChange={(e) => setLoopEnd(Number(e.target.value))}
              />
            </label>
          </div>
          <Button
            className="wide"
            disabled={reviewsDisabled}
            onClick={() =>
              prepare("studio", context.project, {
                type: "loop",
                start: loopStart,
                end: loopEnd,
              })
            }
          >
            Review loop range
          </Button>
          <label className="marker-input">
            Marker name
            <input
              value={marker}
              onChange={(e) => setMarker(e.target.value)}
              maxLength={80}
            />
          </label>
          <Button
            icon={Flag}
            className="wide"
            disabled={reviewsDisabled}
            onClick={() =>
              prepare("studio", context.project, {
                type: "marker",
                name: marker,
                position: context.position || 0,
              })
            }
          >
            Mark current position
          </Button>
        </section>
      </div>
      <section className="panel audio-analysis">
        <header className="panel-heading">
          <div>
            <Activity size={18} />
            <h2>Audio workbench</h2>
          </div>
          <Button
            icon={Upload}
            disabled={busy || user.role !== "owner"}
            onClick={() => input.current.click()}
          >
            {busy ? "Measuring…" : "Analyze WAV"}
          </Button>
          <input
            type="file"
            hidden
            ref={input}
            accept=".wav"
            onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              setBusy(true);
              try {
                await upload("/audio/analyze", file);
                await refresh();
                notify("WAV measurement saved.");
              } catch (e) {
                notify(e.message, true);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </header>
        <p className="fine">
          Local PCM measurement · files up to 32 MB · audio stays on this host
        </p>
        {!audio.length ? (
          <div className="audio-empty">
            <AudioLines size={32} />
            <div>
              <h3>Hear it. Then measure it.</h3>
              <p>
                Upload a stem to inspect sample peaks, RMS and clipping.
                <br />
                No transcription or loudness normalization is claimed.
              </p>
            </div>
          </div>
        ) : (
          <div className="audio-results">
            {audio.map((a) => (
              <article key={a.id}>
                <div className="audio-file-heading">
                  <AudioLines size={18} />
                  <h3>{a.name}</h3>
                  <span>
                    {clock(a.payload.duration)} · {a.payload.sampleRate / 1000}{" "}
                    kHz · {a.payload.bits}-bit
                  </span>
                </div>
                <div className="channel-metrics">
                  {a.payload.measurements.map((m, i) => (
                    <div key={i}>
                      <span>CHANNEL {i + 1}</span>
                      <strong>
                        {m.peakDb ?? "−∞"}
                        <small> dBFS peak</small>
                      </strong>
                      <p>
                        {m.rmsDb ?? "−∞"} dBFS RMS · {m.clippedSamples}{" "}
                        near-full-scale samples
                      </p>
                    </div>
                  ))}
                </div>
                <p className="fine">{a.payload.method}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
function StudioHandoffs({ handoffs }) {
  if (!handoffs.length) return null;
  return (
    <section className="panel handoff-panel">
      <span className="eyebrow">FROM YOUR SONGBOOK</span>
      {handoffs.slice(0, 3).map((a) => (
        <div key={a.id}>
          <div>
            <h3>{a.name}</h3>
            <p>
              Tabs revision {a.payload.revision} · {a.payload.summary.tempo} BPM
              · import this MIDI in REAPER.
            </p>
          </div>
          <a className="button" href={`/api/artifacts/${a.id}/midi`}>
            Download MIDI
          </a>
        </div>
      ))}
    </section>
  );
}
