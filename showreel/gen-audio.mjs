// Procedural soundtrack for reel.html — 120 BPM, A minor, 15s, hit-synced to picture.
//   node gen-audio.mjs  -> audio.wav
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100, DUR = 15, N = SR * DUR, TAU = Math.PI * 2;
const bus = () => [new Float32Array(N), new Float32Array(N)];
const drums = bus(), music = bus(), rev = bus(), dly = bus();

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;

// Chamberlin state-variable filter
function svf() {
  let lp = 0, bp = 0;
  return (x, fc, q = .7) => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR);
    lp += f * bp; const hp = x - lp - q * bp; bp += f * hp;
    return { lp, bp, hp };
  };
}

// render a voice: fn(tt) -> mono sample
function voice(t0, dur, fn, { gain = 1, pan = 0, b = music, rv = 0, dl = 0 } = {}) {
  const i0 = Math.max(0, Math.round(t0 * SR)), i1 = Math.min(N, Math.round((t0 + dur) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - t0 * SR) / SR);
    b[0][i] += v * gl; b[1][i] += v * gr;
    if (rv) { rev[0][i] += v * gl * rv; rev[1][i] += v * gr * rv; }
    if (dl) { dly[0][i] += v * gl * dl; dly[1][i] += v * gr * dl; }
  }
}

/* ---------- instruments ---------- */
const kicks = [];
function kick(t0, a = 1) {
  kicks.push(t0);
  let ph = 0;
  voice(t0, .5, tt => {
    ph += TAU * (44 + 120 * Math.exp(-tt * 32)) / SR;
    return Math.tanh(1.6 * Math.sin(ph) * Math.exp(-tt * 6.5)) + noise() * Math.exp(-tt * 320) * .35;
  }, { gain: .95 * a, b: drums });
}
function snare(t0, a = 1, rv = .25) {
  const f = svf(); let ph = 0;
  voice(t0, .35, tt => {
    ph += TAU * (190 - 30 * tt) / SR;
    return Math.sin(ph) * Math.exp(-tt * 28) * .5 + f(noise(), 4500, .9).hp * Math.exp(-tt * 15) * .8;
  }, { gain: .55 * a, b: drums, rv });
}
function clap(t0, a = 1) {
  const f = svf();
  voice(t0, .3, tt => {
    const e = tt < .03 ? (tt % .01 < .006 ? 1 : .2) : Math.exp(-(tt - .03) * 18);
    return f(noise(), 1500, .5).bp * e;
  }, { gain: .7 * a, b: drums, pan: .1, rv: .3 });
}
function hat(t0, a = 1, open = false, pan = .25) {
  const f = svf();
  voice(t0, open ? .35 : .08, tt => f(noise(), 9000, .6).hp * Math.exp(-tt * (open ? 11 : 70)), { gain: .22 * a, b: drums, pan });
}
function crash(t0, a = 1) {
  const f = svf();
  voice(t0, 1.6, tt => f(noise(), 7000, .5).hp * Math.exp(-tt * 2.6), { gain: .2 * a, b: drums, rv: .4, pan: -.1 });
}
function bass(t0, dur, m, a = 1) {
  const f = svf(), fr = mtof(m); let ph = 0;
  voice(t0, dur + .05, tt => {
    ph = (ph + fr / SR) % 1;
    const saw = 2 * ph - 1, sub = Math.sin(TAU * ph);
    const env = clamp(tt / .004) * clamp((dur + .04 - tt) / .04);
    return (f(saw, 180 + 1600 * Math.exp(-tt * 14), .5).lp * .7 + sub * .6) * env;
  }, { gain: .42 * a });
}
function pluck(t0, m, a = 1, pan = 0, dl = .35) { // Karplus-Strong
  const len = Math.round(SR / mtof(m)), buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = noise();
  let idx = 0;
  voice(t0, 1.4, () => {
    const v = buf[idx], nx = buf[(idx + 1) % len];
    buf[idx] = (v + nx) * .5 * .996; idx = (idx + 1) % len;
    return v;
  }, { gain: .3 * a, pan, rv: .25, dl });
}
function pad(t0, t1, notes, a = 1, atk = .5, rel = 1.2) {
  notes.forEach((m, n) => {
    const fr = mtof(m), f = svf(), phs = [rnd(), rnd(), rnd()], det = [1, 1.0042, .9958];
    voice(t0, t1 - t0 + rel, tt => {
      let s = 0;
      for (let k = 0; k < 3; k++) { phs[k] = (phs[k] + fr * det[k] / SR) % 1; s += 2 * phs[k] - 1; }
      const env = clamp(tt / atk) * (tt > t1 - t0 ? Math.exp(-(tt - (t1 - t0)) * 4 / rel) : 1);
      return f(s / 3, 900 + 500 * Math.sin(tt * 1.7 + n), .6).lp * env;
    }, { gain: .09 * a, pan: (n / (notes.length - 1 || 1)) * 1.2 - .6, rv: .5 });
  });
}
function riser(t0, t1, a = 1) {
  const f = svf(), d = t1 - t0; let ph = 0;
  voice(t0, d, tt => {
    const u = tt / d;
    ph += TAU * (180 * 2 ** (u * 3)) / SR;
    return (f(noise(), 300 * 2 ** (u * 5), 1.2).bp * 1.4 + Math.sin(ph) * .15) * u ** 2.2;
  }, { gain: .5 * a, rv: .3 });
}
function whoosh(t0, dur, a = 1, pan = 0, up = true) {
  const f = svf();
  voice(t0, dur, tt => {
    const u = tt / dur, fc = up ? 400 * 2 ** (u * 4.5) : 6000 * 2 ** (-u * 3.5);
    return f(noise(), fc, 1.4).bp * Math.sin(Math.PI * u) ** 2 * 1.6;
  }, { gain: .45 * a, pan, rv: .2 });
}
function impact(t0, a = 1) {
  let ph = 0; const f = svf();
  voice(t0, 2.2, tt => {
    ph += TAU * (30 + 48 * Math.exp(-tt * 3)) / SR;
    return Math.tanh(1.8 * Math.sin(ph) * Math.exp(-tt * 2)) * .9 + f(noise(), 900, .7).lp * Math.exp(-tt * 9) * 1.2;
  }, { gain: .75 * a, b: drums, rv: .45 });
}
function blip(t0, fr, a = 1, dec = 40, pan = 0, dl = .2) {
  let ph = 0;
  voice(t0, Math.min(1.2, 8 / dec), tt => { ph += TAU * fr / SR; return Math.sin(ph) * Math.exp(-tt * dec) * clamp(tt / .002); }, { gain: .3 * a, pan, rv: .2, dl });
}
function tick(t0, a = 1, pan = 0) {
  voice(t0, .03, tt => (Math.sin(TAU * 3200 * tt) * .6 + noise() * .5) * Math.exp(-tt * 180), { gain: .35 * a, pan, b: drums });
}
function thump(t0, a = 1) { // soft rubbery bounce
  let ph = 0;
  voice(t0, .35, tt => { ph += TAU * (70 + 160 * Math.exp(-tt * 40)) / SR; return Math.sin(ph) * Math.exp(-tt * 12); }, { gain: .8 * a, b: drums });
}
function wobble(t0, a = 1, dur = 1) { // pitch follows the outElastic oscillation exactly
  let ph = 0;
  voice(t0, dur, tt => {
    const x = tt / dur, osc = 2 ** (-10 * x) * Math.sin((x * 10 - .75) * TAU / 3);
    ph += TAU * 520 * (1 + .45 * osc) / SR;
    return Math.sin(ph) * Math.exp(-tt * 3.2) * clamp(tt / .003);
  }, { gain: .3 * a, pan: .2, rv: .25, dl: .25 });
}
function glitch(t0, dur, a = 1) {
  let hold = 0, f = 200, ph = 0;
  voice(t0, dur, tt => {
    if (tt >= hold) { hold = tt + .012 + rnd() * .02; f = 80 + rnd() * 1800; }
    ph = (ph + f / SR) % 1;
    const sq = ph < .5 ? 1 : -1;
    return Math.round((sq * .6 + noise() * .4) * 4) / 4 * (rnd() < .92 ? 1 : 0);
  }, { gain: .2 * a, b: drums, pan: -.2 });
}

/* ---------- arrangement ---------- */
// 0–2  squash & stretch
pad(0, 2.05, [45, 52, 55, 60, 71], .55, 1.4);
[[.5, 69, 1], [1.0, 76, .8], [1.25, 81, .55], [1.375, 84, .35]].forEach(([t, m, a]) => { thump(t, a); pluck(t, m, .9 * a + .1, .15); });
voice(1.42, .2, tt => Math.sin(TAU * (160 + 900 * tt) * tt) * (tt / .2) * .5, { gain: .12, rv: .2 }); // anticipation creak
whoosh(1.58, .26, .9, 0, true);
riser(1.7, 2.0, .9);

// 2–4  kinetic type
impact(2.0, .9); crash(2.0);
const stab = [[33, [57, 60, 64]], [33, [57, 60, 64]], [29, [53, 57, 60]], [31, [55, 59, 62]]];
stab.forEach(([b, ch], i) => {
  const t = 2 + i * .5;
  kick(t); bass(t, .42, b, 1.1);
  ch.forEach((m, k) => pluck(t + k * .008, m + 12, .55, (k - 1) * .5, .2));
  hat(t + .25, .8);
});
clap(2.5); clap(3.5);
[0, 1, 2, 3, 4].forEach(j => blip(3.66 + j * .045, mtof(76 + [0, 3, 5, 7, 10][j]), .35, 50, (j - 2) * .3));
whoosh(3.8, .22, 1, -.3, false); whoosh(3.82, .2, .8, .3, false);

// 4–6  systems groove
const bl = [33, 33, 45, 33, 36, 36, 31, 43];
for (let k = 0; k < 8; k++) { const t = 4 + k * .25; bass(t, .2, bl[k], .9); }
for (let k = 0; k < 4; k++) kick(4 + k * .5);
clap(4.5); clap(5.5, 1.1);
for (let k = 0; k < 16; k++) hat(4 + k * .125, k % 2 ? 1 : .55, k === 14, k % 2 ? .3 : -.2);
const arps = [[69, 72, 76, 81], [72, 76, 79, 84], [76, 79, 83, 88], [81, 84, 88, 93]];
arps.forEach((a, w) => a.forEach((m, k) => pluck(4 + w * .5 + k * .0625, m, .5, (k - 1.5) * .4, .4)));
riser(5.55, 6.0, .8); whoosh(5.62, .38, .7, 0, true);

// 6–9  particles
impact(6.0, 1); crash(6.0, .9); kick(6.0);
pad(6.0, 7.2, [45, 52, 55, 60, 71], 1, .25);
pad(7.2, 8.0, [41, 48, 52, 57, 59], 1, .2);
pad(8.0, 9.0, [36, 43, 47, 50, 52], 1, .15, .5);
[6.75, 7.25, 8.0, 8.5].forEach(t => kick(t, .9));
snare(7.0, 1, .4); snare(8.5, .8, .4);
for (let k = 0; k < 24; k++) hat(6 + k * .125, k % 2 ? .6 : .3, false, k % 2 ? .35 : -.35);
const chordAt = t => t < 7.2 ? [69, 72, 76, 79, 83] : t < 8 ? [65, 69, 72, 76, 71] : [72, 76, 79, 74, 83];
for (let k = 0; k < 20; k++) { const t = 6.25 + k * .125; const c = chordAt(t); blip(t, mtof(c[k % 5] + 12), .25, 22, Math.sin(k) * .7, .45); }
[[6, 33], [7.2, 29], [8, 36]].forEach(([t, m]) => bass(t, t === 8 ? .7 : 1.1, m, .8));
whoosh(7.15, .5, .5, .4, true);
impact(8.0, .55); crash(8.0, .6);
[0, 1, 2].forEach(k => pluck(8.0 + k * .01, [60, 64, 67][k] + 12, .6, (k - 1) * .5));
riser(8.6, 9.0, .9); whoosh(8.74, .26, .9, 0, false);

// 9–11  timing
kick(9.0); crash(9.0, .5);
for (let k = 1; k < 4; k++) kick(9 + k * .5, .75);
kick(10.5, .75);
for (let k = 0; k < 16; k++) hat(9 + k * .125, k % 2 ? .7 : .3);
[[9, 33, .45], [9.5, 33, .2], [10, 36, .45], [10.5, 31, .4]].forEach(([t, m, d]) => bass(t, d, m, .75));
tick(9.3, 1, -.4); tick(9.3, .8, .4); blip(9.3, 1760, .3, 60);
wobble(9.3, 1);                                   // elastic lane, forward
thump(10.3, .6); blip(10.3, 880, .45, 25, -.3);    // linear + ease arrive
whoosh(10.38, .5, .6, .3, false);
wobble(10.42, .6, .5);                            // elastic lane, return
riser(10.7, 11.0, .7);

// 11–13  cuts
for (let k = 0; k < 8; k++) { const t = 11 + k * .25; kick(t, k % 2 ? .75 : 1); hat(t + .125, .8); bass(t, .2, [33, 45, 33, 43, 36, 48, 31, 43][k], .85); }
crash(11.0, .8);                                                       // a  burst
blip(11.25, 1320, .5, 9, -.3, .35); blip(11.25, 1980, .3, 12, .3);    // b  rings
for (let k = 0; k < 6; k++) blip(11.5 + k * .04, mtof(84 + [0, 7, 3, 10, 5, 12][k]), .3, 60, (k - 2.5) * .3); // c  halftone
whoosh(11.72, .3, .9, 0, true); snare(11.75, .9);                     // d  stripes
for (let k = 0; k < 14; k++) tick(12 + .2 * (1 - (1 - k / 14) ** 2), .55, .3 * Math.sin(k)); blip(12.2, 1568, .5, 14, 0, .4); // e  counter
voice(12.25, .25, tt => Math.sin(TAU * (300 + 2400 * tt) * tt) * Math.sin(Math.PI * tt / .25), { gain: .1, rv: .3 }); // f  spiral
glitch(12.5, .24, 1); snare(12.5, .7, .1);                            // g  glitch
for (let k = 0; k < 10; k++) tick(12.75 + k * .018, .4, (k / 9) * 1.4 - .7); // h  checker
riser(12.1, 13.0, 1.1);

// 13–15  identity
impact(13.0, 1.1); crash(13.0, 1); kick(13.0, 1.1);
pad(13.0, 14.6, [45, 52, 59, 60, 64, 69], 1.3, .08, 1.6);
bass(13.0, 1.6, 33, .9);
[0, 1, 2, 3, 4, 5].forEach(j => blip(13.12 + j * .048, mtof(81 + [0, 2, 3, 7, 10, 12][j]), .28, 45, (j - 2.5) * .25));
whoosh(13.45, .3, .4, .2, false);
[[13.75, 81, 1], [13.95, 88, .6], [14.05, 93, .35]].forEach(([t, m, a]) => { thump(t, .6 * a); pluck(t, m, .8 * a, .2, .45); });
blip(14.42, 110, .9, 9, 0, 0); blip(14.6, 110, .6, 11, 0, 0);       // heartbeat

/* ---------- mixing ---------- */
// sidechain duck on music from kicks
kicks.sort((a, b) => a - b);
let ki = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  while (ki < kicks.length - 1 && kicks[ki + 1] <= t) ki++;
  const d = kicks[ki] <= t ? t - kicks[ki] : 9;
  const g = 1 - .5 * Math.exp(-d * 9);
  music[0][i] *= g; music[1][i] *= g;
}
// ping-pong delay (dotted 8th = 0.375s)
const D = Math.round(.375 * SR);
for (let i = D; i < N; i++) { dly[0][i] += dly[1][i - D] * .38; dly[1][i] += dly[0][i - D] * .38; }
// Schroeder reverb
function reverb(x, off) {
  const y = new Float32Array(N);
  for (const [len, fb] of [[1557, .84], [1617, .84], [1491, .83], [1422, .83], [1277, .82], [1356, .82]]) {
    const L = len + off, buf = new Float32Array(L); let p = 0, lp = 0;
    for (let i = 0; i < N; i++) { const o = buf[p]; lp = o * .7 + lp * .3; buf[p] = x[i] + lp * fb; y[i] += o; p = (p + 1) % L; }
  }
  for (const len of [225, 556, 441]) {
    const L = len + off, buf = new Float32Array(L); let p = 0;
    for (let i = 0; i < N; i++) { const b = buf[p], v = -y[i] * .5 + b; buf[p] = y[i] + b * .5; y[i] = v; p = (p + 1) % L; }
  }
  return y;
}
const rvL = reverb(rev[0], 0), rvR = reverb(rev[1], 23);
const outL = new Float32Array(N), outR = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = clamp((DUR - t) / .35) * clamp(t / .01);
  let l = drums[0][i] + music[0][i] + rvL[i] * .12 + dly[0][i] * .5;
  let r = drums[1][i] + music[1][i] + rvR[i] * .12 + dly[1][i] * .5;
  l = Math.tanh(l * 1.15) * fade; r = Math.tanh(r * 1.15) * fade;
  outL[i] = l; outR[i] = r; peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const norm = .93 / peak;
const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  wav.writeInt16LE(Math.round(clamp(outL[i] * norm, -1, 1) * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(clamp(outR[i] * norm, -1, 1) * 32767), 46 + i * 4);
}
const outFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audio.wav');
fs.writeFileSync(outFile, wav);
console.log(`wrote ${outFile} (peak ${peak.toFixed(2)} -> normalised)`);
