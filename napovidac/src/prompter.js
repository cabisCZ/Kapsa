(async function () {
  const $ = id => document.getElementById(id);
  const shell = $('shell'), textEl = $('text'), viewport = $('viewport');
  const MODES = { voice: 'Hlas', constant: 'Plynule', manual: 'Ručně' };

  let state = await api.getState();
  let S = state.settings;
  let y = 0;              // posun textu v px
  let v = 0;              // aktuální rychlost (plynulý rozjezd/dojezd)
  let playing = false;    // „nahráno“ – připraveno jet
  let hover = false;
  let counting = false;
  let cueTops = [];
  let lastScript = null;
  let answerMode = false, answerText = '', scriptY = 0, answerDone = true;

  // ---------- Hlas ----------
  const vd = new VoiceDetector({ sensitivity: S.sensitivity, holdMs: S.holdMs, useSystemAudio: S.useSystemAudio, deviceId: S.micDeviceId });
  let vdKey = '';
  async function ensureVoice() {
    const key = S.mode === 'voice' ? `${S.micDeviceId}|${S.useSystemAudio}` : '';
    vd.set({ sensitivity: S.sensitivity, holdMs: S.holdMs });
    if (key === vdKey) return;
    vdKey = key;
    if (!key) { vd.stop(); return; }
    vd.set({ useSystemAudio: S.useSystemAudio, deviceId: S.micDeviceId });
    await vd.start();
  }

  // ---------- Vykreslení ----------
  function apply() {
    S = state.settings;
    shell.className = S.layout === 'float' ? 'float' : 'notch';
    if (S.mirror) shell.classList.add('mirror');
    shell.style.setProperty('--fs', S.fontSize + 'px');
    shell.style.setProperty('--lh', S.lineHeight);
    shell.style.setProperty('--color', S.textColor);
    shell.style.setProperty('--op', S.opacity);
    shell.style.setProperty('--align', S.align);
    document.documentElement.style.setProperty('--op', S.opacity);
    $('speed').textContent = S.speed;
    $('bMode').textContent = MODES[S.mode] || 'Hlas';
    if (!answerMode && state.script !== lastScript) {
      lastScript = state.script;
      const r = Script.render(state.script);
      textEl.innerHTML = r.html || '<p class="note">Napište text v editoru (Ctrl+Alt+E).</p>';
    }
    requestAnimationFrame(measure);
    ensureVoice();
    ensureListener();
    classes();
  }
  function measure() {
    cueTops = [...textEl.querySelectorAll('.cue')].map(h => h.offsetTop);
  }
  const readLine = () => viewport.clientHeight * 0.36;
  // Konec = poslední řádek stojí na čtecí lince.
  const maxY = () => Math.max(0, textEl.scrollHeight - window.innerHeight * 0.7 - S.fontSize * S.lineHeight * 1.5);

  function classes() {
    const speaking = S.mode === 'voice' && vd.speaking;
    const other = S.mode === 'voice' && vd.other;
    shell.classList.toggle('playing', playing || counting);
    shell.classList.toggle('paused', !playing && !counting);
    shell.classList.toggle('hover', hover);
    shell.classList.toggle('speaking', playing && speaking);
    shell.classList.toggle('other', playing && other);
    const warn = S.mode === 'voice' && !vd.micOk && !!vdKey;
    shell.classList.toggle('warn', warn);
    shell.classList.toggle('answer', answerMode);
    shell.classList.toggle('ai', !!S.aiEnabled);
    let t = 'Pauza';
    if (warn) t = 'Mikrofon nedostupný';
    else if (counting) t = 'Připravte se';
    else if (playing && hover && S.hoverPause) t = 'Pauza (myš)';
    else if (playing && S.mode === 'voice') t = speaking ? 'Mluvíte' : other ? 'Mluví druhá strana' : 'Čekám na váš hlas';
    else if (playing) t = MODES[S.mode];
    $('chipText').textContent = t;
  }

  // ---------- Pohyb ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let target = 0;
    if (playing && !counting && !(hover && S.hoverPause)) {
      if (S.mode === 'constant') target = S.speed;
      else if (S.mode === 'voice') target = vd.speaking ? S.speed : 0;
    }
    v += (target - v) * Math.min(1, dt * (target > v ? 5 : 9));
    if (Math.abs(v) < 0.05 && target === 0) v = 0;
    y += v * dt;
    const m = maxY();
    if (y > m) { y = m; if (playing && S.mode !== 'manual' && answerDone) { playing = false; } }
    if (y < 0) y = 0;
    textEl.style.transform = `translateY(${(readLine() - y).toFixed(2)}px)`;
    $('progress').style.setProperty('--p', (m ? (y / m) * 100 : 0) + '%');
    $('beam').style.setProperty('--lvl', S.mode === 'voice' ? Math.min(1, vd.level * 1.15).toFixed(3) : (playing ? .5 : 0));
    classes();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function currentCue() {
    let idx = -1;
    for (let i = 0; i < cueTops.length; i++) if (cueTops[i] <= y + 4) idx = i;
    return idx;
  }
  let anim = null;
  function scrollTo(target) {
    target = Math.max(0, Math.min(maxY(), target));
    cancelAnimationFrame(anim);
    const from = y, start = performance.now();
    const step = t => {
      const k = Math.min(1, (t - start) / 380);
      y = from + (target - from) * (1 - Math.pow(1 - k, 3));
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // ---------- Ovládání ----------
  let cdTimer = null;
  function play() {
    if (playing || counting) return;
    if (y >= maxY() - 1) y = 0;
    const n = S.countdown | 0;
    if (n <= 0) { playing = true; return; }
    counting = true;
    let left = n;
    const cd = $('countdown');
    cd.textContent = left; cd.classList.add('on');
    cdTimer = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(cdTimer); cd.classList.remove('on'); counting = false; playing = true; }
      else cd.textContent = left;
    }, 800);
  }
  function pause() {
    clearInterval(cdTimer); counting = false; $('countdown').classList.remove('on');
    playing = false;
  }
  function toggle() { (playing || counting) ? pause() : play(); }
  function jumpCue(d) {
    measure();
    const c = currentCue();
    let i = c + d;
    if (d < 0 && c >= 0 && y - cueTops[c] > 30) i = c; // nejdřív na začátek aktuální sekce
    if (i < 0) return scrollTo(0);
    if (i >= cueTops.length) return;
    scrollTo(cueTops[i]);
  }
  function setSettings(p) { api.setState({ settings: p }); }

  api.onCmd(c => {
    switch (c.type) {
      case 'togglePlay': toggle(); break;
      case 'play': play(); break;
      case 'pause': pause(); break;
      case 'restart': pause(); scrollTo(0); break;
      case 'nextCue': jumpCue(1); break;
      case 'prevCue': jumpCue(-1); break;
      case 'jumpCue': measure(); if (cueTops[c.index] !== undefined) scrollTo(cueTops[c.index]); break;
      case 'nudge': y = Math.max(0, Math.min(maxY(), y + (c.delta || 0))); break;
      case 'closeAnswer': closeAnswer(); break;
    }
  });
  api.onState(s => { state = s; apply(); });

  // ---------- AI: poslech druhé strany a odpovědi ----------
  const tap = new LoopbackTap();
  let tapOn = false;
  async function ensureListener() {
    const want = !!S.aiEnabled;
    if (want === tapOn) return;
    tapOn = want;
    if (want) { try { await tap.start(); } catch (e) { tapOn = false; console.warn(e); } }
    else tap.stop();
  }
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function renderAnswer(thinking) {
    const paras = answerText.trim().split(/\n\s*\n/).map(p => `<p>${esc(p.trim())}</p>`).join('');
    textEl.innerHTML = paras || (thinking ? '<p class="thinking">Píšu odpověď</p>' : '');
  }
  function openAnswer(question) {
    if (!answerMode) { scriptY = y; answerMode = true; }
    answerText = ''; answerDone = false;
    $('qText').textContent = question;
    cancelAnimationFrame(anim); y = 0; v = 0;
    renderAnswer(true);
    if (!playing && !counting && S.mode !== 'manual') playing = true;   // odpověď hned připravená ke čtení
  }
  function closeAnswer() {
    if (!answerMode) return;
    answerMode = false; answerDone = true; lastScript = null;
    apply();
    y = scriptY; v = 0;
  }
  let capTimer = null;
  api.on('ai-partial', text => {
    if (!text) return;
    const c = $('caption'); c.textContent = '„' + text.slice(-90) + '“'; c.classList.add('on');
    clearTimeout(capTimer); capTimer = setTimeout(() => c.classList.remove('on'), 2500);
  });
  api.on('ai-answer', a => {
    if (a.phase === 'start') openAnswer(a.question);
    else if (a.phase === 'delta' && answerMode) { answerText += a.text; renderAnswer(false); }
    else if (a.phase === 'error' && answerMode) { answerText = a.error; answerDone = true; renderAnswer(false); }
    else if (a.phase === 'done') answerDone = true;
  });
  $('bBack').onclick = () => api.cmd('closeAnswer');
  $('bAsk').onclick = () => api.cmd('aiAnswerNow');

  $('bPlay').onclick = toggle;
  $('bRestart').onclick = () => { pause(); scrollTo(0); };
  $('bPrev').onclick = () => jumpCue(-1);
  $('bNext').onclick = () => jumpCue(1);
  $('bSlow').onclick = () => api.cmd('speedDown');
  $('bFast').onclick = () => api.cmd('speedUp');
  $('bEdit').onclick = () => api.cmd('openEditor');
  $('bHide').onclick = () => api.cmd('toggleVisible');
  $('bMode').onclick = () => {
    const order = ['voice', 'constant', 'manual'];
    setSettings({ mode: order[(order.indexOf(S.mode) + 1) % order.length] });
  };

  shell.addEventListener('mouseenter', () => { hover = true; });
  shell.addEventListener('mouseleave', () => { hover = false; });
  window.addEventListener('wheel', e => { cancelAnimationFrame(anim); y = Math.max(0, Math.min(maxY(), y + e.deltaY * 0.6)); }, { passive: true });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'Escape') api.cmd('closeAnswer');
    if (e.code === 'ArrowDown') y += 40;
    if (e.code === 'ArrowUp') y = Math.max(0, y - 40);
  });
  window.addEventListener('resize', () => requestAnimationFrame(measure));

  // Změna velikosti tažením za roh (průhledná okna ve Windows nemají okraje).
  $('resize').addEventListener('pointerdown', e => {
    e.preventDefault();
    const sx = e.screenX, sy = e.screenY, w0 = window.innerWidth, h0 = window.innerHeight;
    const notch = S.layout === 'notch';
    const el = e.target; el.setPointerCapture(e.pointerId);
    const move = ev => api.resizeTo(w0 + (ev.screenX - sx) * (notch ? 2 : 1), h0 + (ev.screenY - sy));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  });

  // Stav pro editor a ovladač v telefonu.
  setInterval(() => {
    api.sendStatus({
      playing: playing || counting, counting, mode: S.mode,
      speaking: vd.speaking, other: vd.other, level: vd.level, threshold: vd.threshold,
      micOk: vd.micOk, systemOk: vd.systemOk, voiceOn: !!vdKey, error: vd.error,
      progress: maxY() ? y / maxY() : 0, cue: answerMode ? -1 : currentCue(), answer: answerMode,
    });
  }, 100);

  apply();
})();
