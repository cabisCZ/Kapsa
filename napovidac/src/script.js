// Převod textu scénáře na HTML.  "# Nadpis" = sekce (cue), "[poznámka]" = režijní poznámka.
(function () {
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function parse(text) {
    const cues = [];
    const blocks = [];
    let para = [];
    const flush = () => { if (para.length) { blocks.push({ t: 'p', text: para.join(' ') }); para = []; } };
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      const h = line.match(/^#+\s*(.+)$/);
      if (h) { flush(); cues.push(h[1]); blocks.push({ t: 'h', text: h[1], i: cues.length - 1 }); continue; }
      if (!line) { flush(); continue; }
      para.push(line);
    }
    flush();
    return { cues, blocks };
  }

  function inline(s) {
    return esc(s)
      .replace(/\[([^\]]+)\]/g, '<span class="note">$1</span>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  }

  function render(text) {
    const { cues, blocks } = parse(text);
    const html = blocks.map(b => b.t === 'h'
      ? `<h2 class="cue" data-cue="${b.i}">${esc(b.text)}</h2>`
      : `<p>${inline(b.text)}</p>`).join('');
    return { cues, html };
  }

  window.Script = { parse, render };
})();
