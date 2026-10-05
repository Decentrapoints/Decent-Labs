import React, { useState, useEffect } from "react";
import {
  Command,
  ArrowUp,
  ChevronRight,
  Clock,
  Check,
  AudioLines,
  Sparkles,
} from "lucide-react";
import { api } from "./api";
import { Button } from "./ui";
export default function SatsuPanel({
  app,
  context,
  connections,
  prepare,
  user,
  notify,
  refreshKey,
}) {
  const [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [advice, setAdvice] = useState(null),
    [actions, setActions] = useState([]);
  const contextKey = JSON.stringify(
    app === "tabs"
      ? {
          app,
          resource: context?.id,
          revision: context?.revision,
          selection: context?.selection ?? null,
        }
      : {
          app,
          resource: connections?.reaper.project,
          revision: connections?.reaper.revision,
          relatedScore: context?.id,
          relatedRevision: context?.revision,
        },
  );
  useEffect(() => {
    let active = true;
    const update = () =>
      api("/actions")
        .then((a) => {
          if (active) setActions(a);
        })
        .catch(() => {});
    update();
    const t = setInterval(update, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [refreshKey]);
  const ask = async (p) => {
    if (app === "tabs" && !context) {
      notify("Open a score to give Satsu some context.", true);
      return;
    }
    setBusy(true);
    try {
      const result = await api("/satsu/ask", {
        method: "POST",
        body: {
          app,
          resource: context?.id,
          selection: context?.selection,
          prompt: p,
        },
      });
      setAdvice({ ...result.payload, contextKey });
      setPrompt("");
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="satsu-dock">
      <header className="satsu-header">
        <div className="satsu-glyph">
          <Command size={20} />
        </div>
        <div>
          <h2>Satsu</h2>
          <span>Your creative companion</span>
        </div>
        <span
          className={`satsu-orb ${connections?.satsu.configured ? "connected" : ""}`}
        />
      </header>
      <div className="satsu-context">
        <span className="eyebrow">WORKING CONTEXT</span>
        <div className="context-name">
          <span className="inline-dot" />
          {app === "tabs"
            ? context?.title || "Choose a score"
            : connections?.reaper.name || "REAPER awaiting bridge"}
        </div>
        <small>
          {app === "tabs"
            ? context
              ? `Revision ${context.revision} · ${context.tempo} BPM`
              : "Open a score in the workbench"
            : connections?.reaper.connected
              ? `Session revision ${connections.reaper.revision}`
              : "No live session context"}
        </small>
        {context?.selection && app === "tabs" && (
          <div className="selection-chip">
            Bar {context.selection.bar + 1} · beat {context.selection.beat + 1}
          </div>
        )}
      </div>
      <div className="satsu-body">
        <div className="satsu-intro">
          <span className="eyebrow">A CLEARER NEXT STEP</span>
          <h3>
            {app === "tabs" ? "Find the feel." : "Make space for the idea."}
          </h3>
          <p>
            {app === "tabs"
              ? "I can help you plan a focused practice session and prepare changes for review."
              : "I can help you reason about your session and keep reviewed actions in one place."}
          </p>
          <span className="mode-label">
            {connections?.satsu.configured
              ? `Model route · ${connections.satsu.model}`
              : "Local templates · model not connected"}
          </span>
        </div>
        <div className="suggestions">
          {(app === "tabs"
            ? [
                "Plan a 15-minute practice session",
                "Help me work on this phrase",
              ]
            : [
                "Suggest a focused session workflow",
                "What should I check before a mix?",
              ]
          ).map((p) => (
            <button key={p} disabled={busy} onClick={() => ask(p)}>
              {p}
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
        {advice?.contextKey === contextKey && (
          <section className="advice">
            <span className="eyebrow">
              {advice.mode === "model"
                ? "SATSU RESPONSE"
                : "LOCAL PLANNING TEMPLATE"}
            </span>
            <p>{advice.text}</p>
          </section>
        )}
        {app === "tabs" && context && user.role === "owner" && (
          <section className="quick-action">
            <span className="eyebrow">PREPARE AN ACTION</span>
            <p>Try a slower working tempo.</p>
            <Button
              className="wide"
              onClick={() =>
                prepare("tabs", context.id, {
                  type: "tempo",
                  value: Math.max(20, Math.round(context.tempo * 0.85)),
                })
              }
            >
              Review {Math.max(20, Math.round(context.tempo * 0.85))} BPM
              <ChevronRight size={15} />
            </Button>
            <small>
              Changes the score tempo. Use playback speed for practice only.
            </small>
          </section>
        )}
        <div className="action-ledger">
          <span className="eyebrow">RECENT RECEIPTS</span>
          {actions.length ? (
            actions.slice(0, 8).map((a) => (
              <div className="action-receipt" key={a.id}>
                <span className={`receipt-symbol ${a.status}`}>
                  {a.status === "applied" ? (
                    <Check size={13} />
                  ) : (
                    <Clock size={13} />
                  )}
                </span>
                <div>
                  <b>{a.description}</b>
                  <small>
                    {a.app} · {a.status}
                  </small>
                  {a.receipt?.message && <p>{a.receipt.message}</p>}
                </div>
              </div>
            ))
          ) : (
            <p className="fine">Reviewed actions will appear here.</p>
          )}
        </div>
      </div>
      <form
        className="satsu-compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim()) ask(prompt);
        }}
      >
        <label className="sr-only" htmlFor="satsu-prompt">
          Ask Satsu
        </label>
        <textarea
          id="satsu-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            app === "tabs"
              ? "Help me make this phrase feel effortless…"
              : "Help me plan my next session move…"
          }
          maxLength={4000}
          rows={3}
        />
        <div>
          <small>
            {busy ? "Thinking…" : "Advice first. You review changes."}
          </small>
          <button
            className="send-button"
            aria-label="Send to Satsu"
            disabled={busy || !prompt.trim()}
          >
            <ArrowUp size={17} />
          </button>
        </div>
      </form>
    </aside>
  );
}
