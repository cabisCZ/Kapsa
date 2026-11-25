// AI asistent: přepis druhé strany (ElevenLabs Scribe realtime) a návrh odpovědi (Claude).
// Běží v hlavním procesu, takže API klíče nikdy neopustí tento proces.
const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const Anthropic = require('@anthropic-ai/sdk').default;

const MODEL = 'claude-opus-5-5';
const KEYS_FILE = () => path.join(app.getPath('userData'), 'klice.bin');

// ---------- Klíče (šifrované přes Windows DPAPI) ----------
function loadKeys() {
  try {
    const raw = fs.readFileSync(KEYS_FILE());
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
    return JSON.parse(json);
  } catch { return {}; }
}
function saveKeys(keys) {
  const json = JSON.stringify(keys);
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8');
  fs.writeFileSync(KEYS_FILE(), data);
}

// ---------- Rozpoznání otázky ----------
const Q_START = /^(a\s+|no\s+|a\s+jak\s+)?(jak|jaký|jaká|jaké|jakým|co|čím|proč|kdy|kde|kdo|komu|kolik|který|která|které|kam|odkud|dokdy|můžete|můžeš|mohl|mohla|mohli|šlo by|dalo by se|dá se|je možné|je to|jsou|máte|máš|umíte|nabízíte|existuje|platí|funguje|bude|budete|zvládnete|řešíte|počítáte|stihnete|potřebujete)(?=[\s,.!?]|$)/i;
function isQuestion(text) {
  const t = text.trim();
  if (t.length < 6) return false;
  if (/\?\s*$/.test(t)) return true;
  return Q_START.test(t) && t.split(/\s+/).length >= 3;
}

function createAI({ getState, emit }) {
  let keys = loadKeys();
  let ws = null, wsReady = false, wantListening = false, reconnectTimer = null;
  let history = [];            // potvrzené věty druhé strany { t, text }
  let pending = [];            // věty otázky, která se ještě skládá
  let askTimer = null;
  let current = null;          // běžící odpověď (AbortController)

  const status = () => ({
    hasClaudeKey: !!keys.anthropic, hasSttKey: !!keys.elevenlabs,
    listening: wantListening && wsReady, connecting: wantListening && !wsReady,
  });
  const pushStatus = () => emit('ai-status', status());

  // ---------- Přepis ----------
  function connect() {
    clearTimeout(reconnectTimer);
    if (!wantListening || !keys.elevenlabs) return pushStatus();
    const lang = getState().settings.aiLanguage || 'ces';
    const q = new URLSearchParams({
      model_id: 'scribe_v2_realtime', language_code: lang, audio_format: 'pcm_16000',
      commit_strategy: 'vad', vad_silence_threshold_secs: '0.7', enable_logging: 'false',
    });
    ws = new WebSocket('wss://api.elevenlabs.io/v1/speech-to-text/realtime?' + q, { headers: { 'xi-api-key': keys.elevenlabs } });
    ws.on('open', () => { wsReady = true; pushStatus(); });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.message_type === 'partial_transcript') emit('ai-partial', m.text || '');
      else if (m.message_type === 'committed_transcript') onCommitted((m.text || '').trim());
      else if (m.error) emit('ai-error', 'Přepis: ' + m.error);
    });
    ws.on('close', () => {
      wsReady = false; ws = null; pushStatus();
      if (wantListening) reconnectTimer = setTimeout(connect, 2000);
    });
    ws.on('error', e => emit('ai-error', 'Přepis: ' + e.message));
  }
  function setListening(on) {
    on = !!on && !!keys.elevenlabs;
    if (on === wantListening) return;
    wantListening = on;
    if (on) connect();
    else { clearTimeout(reconnectTimer); if (ws) ws.close(); ws = null; wsReady = false; pushStatus(); }
  }
  function audio(buf) {
    if (!ws || !wsReady || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: Buffer.from(buf).toString('base64'), commit: false, sample_rate: 16000 }));
  }

  function onCommitted(text) {
    if (!text) return;
    history.push({ t: Date.now(), text });
    if (history.length > 40) history.shift();
    emit('ai-line', text);
    const s = getState().settings;
    // Otázka se může skládat z více vět – chvilku počkáme na pokračování.
    if (pending.length) { pending.push(text); scheduleAsk(); return; }
    if (s.aiAuto && isQuestion(text)) { pending = [text]; scheduleAsk(); }
  }
  function scheduleAsk() {
    clearTimeout(askTimer);
    askTimer = setTimeout(() => { const q = pending.join(' '); pending = []; answer(q); }, 900);
  }

  // ---------- Odpověď ----------
  async function answer(question) {
    if (!keys.anthropic) return emit('ai-error', 'Chybí API klíč pro Claude.');
    question = (question || '').trim();
    if (!question) {
      const last = history.slice(-2).map(h => h.text).join(' ');
      if (!last) return emit('ai-error', 'Zatím jsem od druhé strany nic neslyšel.');
      question = last;
    }
    if (current) current.abort();
    const ctrl = new AbortController(); current = ctrl;
    const st = getState();
    const recent = history.slice(-12).map(h => '– ' + h.text).join('\n') || '(zatím nic)';
    emit('ai-answer', { phase: 'start', question });

    const client = new Anthropic({ apiKey: keys.anthropic });
    const system = [
      { type: 'text', text: SYSTEM_PROMPT },
      {
        type: 'text',
        text: `<scenar>\n${st.script || ''}\n</scenar>\n\n<podklady>\n${st.notes || '(žádné)'}\n</podklady>`,
        cache_control: { type: 'ephemeral' },
      },
    ];
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system,
        messages: [{
          role: 'user',
          content: `<prepis_hovoru>\n${recent}\n</prepis_hovoru>\n\nDruhá strana se právě zeptala: „${question}“\nNapiš, co mám teď nahlas odpovědět.`,
        }],
      }, { signal: ctrl.signal });
      stream.on('text', delta => { if (current === ctrl) emit('ai-answer', { phase: 'delta', text: delta }); });
      const msg = await stream.finalMessage();
      if (current !== ctrl) return;
      if (msg.stop_reason === 'refusal') emit('ai-answer', { phase: 'error', error: 'Na tohle odpověď nenapíšu.' });
      else emit('ai-answer', { phase: 'done' });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      let msg = e.message;
      if (e instanceof Anthropic.AuthenticationError) msg = 'Neplatný API klíč pro Claude.';
      else if (e instanceof Anthropic.RateLimitError) msg = 'Claude je přetížený, zkuste to za chvíli.';
      else if (e instanceof Anthropic.APIConnectionError) msg = 'Bez připojení k internetu.';
      emit('ai-answer', { phase: 'error', error: msg });
    } finally { if (current === ctrl) current = null; }
  }
  function cancel() { if (current) current.abort(); current = null; pending = []; clearTimeout(askTimer); }

  function setKey(name, value) {
    keys = { ...keys, [name]: String(value || '').trim() || undefined };
    saveKeys(keys);
    if (name === 'elevenlabs' && wantListening) { if (ws) ws.close(); else connect(); }
    pushStatus();
  }

  return { status, setListening, audio, answer, cancel, setKey, clearHistory: () => { history = []; } };
}

const SYSTEM_PROMPT = `Jsi tichý napovídač při pracovním hovoru nebo prezentaci. Uživatel tvou odpověď hned čte nahlas z teleprompteru, jako by mluvil sám za sebe.

Jak psát:
- Česky, v první osobě, přirozeným mluveným jazykem, jak by to řekl zkušený a klidný člověk.
- Krátce: 2–4 věty, nejvýš asi 60 slov. Začni rovnou odpovědí na otázku.
- Žádný markdown, odrážky, nadpisy, emoji ani uvozovky kolem celé odpovědi.
- Nezačínej frázemi typu „Skvělá otázka“ nebo „Děkuji za dotaz“.

Z čeho vycházet:
- Opírej se o scénář prezentace a podklady níže. Drž se jejich faktů, čísel a tónu.
- Když odpověď ve scénáři ani podkladech není, nevymýšlej čísla, ceny, termíny ani sliby. Odpověz obecně a pravdivě a nabídni, že to ověříš a pošleš.
- Pokud věta druhé strany vlastně není otázka, napiš krátkou přirozenou reakci, která navede zpět k tématu.`;

module.exports = { createAI, isQuestion };
