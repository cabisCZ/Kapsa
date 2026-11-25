// Podklady značky podle předlohy: logo N (obkresleno 1:1), vlnky, ikona.
// Spuštění: node tools/brand.js   (potřebuje Playwright)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'brand');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Logo ----------
// Zaoblený čtverec se dvěma šikmými kanály; druhý je první otočený o 180°.
const CH = 'M99,137 L312,580 Q322,600 312,620 L228,800 L490,800 L143,117 A23,23 0 0 0 99,137 Z';
const logoSvg = (fill = '#fff') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="48 48 727 722">
  <defs><mask id="n" maskUnits="userSpaceOnUse" x="0" y="0" width="823" height="818">
    <rect x="48" y="48" width="727" height="722" rx="58" fill="#fff"/>
    <path d="${CH}" fill="#000"/>
    <path d="${CH}" fill="#000" transform="rotate(180 411.5 409)"/>
  </mask></defs>
  <rect x="0" y="0" width="823" height="818" fill="${fill}" mask="url(#n)"/>
</svg>`;
fs.writeFileSync(path.join(OUT, 'logo.svg'), logoSvg());

// ---------- Vlnky (kreslí se v prohlížeči na canvas) ----------
const wavesFn = `
function drawWaves(cv, W, H, opt) {
  opt = Object.assign({ scale: 1, glow: true, seed: 3 }, opt || {});
  const c = cv.getContext('2d'); cv.width = W; cv.height = H;
  const img = c.createImageData(W, H), d = img.data;
  const s = opt.scale * Math.min(W, H) / 820;
  const lerp = (a, b, t) => a + (b - a) * t;
  // Barvy podle výšky: téměř černá nahoře -> královská modrá -> světlá dole
  const stops = [[0, [3, 6, 24]], [.25, [10, 26, 110]], [.55, [30, 74, 228]], [.8, [48, 100, 246]], [1, [88, 128, 250]]];
  const grad = t => { for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i-1], [b, cb] = stops[i]; const k = (t - a) / (b - a); return [lerp(ca[0], cb[0], k), lerp(ca[1], cb[1], k), lerp(ca[2], cb[2], k)]; } return stops[stops.length-1][1]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x / s, Y = y / s;
    const warp = 46 * Math.sin(X * 0.0082 + Y * 0.0035 + opt.seed) + 12 * Math.sin(X * 0.019 - Y * 0.009 + 1.7 * opt.seed) + 2.5 * Math.sin(X * 0.043 + Y * 0.017);
    const ph = (Y + warp) * 0.084;
    const sn = Math.sin(ph), cs = Math.cos(ph);
    const groove = Math.pow(Math.max(0, -sn), 4);          // tenká tmavá rýha
    const light = 0.5 + 0.5 * cs;                          // světlá hrana hřbetu
    let t = Math.min(1, Math.max(0, y / H * 0.95 + 0.05 * Math.sin(X * 0.004)));
    let [r, g, b] = grad(t);
    const k = 0.78 + 0.32 * light - 0.55 * groove;
    r *= k; g *= k; b *= k;
    if (opt.glow) {                                         // bílo-fialová záře dole uprostřed + růžový nádech vpravo
      const gx = (x - W * 0.5) / (W * 0.34), gy = (y - H * 1.04) / (H * 0.36);
      const gl = Math.exp(-(gx * gx + gy * gy) * 1.6);
      r = lerp(r, 236, gl * 0.8); g = lerp(g, 232, gl * 0.8); b = lerp(b, 255, gl * 0.8);
      const px = (x - W * 0.8) / (W * 0.18), py = (y - H * 0.86) / (H * 0.2);
      const pk = Math.exp(-(px * px + py * py)) * 0.35;
      r = lerp(r, 246, pk); g = lerp(g, 184, pk); b = lerp(b, 234, pk);
    }
    const n = (Math.random() - 0.5) * 26;                   // zrno
    const i = (y * W + x) * 4;
    d[i] = r + n; d[i+1] = g + n; d[i+2] = b + n; d[i+3] = 255;
  }
  c.putImageData(img, 0, 0);
}`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<body style="margin:0"></body>');
  await p.addScriptTag({ content: wavesFn });

  // Pozadí pro editor a ovladač
  const bg = await p.evaluate(() => { const cv = document.createElement('canvas'); drawWaves(cv, 1920, 1200); return cv.toDataURL('image/jpeg', 0.86); });
  fs.writeFileSync(path.join(OUT, 'waves.jpg'), Buffer.from(bg.split(',')[1], 'base64'));

  // Ikona 512 px: vlnky, skleněná karta, logo
  const logo64 = 'data:image/svg+xml;base64,' + Buffer.from(logoSvg()).toString('base64');
  await p.setViewportSize({ width: 512, height: 512 });
  await p.setContent(`<body style="margin:0;background:transparent">
    <div id="ic" style="width:512px;height:512px;border-radius:112px;overflow:hidden;position:relative">
      <canvas id="w" style="position:absolute;inset:0;width:512px;height:512px"></canvas>
      <div style="position:absolute;inset:70px;border-radius:64px;overflow:hidden;
           box-shadow:0 18px 50px rgba(2,6,40,.55)">
        <canvas id="cw" style="position:absolute;inset:-20px;width:412px;height:412px;filter:blur(7px) saturate(1.15)"></canvas>
        <div style="position:absolute;inset:0;background:linear-gradient(170deg,rgba(40,80,240,.55),rgba(30,70,235,.25) 60%,rgba(170,190,255,.25));"></div>
        <div style="position:absolute;inset:0;border-radius:64px;box-shadow:inset 0 0 0 2.5px rgba(205,220,255,.75),inset 0 3px 14px rgba(255,255,255,.35),inset 0 -6px 22px rgba(170,200,255,.35)"></div>
      </div>
      <img src="${logo64}" style="position:absolute;left:181px;top:181px;width:150px;height:150px">
    </div></body>`);
  await p.addScriptTag({ content: wavesFn });
  await p.evaluate(() => { drawWaves(document.getElementById('w'), 512, 512, { scale: .9 }); drawWaves(document.getElementById('cw'), 412, 412, { scale: 1.4, glow: true, seed: 5 }); });
  await p.locator('#ic').screenshot({ path: path.join(ROOT, 'build', 'icon.png'), omitBackground: true });

  // Náhled celé značky (karta na vlnkách) pro kontrolu
  await p.setViewportSize({ width: 1100, height: 820 });
  await p.setContent(`<body style="margin:0"><div style="position:relative;width:1100px;height:820px;overflow:hidden">
      <canvas id="w" style="position:absolute;inset:0;width:1100px;height:820px"></canvas>
      <div style="position:absolute;left:230px;top:185px;width:642px;height:455px;border-radius:56px;overflow:hidden;box-shadow:0 20px 60px rgba(2,6,40,.45)">
        <canvas id="cw" style="position:absolute;inset:-30px;width:702px;height:515px;filter:blur(9px) saturate(1.15)"></canvas>
        <div style="position:absolute;inset:0;background:linear-gradient(170deg,rgba(40,80,240,.55),rgba(30,70,235,.25) 60%,rgba(170,190,255,.25));"></div>
        <div style="position:absolute;inset:0;border-radius:56px;box-shadow:inset 0 0 0 2px rgba(205,220,255,.75),inset 0 3px 16px rgba(255,255,255,.35),inset 0 -8px 28px rgba(170,200,255,.35)"></div>
      </div>
      <img src="${logo64}" style="position:absolute;left:462px;top:322px;width:182px;height:182px">
    </div></body>`);
  await p.addScriptTag({ content: wavesFn });
  await p.evaluate(() => { drawWaves(document.getElementById('w'), 1100, 820); drawWaves(document.getElementById('cw'), 702, 515, { scale: 1.5, seed: 5 }); });
  await p.screenshot({ path: process.env.PREVIEW || path.join(ROOT, 'build', 'brand-preview.png') });
  await b.close();
  console.log('hotovo');
})();
