/**
 * Procedural WebAudio SFX (spec §11 sound): impact tiers, whoosh, block knock,
 * electric zap, parry chime, throw-break clang, KO boom, announcer stingers,
 * plus a light wind/leaf ambience and a taiko-and-strings-flavored pulse loop.
 * No audio files — everything is synthesized.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceStarted = false;
  muted = false;

  /** must be called from a user gesture */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startAmbience();
  }

  private get ready(): boolean {
    return !!this.ctx && !this.muted && this.ctx.state === "running";
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private env(node: AudioNode, peak: number, attack: number, decay: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    g.connect(this.master!);
    return g;
  }

  private thump(freq: number, peak: number, decay: number, drop = 0.5): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * drop), t + decay);
    this.env(o, peak, 0.005, decay);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  private noiseBurst(
    peak: number,
    decay: number,
    filterHz: number,
    type: BiquadFilterType = "bandpass",
  ): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(decay + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterHz;
    f.Q.value = 1.2;
    src.connect(f);
    this.env(f, peak, 0.004, decay);
    src.start();
  }

  // ── combat sfx ─────────────────────────────────────────────────────────────

  whoosh(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.25);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.16);
    f.Q.value = 2.5;
    src.connect(f);
    this.env(f, 0.12, 0.02, 0.18);
    src.start();
  }

  hit(strength: number): void {
    const big = strength > 1;
    this.thump(big ? 150 : 190, big ? 0.85 : 0.5, big ? 0.22 : 0.12, 0.35);
    this.noiseBurst(big ? 0.5 : 0.3, big ? 0.14 : 0.08, big ? 900 : 1600);
  }

  counterHit(): void {
    this.thump(120, 1.0, 0.3, 0.3);
    this.noiseBurst(0.6, 0.2, 700);
  }

  block(): void {
    this.thump(300, 0.3, 0.07, 0.6);
    this.noiseBurst(0.18, 0.05, 2600);
  }

  electric(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(2800, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.22);
    const g = this.env(o, 0.35, 0.004, 0.24);
    // crackle
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.3);
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 3000;
    src.connect(f);
    this.env(f, 0.3, 0.004, 0.25);
    o.start(t);
    o.stop(t + 0.3);
    src.start();
    void g;
  }

  parry(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    for (const [freq, delay] of [
      [1320, 0],
      [1980, 0.05],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const g = ctx.createGain();
      const t = ctx.currentTime + delay;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g);
      g.connect(this.master!);
      o.start(t);
      o.stop(t + 0.45);
    }
  }

  throwBreak(): void {
    this.thump(420, 0.4, 0.1, 0.7);
    this.noiseBurst(0.4, 0.18, 3400, "highpass");
  }

  throwImpact(): void {
    this.thump(95, 0.9, 0.35, 0.4);
    this.noiseBurst(0.4, 0.2, 500);
  }

  dash(): void {
    this.noiseBurst(0.08, 0.09, 900);
  }

  step(): void {
    this.noiseBurst(0.05, 0.05, 700);
  }

  land(): void {
    this.thump(140, 0.35, 0.12, 0.4);
    this.noiseBurst(0.2, 0.1, 600);
  }

  wallSplat(): void {
    this.thump(80, 1.0, 0.4, 0.35);
    this.noiseBurst(0.55, 0.25, 400, "lowpass");
  }

  ko(): void {
    this.thump(60, 1.2, 0.9, 0.3);
    this.noiseBurst(0.6, 0.5, 300, "lowpass");
  }

  kiai(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "square";
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(140, t);
    o.frequency.linearRampToValueAtTime(220, t + 0.3);
    this.env(o, 0.12, 0.05, 0.4);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** announcer stinger: short drum accent under the text cards */
  announce(kind: "round" | "fight" | "ko" | "win"): void {
    if (!this.ready) return;
    switch (kind) {
      case "round":
        this.thump(110, 0.7, 0.5, 0.5);
        break;
      case "fight":
        this.thump(140, 0.9, 0.3, 0.6);
        this.noiseBurst(0.3, 0.2, 1200);
        break;
      case "ko":
        this.ko();
        break;
      case "win":
        this.thump(160, 0.6, 0.6, 0.8);
        break;
    }
  }

  // ── ambience ───────────────────────────────────────────────────────────────

  private startAmbience(): void {
    if (this.ambienceStarted || !this.ctx || !this.master) return;
    this.ambienceStarted = true;
    const ctx = this.ctx;

    // wind: looped filtered noise with slow LFO on the filter
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer(4);
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 400;
    wf.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0.045;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 160;
    lfo.connect(lfoG);
    lfoG.connect(wf.frequency);
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.master);
    wind.start();
    lfo.start();

    // sparse taiko pulse (arena mood, deliberately minimal)
    const beat = () => {
      if (!this.ctx) return;
      if (!this.muted && this.ctx.state === "running") {
        this.thump(72, 0.16, 0.5, 0.5);
        setTimeout(() => this.thump(72, 0.1, 0.4, 0.5), 420);
      }
      setTimeout(beat, 3400);
    };
    setTimeout(beat, 1500);
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = v;
  }
}
