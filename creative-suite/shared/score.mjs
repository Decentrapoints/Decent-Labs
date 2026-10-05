import * as alphaTab from "@coderline/alphatab";

const { JsonConverter, Automation } = alphaTab.model;
alphaTab.Logger.logLevel = alphaTab.LogLevel.None;
export const encodeScore = (score) => JsonConverter.scoreToJson(score);
export const decodeScore = (source) => JsonConverter.jsonToScore(source);
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { statusCode: status });
}
export function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max)
    fail(`${label} must be ${min}–${max}`);
  return value;
}
export function validateScore(score) {
  if (!score?.tracks?.length || !score.masterBars.length)
    fail("The file contains no playable score.");
  if (score.tracks.length > 32 || score.masterBars.length > 2000)
    fail("Limit: 32 tracks and 2,000 bars per score.");
  let beats = 0;
  for (const track of score.tracks)
    for (const staff of track.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats) {
            beats++;
            if (beats > 100000 || beat.notes.length > 32)
              fail("Score exceeds the notation complexity limit.");
          }
  return score;
}
export function importScore(bytes) {
  if (bytes.byteLength > 8 * 1024 * 1024)
    fail("Score files must be under 8 MB.");
  try {
    const first = new TextDecoder().decode(bytes.subarray(0, 32)).trimStart();
    return validateScore(
      first.startsWith("{")
        ? decodeScore(new TextDecoder().decode(bytes))
        : alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes),
    );
  } catch (e) {
    if (e.statusCode) throw e;
    fail("Could not read this score. Try Guitar Pro, MusicXML, or AlphaTex.");
  }
}
export function summary(source) {
  const s = decodeScore(source);
  return {
    title: s.title || "Untitled score",
    artist: s.artist || "Your collection",
    tempo: s.tempo,
    bars: s.masterBars.length,
    tracks: s.tracks.map((t) => ({
      index: t.index,
      name: t.name || `Track ${t.index + 1}`,
      tuning: t.staves[0]?.tuning || [],
      program: t.playbackInfo.program,
    })),
    sections: s.masterBars
      .filter((b) => b.section)
      .map((b) => ({ bar: b.index + 1, name: b.section.text })),
  };
}
export function editScore(source, operation) {
  if (!operation || typeof operation !== "object")
    fail("Score operation required");
  const score = decodeScore(source);
  if (operation.type === "metadata") {
    for (const key of ["title", "artist", "album"])
      if (operation[key] !== undefined) {
        if (typeof operation[key] !== "string" || operation[key].length > 160)
          fail(`Invalid ${key}`);
        score[key] = operation[key].trim();
      }
  } else if (operation.type === "tempo") {
    const value = integer(operation.value, 20, 300, "Tempo");
    const bar = integer(
      operation.bar ?? 0,
      0,
      score.masterBars.length - 1,
      "Bar",
    );
    score.masterBars[bar].tempoAutomations = [
      Automation.buildTempoAutomation(false, 0, value, 2),
    ];
  } else if (operation.type === "note") {
    const {
      track = 0,
      staff = 0,
      bar = 0,
      voice = 0,
      beat = 0,
      note = 0,
    } = operation;
    for (const [key, val] of Object.entries({
      track,
      staff,
      bar,
      voice,
      beat,
      note,
    }))
      integer(val, 0, 100000, key);
    const target =
      score.tracks[track]?.staves[staff]?.bars[bar]?.voices[voice]?.beats[beat]
        ?.notes[note];
    if (!target || !target.isStringed) fail("Select an existing fretted note.");
    target.fret = integer(operation.fret, 0, 36, "Fret");
    if (operation.string !== undefined)
      target.string = integer(
        operation.string,
        1,
        target.beat.voice.bar.staff.tuning.length,
        "String",
      );
  } else fail("Unsupported score operation");
  score.finish(new alphaTab.Settings());
  return encodeScore(validateScore(score));
}
export function exportScore(source, format) {
  const score = decodeScore(source);
  if (format === "gp") return new alphaTab.exporter.Gp7Exporter().export(score);
  if (format === "alphatex")
    return new alphaTab.exporter.AlphaTexExporter().export(score);
  if (format === "json") return new TextEncoder().encode(source);
  if (format === "mid") {
    const midi = new alphaTab.midi.MidiFile();
    midi.format = alphaTab.midi.MidiFileFormat.MultiTrack;
    new alphaTab.midi.MidiFileGenerator(
      score,
      new alphaTab.Settings(),
      new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true),
    ).generate();
    return midi.toBinary();
  }
  fail("Supported exports: gp, alphatex, json, mid");
}
export function seedScores() {
  return [
    {
      title: "Glass",
      tempo: 92,
      riff: "0.6.8 3.5.8 5.4.8 7.3.8 5.4.8 3.5.8 0.6.8 3.5.8",
      second: "5.6.8 7.5.8 9.4.8 7.3.8 9.4.8 7.5.8 5.6.8 7.5.8",
    },
    {
      title: "Night signal",
      tempo: 112,
      riff: "0.6.4 2.5.4 4.4.4 2.5.4",
      second: "3.6.4 5.5.4 7.4.4 5.5.4",
    },
    {
      title: "Stillwater",
      tempo: 76,
      riff: "0.5.4 2.4.4 4.3.4 0.2.4",
      second: "3.5.4 2.4.4 0.3.4 1.2.4",
    },
  ].map((p, index) => {
    const bars = Array.from(
      { length: 16 },
      (_, i) =>
        `${i === 0 ? '\\section "A" "Verse" ' : i === 8 ? '\\section "B" "Lift" ' : ""}${i < 8 ? p.riff : p.second}`,
    ).join(" | ");
    const tex = `\\title "${p.title}" \\artist "DLS Originals" \\tempo ${p.tempo} \\instrument 25 . ${bars}`;
    return {
      id: `demo-${index + 1}`,
      source: encodeScore(importScore(new TextEncoder().encode(tex))),
    };
  });
}
