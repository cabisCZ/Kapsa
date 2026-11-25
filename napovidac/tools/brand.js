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

// ---------- Vlnky: plyš / filc (kreslí se v prohlížeči na canvas) ----------
// Paleta vytažená z předlohy (od noci po led).
const PALETTE = ['#050614', '#0a0f2b', '#0d1b4f', '#12276b', '#183594', '#1f47bc', '#3061e0', '#5b86ea', '#a9c4f5', '#e6eeff'];
const wavesFn = `
const PAL = ${JSON.stringify(PALETTE)}.map(h => [1,3,5].map(i => parseInt(h.substr(i,2),16)));
function ramp(t) { t = Math.max(0, Math.min(1, t)) * (PAL.length - 1); const i = Math.min(PAL.length - 2, Math.floor(t)), k = t - i; const a = PAL[i], b = PAL[i+1]; return [a[0]+(b[0]-a[0])*k, a[1]+(b[1]-a[1])*k, a[2]+(b[2]-a[2])*k]; }
function makeNoise(seed) {
  const P = new Uint8Array(512); let s = seed * 9301 + 49297;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const base = [...Array(256).keys()].sort(() => r() - .5); for (let i = 0; i < 512; i++) P[i] = base[i & 255];
  const V = new Float32Array(256).map(() => r());
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const h = (a, b) => V[P[(P[a & 255] + b) & 255]];
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * xf) + ((c + (d - c) * xf) - (a + (b - a) * xf)) * yf; };
}
function drawWaves(cv, W, H, opt) {
  opt = Object.assign({ scale: 1, glow: true, seed: 3, lift: 0 }, opt || {});
  const c = cv.getContext('2d'); cv.width = W; cv.height = H;
  const img = c.createImageData(W, H), d = img.data;
  const s = opt.scale * Math.min(W, H) / 900;
  const n1 = makeNoise(opt.seed), n2 = makeNoise(opt.seed + 11), n3 = makeNoise(opt.seed + 23);
  const fbm = (x, y) => n1(x, y) * .5 + n2(x * 2.1, y * 2.1) * .3 + n3(x * 4.3, y * 4.3) * .2;
  const TAU = Math.PI * 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x / s, Y = y / s;
    // velké měkké oblouky + chlupaté okraje (šum v posunu fáze)
    const warp = 70 * Math.sin(X * 0.0052 + Y * 0.0021 + opt.seed) + 22 * Math.sin(X * 0.012 - Y * 0.006 + 2 * opt.seed)
               + 14 * (fbm(X / 60, Y / 60) - .5) + 5 * (n3(X / 9, Y / 9) - .5);
    let t = ((Y + warp) / 112) % 1; if (t < 0) t += 1;
    // profil záhybu: světlá spodní hrana vrstvy, pak měkký stín pod další vrstvou
    const fold = Math.pow(t, 1.5) * (1 - Math.pow(Math.max(0, (t - .8) / .2), 1.6) * .95);
    // vlas: hrubé chuchvalce + jemná vlákna (protažená do strany)
    const fuzz = (fbm(X / 14, Y / 22) - .5) * .16 + (n2(X / 2.2, Y / 4) - .5) * .08 + (Math.random() - .5) * .045;
    const base = Math.min(1, (y / H) * .78 + .04 + opt.lift);
    let v = base * .6 + fold * .3 * (0.45 + base) + fuzz * (0.55 + base * .25);
    if (opt.glow) { const gx = (x - W * .55) / (W * .38), gy = (y - H * 1.05) / (H * .42); v += Math.exp(-(gx * gx + gy * gy) * 1.5) * .3; }
    const [r, g, b] = ramp(v);
    const i = (y * W + x) * 4; d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
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
        <div style="position:absolute;inset:0;background:linear-gradient(170deg,rgba(31,71,188,.45),rgba(48,97,224,.18) 60%,rgba(169,196,245,.22));"></div>
        <div style="position:absolute;inset:0;border-radius:64px;box-shadow:inset 0 0 0 2.5px rgba(205,220,255,.75),inset 0 3px 14px rgba(255,255,255,.35),inset 0 -6px 22px rgba(170,200,255,.35)"></div>
      </div>
      <img src="${logo64}" style="position:absolute;left:181px;top:181px;width:150px;height:150px">
    </div></body>`);
  await p.addScriptTag({ content: wavesFn });
  await p.evaluate(() => { drawWaves(document.getElementById('w'), 512, 512, { scale: .9 }); drawWaves(document.getElementById('cw'), 412, 412, { scale: 1.4, glow: true, seed: 5, lift: .12 }); });
  await p.locator('#ic').screenshot({ path: path.join(ROOT, 'build', 'icon.png'), omitBackground: true });

  // Náhled celé značky (karta na vlnkách) pro kontrolu
  await p.setViewportSize({ width: 1100, height: 820 });
  await p.setContent(`<body style="margin:0"><div style="position:relative;width:1100px;height:820px;overflow:hidden">
      <canvas id="w" style="position:absolute;inset:0;width:1100px;height:820px"></canvas>
      <div style="position:absolute;left:230px;top:185px;width:642px;height:455px;border-radius:56px;overflow:hidden;box-shadow:0 20px 60px rgba(2,6,40,.45)">
        <canvas id="cw" style="position:absolute;inset:-30px;width:702px;height:515px;filter:blur(9px) saturate(1.15)"></canvas>
        <div style="position:absolute;inset:0;background:linear-gradient(170deg,rgba(31,71,188,.45),rgba(48,97,224,.18) 60%,rgba(169,196,245,.22));"></div>
        <div style="position:absolute;inset:0;border-radius:56px;box-shadow:inset 0 0 0 2px rgba(205,220,255,.75),inset 0 3px 16px rgba(255,255,255,.35),inset 0 -8px 28px rgba(170,200,255,.35)"></div>
      </div>
      <img src="${logo64}" style="position:absolute;left:462px;top:322px;width:182px;height:182px">
    </div></body>`);
  await p.addScriptTag({ content: wavesFn });
  await p.evaluate(() => { drawWaves(document.getElementById('w'), 1100, 820); drawWaves(document.getElementById('cw'), 702, 515, { scale: 1.5, seed: 5, lift: .12 }); });
  await p.screenshot({ path: process.env.PREVIEW || path.join(ROOT, 'build', 'brand-preview.png') });
  await b.close();
  console.log('hotovo');
})();
