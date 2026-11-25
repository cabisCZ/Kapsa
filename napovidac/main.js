// Napovídač: teleprompter pro Windows, který není vidět při sdílení obrazovky
// a posouvá text jen tehdy, když mluvíte vy.
const { app, BrowserWindow, ipcMain, globalShortcut, screen, Tray, Menu,
  nativeImage, session, desktopCapturer, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { createAI } = require('./ai');

if (!app.requestSingleInstanceLock()) { app.quit(); }

const STATE_FILE = () => path.join(app.getPath('userData'), 'napovidac.json');

const DEFAULT_SCRIPT = `# Úvod
Dobrý den, děkuji, že jste si našli čas. Dnes vám krátce ukážu, co pro vás můžeme udělat.

# Hlavní body
Za prvé: ušetříme vám čas. Za druhé: všechno máte na jednom místě. Za třetí: cena je předem jasná a bez překvapení.

# Otázky
Co je pro vás teď nejdůležitější? Kdy byste chtěli začít?

# Závěr
Pošlu vám shrnutí e-mailem a domluvíme další krok. Děkuji a hezký den.`;

const DEFAULTS = {
  script: DEFAULT_SCRIPT,
  notes: '',                  // podklady pro AI odpovědi (ceník, FAQ, fakta)
  settings: {
    mode: 'voice',            // voice | constant | manual
    speed: 40,                // px za sekundu
    fontSize: 30,
    textColor: '#ffffff',
    lineHeight: 1.35,
    align: 'center',
    mirror: false,
    width: 620,
    height: 170,
    layout: 'notch',          // notch | float
    opacity: 0.92,
    sensitivity: 55,          // 0–100
    holdMs: 700,              // jak dlouho po dotečení věty ještě jet
    useSystemAudio: true,     // poslouchat i druhou stranu (zvuk z reproduktorů)
    hoverPause: true,
    countdown: 3,
    hideFromCapture: true,
    hideEditorFromCapture: true,
    micDeviceId: '',
    remoteEnabled: false,
    remotePort: 8765,
    aiEnabled: false,         // poslouchat druhou stranu a navrhovat odpovědi
    aiAuto: true,             // odpovídat automaticky na rozpoznané otázky
    aiLanguage: 'ces',
  },
  floatBounds: null,
};

let state = loadState();
let prompterWin = null;
let editorWin = null;
let tray = null;
let remoteServer = null;
let remoteStatus = {};
let ai = null;
const remoteClients = new Set();

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
    return { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
  } catch { return JSON.parse(JSON.stringify(DEFAULTS)); }
}
let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2)); } catch (e) { console.error(e); }
  }, 250);
}
function broadcast(channel, payload) {
  for (const w of [prompterWin, editorWin]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}
function send(win, channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

// ---------- Okno napovídače ----------
function notchBounds() {
  const d = screen.getPrimaryDisplay();
  const { width, height } = state.settings;
  const x = Math.round(d.workArea.x + (d.workArea.width - width) / 2);
  return { x, y: d.bounds.y, width, height };
}

function applyLayout() {
  if (!prompterWin) return;
  const s = state.settings;
  if (s.layout === 'notch') {
    prompterWin.setBounds(notchBounds());
    prompterWin.setMovable(false);
  } else {
    prompterWin.setMovable(true);
    const b = state.floatBounds;
    if (b) prompterWin.setBounds(b);
    else { const nb = notchBounds(); prompterWin.setBounds({ ...nb, y: nb.y + 80 }); }
  }
  prompterWin.setResizable(true);
}

function createPrompter() {
  prompterWin = new BrowserWindow({
    ...notchBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    minWidth: 320,
    minHeight: 90,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    title: 'Napovídač',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  // Nad vším, i nad aplikacemi na celou obrazovku.
  prompterWin.setAlwaysOnTop(true, 'screen-saver');
  prompterWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // KLÍČOVÉ: Windows 10 (2004+) / 11 okno vynechá ze sdílení obrazovky a screenshotů.
  prompterWin.setContentProtection(!!state.settings.hideFromCapture);
  prompterWin.loadFile(path.join(__dirname, 'src', 'prompter.html'));
  prompterWin.once('ready-to-show', () => { applyLayout(); prompterWin.showInactive(); });

  let boundsTimer = null;
  const remember = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!prompterWin || prompterWin.isDestroyed()) return;
      const b = prompterWin.getBounds();
      if (state.settings.layout === 'float') state.floatBounds = b;
      else if (b.width !== state.settings.width || b.height !== state.settings.height) {
        state.settings.width = b.width; state.settings.height = b.height;
        prompterWin.setBounds(notchBounds());
        broadcast('state', state);
      }
      saveState();
    }, 300);
  };
  prompterWin.on('resized', remember);
  prompterWin.on('moved', remember);
  prompterWin.on('closed', () => { prompterWin = null; });
}

// ---------- Editor a nastavení ----------
function createEditor() {
  if (editorWin && !editorWin.isDestroyed()) { editorWin.show(); editorWin.focus(); return; }
  editorWin = new BrowserWindow({
    width: 1080, height: 760, minWidth: 760, minHeight: 520,
    title: 'Napovídač',
    backgroundColor: '#0c0c0e',
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  editorWin.setContentProtection(!!state.settings.hideEditorFromCapture);
  editorWin.loadFile(path.join(__dirname, 'src', 'editor.html'));
  editorWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  editorWin.on('closed', () => { editorWin = null; });
}

function iconPath() { return path.join(__dirname, 'build', 'icon.png'); }

// ---------- Ovládání ----------
function command(type, extra) {
  if (type === 'toggleVisible') {
    if (!prompterWin) return createPrompter();
    if (prompterWin.isVisible()) prompterWin.hide(); else prompterWin.showInactive();
    return;
  }
  if (type === 'openEditor') return createEditor();
  if (type === 'aiAnswerNow') { if (ai) ai.answer(''); return; }
  if (type === 'closeAnswer' && ai) ai.cancel();
  if (type === 'speedUp' || type === 'speedDown') {
    const d = type === 'speedUp' ? 5 : -5;
    state.settings.speed = Math.max(5, Math.min(300, state.settings.speed + d));
    saveState(); broadcast('state', state);
    return;
  }
  send(prompterWin, 'cmd', { type, ...(extra || {}) });
}

function registerShortcuts() {
  const map = {
    'CommandOrControl+Alt+Space': 'togglePlay',
    'CommandOrControl+Alt+Up': 'speedUp',
    'CommandOrControl+Alt+Down': 'speedDown',
    'CommandOrControl+Alt+Right': 'nextCue',
    'CommandOrControl+Alt+Left': 'prevCue',
    'CommandOrControl+Alt+Home': 'restart',
    'CommandOrControl+Alt+H': 'toggleVisible',
    'CommandOrControl+Alt+E': 'openEditor',
    'CommandOrControl+Alt+A': 'aiAnswerNow',
    'CommandOrControl+Alt+Q': 'closeAnswer',
  };
  for (const [acc, type] of Object.entries(map)) {
    try { globalShortcut.register(acc, () => command(type)); } catch (e) { console.warn('Zkratka', acc, e); }
  }
}

function createTray() {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Napovídač');
  const menu = Menu.buildFromTemplate([
    { label: 'Otevřít editor', click: () => createEditor() },
    { label: 'Zobrazit / skrýt napovídač  (Ctrl+Alt+H)', click: () => command('toggleVisible') },
    { label: 'Spustit / pozastavit  (Ctrl+Alt+Mezerník)', click: () => command('togglePlay') },
    { label: 'Od začátku', click: () => command('restart') },
    { type: 'separator' },
    { label: 'Ukončit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => createEditor());
}

// ---------- Ovladač v iPhonu (lokální síť) ----------
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}
function remoteInfo() {
  const port = state.settings.remotePort;
  return { enabled: !!remoteServer, urls: lanAddresses().map(ip => `http://${ip}:${port}/`) };
}
function startRemote() {
  stopRemote();
  const page = fs.readFileSync(path.join(__dirname, 'src', 'remote.html'));
  remoteServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page);
    }
    const assets = { '/brand/logo.svg': ['src/brand/logo.svg', 'image/svg+xml'], '/brand/waves.jpg': ['src/brand/waves.jpg', 'image/jpeg'], '/icon.png': ['build/icon.png', 'image/png'] };
    if (req.method === 'GET' && assets[url.pathname]) {
      const [file, type] = assets[url.pathname];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=86400' });
      return fs.createReadStream(path.join(__dirname, file)).pipe(res);
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(remotePayload())}\n\n`);
      remoteClients.add(res);
      req.on('close', () => remoteClients.delete(res));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/cmd') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
      req.on('end', () => {
        try {
          const msg = JSON.parse(body || '{}');
          const allowed = ['togglePlay', 'play', 'pause', 'speedUp', 'speedDown', 'nextCue', 'prevCue', 'restart', 'jumpCue', 'nudge', 'toggleVisible'];
          if (allowed.includes(msg.type)) command(msg.type, { index: msg.index | 0, delta: +msg.delta || 0 });
        } catch {}
        res.writeHead(204); res.end();
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  remoteServer.on('error', e => { console.error('Ovladač:', e.message); remoteServer = null; broadcast('remote-info', remoteInfo()); });
  remoteServer.listen(state.settings.remotePort, '0.0.0.0', () => broadcast('remote-info', remoteInfo()));
}
function stopRemote() {
  for (const r of remoteClients) { try { r.end(); } catch {} }
  remoteClients.clear();
  if (remoteServer) { remoteServer.close(); remoteServer = null; }
}
function remotePayload() {
  const cues = [];
  state.script.split(/\r?\n/).forEach(l => { const m = l.match(/^\s*#+\s*(.+)/); if (m) cues.push(m[1].trim()); });
  return { ...remoteStatus, speed: state.settings.speed, cues };
}
function pushRemote() {
  if (!remoteClients.size) return;
  const data = `data: ${JSON.stringify(remotePayload())}\n\n`;
  for (const r of remoteClients) { try { r.write(data); } catch {} }
}

// ---------- IPC ----------
ipcMain.handle('get-state', () => state);
ipcMain.handle('remote-info', () => remoteInfo());
ipcMain.on('set-state', (_e, patch) => {
  const before = state.settings;
  if (patch.script !== undefined) state.script = String(patch.script);
  if (patch.notes !== undefined) state.notes = String(patch.notes);
  if (patch.settings) state.settings = { ...state.settings, ...patch.settings };
  const s = state.settings;
  if (prompterWin) {
    if (before.hideFromCapture !== s.hideFromCapture) prompterWin.setContentProtection(!!s.hideFromCapture);
    if (before.layout !== s.layout || before.width !== s.width || before.height !== s.height) applyLayout();
  }
  if (editorWin && before.hideEditorFromCapture !== s.hideEditorFromCapture) editorWin.setContentProtection(!!s.hideEditorFromCapture);
  if (before.remoteEnabled !== s.remoteEnabled || before.remotePort !== s.remotePort) {
    if (s.remoteEnabled) startRemote(); else { stopRemote(); broadcast('remote-info', remoteInfo()); }
  }
  if (ai && before.aiEnabled !== s.aiEnabled) ai.setListening(s.aiEnabled);
  saveState();
  broadcast('state', state);
  pushRemote();
});
ipcMain.on('cmd', (_e, msg) => command(msg.type, msg));
ipcMain.handle('ai-status', () => ai && ai.status());
ipcMain.on('ai-audio', (_e, buf) => ai && ai.audio(buf));
ipcMain.on('ai-set-key', (_e, { name, value }) => { if (ai && ['anthropic', 'elevenlabs'].includes(name)) { ai.setKey(name, value); if (name === 'elevenlabs') ai.setListening(state.settings.aiEnabled); } });
ipcMain.on('status', (_e, st) => {
  remoteStatus = st;
  send(editorWin, 'status', st);
  pushRemote();
});
ipcMain.on('resize-to', (_e, { w, h }) => {
  if (!prompterWin) return;
  w = Math.max(320, Math.min(2400, Math.round(w))); h = Math.max(90, Math.min(1400, Math.round(h)));
  if (state.settings.layout === 'notch') {
    state.settings.width = w; state.settings.height = h;
    prompterWin.setBounds(notchBounds());
  } else {
    const b = prompterWin.getBounds();
    prompterWin.setBounds({ x: b.x, y: b.y, width: w, height: h });
    state.floatBounds = prompterWin.getBounds();
  }
  saveState();
  send(editorWin, 'state', state);
});
ipcMain.on('ignore-mouse', (_e, ignore) => {
  if (prompterWin) prompterWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});

// ---------- Start ----------
app.on('second-instance', () => createEditor());

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('cz.cab.napovidac');

  // Povolit mikrofon a zachytávání zvuku systému (loopback = hlas druhé strany).
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'display-capture'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => ['media', 'display-capture'].includes(perm));
  session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
      // Video zahodíme hned v rendereru; potřebujeme jen zvuk z reproduktorů.
      callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {});
    }).catch(() => callback({}));
  });

  ai = createAI({ getState: () => state, emit: broadcast });
  ai.setListening(state.settings.aiEnabled);

  createPrompter();
  createEditor();
  createTray();
  registerShortcuts();
  if (state.settings.remoteEnabled) startRemote();

  screen.on('display-metrics-changed', applyLayout);
});

app.on('window-all-closed', () => { /* běží dál v oznamovací oblasti */ });
app.on('will-quit', () => { globalShortcut.unregisterAll(); stopRemote(); });
