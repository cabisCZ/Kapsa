(async function () {
  const $ = id => document.getElementById(id);
  const COLORS = ['#ffffff', '#dfe7ff', '#a9c1ff', '#fff3c4', '#b8f5c8'];
  let state = await api.getState();
  let S = state.settings;
  const ta = $('script');

  // ---------- Scénář ----------
  ta.value = state.script;
  let t = null;
  ta.addEventListener('input', () => {
    clearTimeout(t);
    $('saved').classList.remove('on');
    t = setTimeout(() => { api.setState({ script: ta.value }); $('saved').classList.add('on'); }, 300);
    renderCues(); stats();
  });
  function stats() {
    const words = (ta.value.replace(/^#.*$/gm, '').replace(/\[[^\]]*\]/g, '').match(/\S+/g) || []).length;
    const min = words / 140;
    const mm = Math.floor(min), ss = Math.round((min - mm) * 60);
    $('stats').textContent = `${words} slov · cca ${mm}:${String(ss).padStart(2, '0')} min mluvení`;
  }
  let cueIdx = -1;
  function renderCues() {
    const { cues } = Script.parse(ta.value);
    $('cueList').innerHTML = cues.length
      ? cues.map((c, i) => `<li data-i="${i}" class="${i === cueIdx ? 'on' : ''}">${c.replace(/</g, '&lt;')}</li>`).join('')
      : '<li style="pointer-events:none;color:var(--muted)">Zatím žádné</li>';
  }
  $('cueList').addEventListener('click', e => {
    const li = e.target.closest('li[data-i]');
    if (li) api.cmd('jumpCue', { index: +li.dataset.i });
  });

  // ---------- Nastavení ----------
  const set = p => api.setState({ settings: p });
  function fill() {
    document.querySelectorAll('input[type=range][data-key]').forEach(el => { el.value = S[el.dataset.key]; });
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(el => { el.checked = !!S[el.dataset.key]; });
    document.querySelectorAll('.seg[data-key]').forEach(seg => {
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === S[seg.dataset.key]));
    });
    document.querySelectorAll('output[data-out]').forEach(o => {
      const v = S[o.dataset.out];
      o.textContent = o.hasAttribute('data-pct') ? Math.round(v * 100) + ' %' : v + (o.dataset.suffix || '');
    });
    $('colors').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === S.textColor));
    $('mic').value = S.micDeviceId || '';
    $('voiceGroup').style.opacity = S.mode === 'voice' ? 1 : .45;
    $('modeHint').textContent = {
      voice: 'Text jede, jen když mluvíte vy. Když přestanete nebo mluví druhá strana, zastaví se.',
      constant: 'Text jede stálou rychlostí, dokud ho nepozastavíte.',
      manual: 'Text posouváte kolečkem myši nebo z telefonu.',
    }[S.mode];
  }
  document.querySelectorAll('input[type=range][data-key]').forEach(el => {
    el.addEventListener('input', () => set({ [el.dataset.key]: +el.value }));
  });
  document.querySelectorAll('input[type=checkbox][data-key]').forEach(el => {
    el.addEventListener('change', () => set({ [el.dataset.key]: el.checked }));
  });
  document.querySelectorAll('.seg[data-key]').forEach(seg => {
    seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) set({ [seg.dataset.key]: b.dataset.v }); });
  });
  $('colors').innerHTML = COLORS.map(c => `<button data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
  $('colors').addEventListener('click', e => { const b = e.target.closest('button'); if (b) set({ textColor: b.dataset.c }); });
  $('mic').addEventListener('change', () => set({ micDeviceId: $('mic').value }));

  async function listMics() {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      $('mic').innerHTML = '<option value="">Výchozí mikrofon</option>' +
        devs.map((d, i) => `<option value="${d.deviceId}">${(d.label || 'Mikrofon ' + (i + 1)).replace(/</g, '&lt;')}</option>`).join('');
      $('mic').value = S.micDeviceId || '';
    } catch {}
  }
  navigator.mediaDevices.addEventListener('devicechange', listMics);
  // Popisky zařízení jsou dostupné až po povolení mikrofonu.
  navigator.mediaDevices.getUserMedia({ audio: true }).then(s => { s.getTracks().forEach(t => t.stop()); listMics(); }).catch(listMics);

  // ---------- Živý stav ----------
  api.onStatus(st => {
    const live = $('live');
    live.classList.toggle('speaking', st.playing && st.speaking);
    live.classList.toggle('other', st.other);
    live.classList.toggle('warn', st.voiceOn && !st.micOk);
    let txt = st.playing ? 'Běží' : 'Pauza';
    if (st.mode === 'voice' && st.voiceOn) {
      if (!st.micOk) txt = 'Mikrofon nedostupný';
      else if (st.speaking) txt = st.playing ? 'Mluvíte, text jede' : 'Slyším vás';
      else if (st.other) txt = 'Mluví druhá strana';
      else txt = st.playing ? 'Čekám na váš hlas' : 'Pauza';
    }
    $('liveText').textContent = txt;
    $('meterFill').style.width = Math.round((st.level || 0) * 100) + '%';
    $('meterThr').style.left = Math.round((st.threshold || .5) * 100) + '%';
    $('meterThr').style.display = st.mode === 'voice' ? '' : 'none';
    $('hPlayText').textContent = st.playing ? 'Pauza' : 'Spustit';
    if (st.cue !== cueIdx) { cueIdx = st.cue; renderCues(); }
    $('sysHint').innerHTML = !S.useSystemAudio
      ? 'Vypnuto: rozlišení druhé strany jen přes potlačení ozvěny mikrofonu. Doporučeno se sluchátky.'
      : st.systemOk
        ? '<span class="ok">● Poslouchám zvuk hovoru.</span> Když mluví druhá strana, text stojí. Nejspolehlivější je to se sluchátky.'
        : '<span class="bad">● Zvuk systému se nepodařilo zachytit.</span> Pomáhá aspoň potlačení ozvěny; se sluchátky to funguje dobře i tak.';
  });

  $('hPlay').onclick = () => api.cmd('togglePlay');
  $('hRestart').onclick = () => api.cmd('restart');
  $('hShow').onclick = () => api.cmd('toggleVisible');

  // ---------- Ovladač v telefonu ----------
  function renderRemote(info) {
    const box = $('remoteBox');
    if (!S.remoteEnabled) { box.innerHTML = '<p class="hint">Zapněte a naskenujte QR kód fotoaparátem v iPhonu. Telefon i počítač musí být na stejné Wi-Fi.</p>'; return; }
    if (!info || !info.enabled) { box.innerHTML = '<p class="hint bad">Ovladač se nepodařilo spustit (port je obsazený?).</p>'; return; }
    const url = info.urls[0];
    if (!url) { box.innerHTML = '<p class="hint bad">Počítač není připojený k žádné síti.</p>'; return; }
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    box.innerHTML = `<div class="qr">${q.createSvgTag({ cellSize: 4, margin: 0, scalable: true })}</div>
      <div>${info.urls.map(u => `<a href="${u}" target="_blank">${u}</a>`).join('<br>')}</div>
      <p class="hint">Při prvním spuštění Windows nabídne povolení ve firewallu: zvolte „Soukromé sítě“.</p>`;
  }
  api.onRemoteInfo(renderRemote);

  api.onState(s => {
    const remoteChanged = s.settings.remoteEnabled !== S.remoteEnabled;
    state = s; S = s.settings; fill();
    if (s.script !== ta.value && document.activeElement !== ta) { ta.value = s.script; renderCues(); stats(); }
    if (remoteChanged) api.remoteInfo().then(renderRemote);
  });

  fill(); renderCues(); stats();
  api.remoteInfo().then(renderRemote);
})();
