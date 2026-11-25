// Zachytí zvuk z reproduktorů (= hlas druhé strany), převede na 16 kHz PCM
// a posílá ho hlavnímu procesu k přepisu. Nic se nepřehrává zpět.
(function () {
  class LoopbackTap {
    async start() {
      this.stop();
      const s = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      s.getVideoTracks().forEach(t => { t.stop(); s.removeTrack(t); });
      if (!s.getAudioTracks().length) throw new Error('Zvuk systému není k dispozici');
      this.stream = s;
      this.ctx = new AudioContext({ sampleRate: 16000 });
      const src = this.ctx.createMediaStreamSource(s);
      const proc = this.ctx.createScriptProcessor(4096, 1, 1);
      const mute = this.ctx.createGain(); mute.gain.value = 0;   // procesor musí být zapojený, ale nesmí hrát
      proc.onaudioprocess = e => {
        const f = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
        api.aiAudio(pcm.buffer);
      };
      src.connect(proc); proc.connect(mute); mute.connect(this.ctx.destination);
      this.proc = proc;
    }
    stop() {
      if (this.proc) this.proc.onaudioprocess = null;
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.ctx) this.ctx.close().catch(() => {});
      this.stream = this.ctx = this.proc = null;
    }
  }
  window.LoopbackTap = LoopbackTap;
})();
