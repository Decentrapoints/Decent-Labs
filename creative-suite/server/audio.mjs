import { fail } from "../shared/score.mjs";

// Deliberately bounded PCM analysis. This is measurement, not transcription.
export function analyzeWav(input) {
  const b = Buffer.from(input);
  if (
    b.length > 32 * 1024 * 1024 ||
    b.length < 44 ||
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 12) !== "WAVE"
  )
    fail("Upload a PCM WAV under 32 MB.");
  let fmt, data;
  for (let p = 12; p + 8 <= b.length; ) {
    const name = b.toString("ascii", p, p + 4),
      size = b.readUInt32LE(p + 4),
      start = p + 8;
    if (start + size > b.length) fail("Truncated WAV chunk.");
    if (name === "fmt " && size >= 16)
      fmt = {
        format: b.readUInt16LE(start),
        channels: b.readUInt16LE(start + 2),
        sampleRate: b.readUInt32LE(start + 4),
        align: b.readUInt16LE(start + 12),
        bits: b.readUInt16LE(start + 14),
      };
    if (name === "data") data = b.subarray(start, start + size);
    p = start + size + (size % 2);
  }
  if (!fmt || !data) fail("WAV requires fmt and data chunks.");
  const { format, channels, sampleRate, align, bits } = fmt;
  if (
    format !== 1 ||
    ![8, 16, 24, 32].includes(bits) ||
    channels < 1 ||
    channels > 8 ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    align !== (channels * bits) / 8 ||
    data.length % align
  )
    fail("Supported WAV: integer PCM, 8–32 bit, 1–8 channels, 8–192 kHz.");
  const width = bits / 8,
    frames = data.length / align;
  if (!frames) fail("WAV has no samples.");
  const stats = Array.from({ length: channels }, () => ({
    peak: 0,
    sum: 0,
    clips: 0,
  }));
  for (let f = 0; f < frames; f++)
    for (let c = 0; c < channels; c++) {
      const p = f * align + c * width;
      const value =
        bits === 8
          ? (data[p] - 128) / 128
          : bits === 16
            ? data.readInt16LE(p) / 32768
            : bits === 24
              ? data.readIntLE(p, 3) / 8388608
              : data.readInt32LE(p) / 2147483648;
      const a = Math.abs(value),
        s = stats[c];
      s.peak = Math.max(s.peak, a);
      s.sum += value * value;
      if (a >= 0.999) s.clips++;
    }
  const db = (x) => (x > 0 ? Math.round(20 * Math.log10(x) * 100) / 100 : null);
  return {
    duration: frames / sampleRate,
    sampleRate,
    bits,
    channels,
    frames,
    measurements: stats.map((s) => ({
      peakDb: db(s.peak),
      rmsDb: db(Math.sqrt(s.sum / frames)),
      clippedSamples: s.clips,
    })),
    method: "PCM sample peak and RMS; not integrated LUFS or true peak.",
  };
}
