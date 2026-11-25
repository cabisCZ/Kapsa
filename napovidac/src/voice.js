// Detekce řeči: pozná, kdy mluvíte VY, a odliší to od hlasu druhé strany.
//
// Jak to funguje:
//  1) Mikrofon s potlačením ozvěny (echoCancellation) – Chromium odečte zvuk,
//     který jde z reproduktorů, takže hlas druhé strany v mikrofonu skoro není.
//  2) Navíc posloucháme přímo výstup Windows (loopback). Když hraje druhá strana,
//     víme to a od mikrofonu odečteme naučený „přeslech“ z reproduktorů do mikrofonu.
//  3) Energii měříme jen v pásmu lidského hlasu (150–3800 Hz) proti adaptivní
//     hladině šumu, s náběhem (aby kliknutí/kašel nerozjel text) a dozvukem
//     (aby se text nezastavil mezi slovy).
(function () {
  const BAND_LO = 150, BAND_HI = 3800;

  function bandDb(analyser, buf, sampleRate) {
    analyser.getFloatFrequencyData(buf);
    const binHz = sampleRate / analyser.fftSize;
    const lo = Math.max(1, Math.floor(BAND_LO / binHz));
    const hi = Math.min(buf.length - 1, Math.ceil(BAND_HI / binHz));
    let p = 0;
    for (let i = lo; i <= hi; i++) p += Math.pow(10, buf[i] / 10);
    return 10 * Math.log10(p / (hi - lo + 1) + 1e-12);
  }

  function percentile(arr, q) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  }

  class VoiceDetector {
    constructor(opts) {
      this.opts = Object.assign({ sensitivity: 55, holdMs: 700, attackMs: 110, useSystemAudio: true, deviceId: '' }, opts);
      this.onUpdate = () => {};
      this.speaking = false;
      this.other = false;
      this.level = 0;
      this.micDb = -100; this.sysDb = -100;
      this.floor = -70; this.sysFloor = -90;
      this.leakSamples = [];
      this.leak = -10;
      this.meSince = 0; this.lastMe = 0;
      this.systemOk = false; this.micOk = false; this.error = '';
    }

    set(opts) { Object.assign(this.opts, opts); }

    async start() {
      this.stop();
      this.ctx = new AudioContext();
      try {
        const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 };
        if (this.opts.deviceId) audio.deviceId = { exact: this.opts.deviceId };
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
        this.micAn = this._analyser(this.micStream);
        this.micOk = true;
      } catch (e) {
        this.micOk = false; this.error = 'Mikrofon není dostupný: ' + e.message;
      }
      if (this.opts.useSystemAudio) await this._startSystem();
      this.buf = new Float32Array(this.micAn ? this.micAn.frequencyBinCount : 512);
      this.timer = setInterval(() => this._tick(), 20);
    }

    async _startSystem() {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        s.getVideoTracks().forEach(t => { t.stop(); s.removeTrack(t); });
        if (!s.getAudioTracks().length) throw new Error('bez zvuku');
        this.sysStream = s;
        this.sysAn = this._analyser(s);
        this.systemOk = true;
      } catch (e) {
        this.systemOk = false; // Bez loopbacku spoléháme jen na potlačení ozvěny.
      }
    }

    _analyser(stream) {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.55;
      src.connect(an);
      return an;
    }

    stop() {
      clearInterval(this.timer);
      for (const s of [this.micStream, this.sysStream]) if (s) s.getTracks().forEach(t => t.stop());
      this.micStream = this.sysStream = this.micAn = this.sysAn = null;
      if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
      this.speaking = false;
    }

    _tick() {
      const now = performance.now();
      const sr = this.ctx ? this.ctx.sampleRate : 48000;
      const mic = this.micAn ? bandDb(this.micAn, this.buf, sr) : -120;
      const sys = this.sysAn ? bandDb(this.sysAn, this.buf, sr) : -120;
      this.micDb = mic; this.sysDb = sys;

      // Adaptivní hladina šumu: rychle dolů, pomalu nahoru (~1,5 dB/s).
      // (Během řeči stoupá ještě pomaleji, aby se „nenaučila“ váš hlas.)
      if (mic < this.floor) this.floor += (mic - this.floor) * 0.25; else this.floor += this.speaking ? 0.006 : 0.03;
      if (sys < this.sysFloor) this.sysFloor += (sys - this.sysFloor) * 0.25; else this.sysFloor += 0.03;
      this.floor = Math.max(-110, Math.min(this.floor, -20));

      const sens = Math.max(0, Math.min(100, this.opts.sensitivity));
      const margin = 26 - sens * 0.2;           // citlivost 0 → 26 dB nad šumem, 100 → 6 dB
      const sysActive = this.systemOk && sys > Math.max(this.sysFloor + 10, -85);

      // Učíme se, kolik zvuku z reproduktorů pronikne do mikrofonu.
      if (sysActive) {
        this.leakSamples.push(mic - sys);
        if (this.leakSamples.length > 250) this.leakSamples.shift();
        if (this.leakSamples.length > 25) this.leak = percentile(this.leakSamples, 0.6);
      }

      const loudEnough = mic > this.floor + margin;
      const aboveEcho = !sysActive || mic > sys + this.leak + 9;
      const me = this.micOk && loudEnough && aboveEcho;

      if (me) { if (!this.meSince) this.meSince = now; this.lastMe = now; }
      else this.meSince = 0;

      if (!this.speaking && me && now - this.meSince >= this.opts.attackMs) this.speaking = true;
      if (this.speaking && now - this.lastMe > this.opts.holdMs) this.speaking = false;

      this.other = sysActive && !me && !this.speaking;
      const lvl = Math.max(0, Math.min(1, (mic - this.floor) / 34));
      this.level += (lvl - this.level) * 0.35;
      this.threshold = Math.max(0, Math.min(1, margin / 34));

      this.onUpdate(this);
    }
  }

  window.VoiceDetector = VoiceDetector;
})();
