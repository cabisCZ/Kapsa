// Podklady značky: logo (src/brand/logo.svg, obkresleno z předlohy), pozadí se září, ikona.
// Spuštění: node tools/brand.js   (potřebuje Playwright)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'brand');

// Paleta z předlohy: černá + elektrická modrá.
const PALETTE = { black: '#040404', ink: '#0b0a52', cobalt: '#100ed7', electric: '#1d1bff', white: '#ffffff' };

// Černá plocha, v levém horním a pravém dolním rohu měkký diagonální pruh modrého světla.
const glowFn = `
function drawGlow(cv, W, H, opt) {
  opt = Object.assign({ band: .2, width: .13, strength: 1 }, opt || {});
  const c = cv.getContext('2d'); cv.width = W; cv.height = H;
  const img = c.createImageData(W, H), d = img.data;
  const A = Math.max(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d1 = (x + y) / A, d2 = ((W - x) + (H - y)) / A;
    const along1 = (x - y) / A, along2 = ((W - x) - (H - y)) / A;   // poloha podél pruhu
    const band = (dd, al) => Math.exp(-Math.pow((dd - opt.band) / opt.width, 2)) * (0.55 + 0.45 * Math.exp(-al * al * 6))
                           + Math.exp(-Math.pow(dd / (opt.width * 0.9), 2)) * 0.35;
    const g = Math.min(1, (band(d1, along1) + band(d2, along2)) * opt.strength);
    const n = (Math.random() - .5) * 7;
    // černá -> inkoustová -> kobaltová -> elektrická modrá
    const r = 4 + 25 * g * g + n, gg = 4 + 22 * g * g + n, b = 4 + 251 * Math.pow(g, .85) + n;
    const i = (y * W + x) * 4; d[i] = r; d[i+1] = gg; d[i+2] = Math.min(255, b); d[i+3] = 255;
  }
  c.putImageData(img, 0, 0);
}`;

(async () => {
  const logo = fs.readFileSync(path.join(OUT, 'logo.svg'), 'utf8');
  const logo64 = 'data:image/svg+xml;base64,' + Buffer.from(logo).toString('base64');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<body style="margin:0"></body>');
  await p.addScriptTag({ content: glowFn });

  const bg = await p.evaluate(() => { const cv = document.createElement('canvas'); drawGlow(cv, 1920, 1200, { band: .16, width: .11 }); return cv.toDataURL('image/jpeg', 0.9); });
  fs.writeFileSync(path.join(OUT, 'bg.jpg'), Buffer.from(bg.split(',')[1], 'base64'));

  // Ikona 512 px
  await p.setViewportSize({ width: 512, height: 512 });
  await p.setContent(`<body style="margin:0;background:transparent">
    <div id="ic" style="width:512px;height:512px;border-radius:112px;overflow:hidden;position:relative;background:#040404">
      <canvas id="g" style="position:absolute;inset:0;width:512px;height:512px"></canvas>
      <img src="${logo64}" style="position:absolute;left:131px;top:162px;width:250px;height:188px">
    </div></body>`);
  await p.addScriptTag({ content: glowFn });
  await p.evaluate(() => drawGlow(document.getElementById('g'), 512, 512, { band: .2, width: .14, strength: 1.05 }));
  await p.locator('#ic').screenshot({ path: path.join(ROOT, 'build', 'icon.png'), omitBackground: true });

  // Náhled značky
  await p.setViewportSize({ width: 1100, height: 820 });
  await p.setContent(`<body style="margin:0"><div style="position:relative;width:1100px;height:820px;overflow:hidden">
      <canvas id="g" style="position:absolute;inset:0;width:1100px;height:820px"></canvas>
      <img src="${logo64}" style="position:absolute;left:415px;top:308px;width:270px;height:203px"></div></body>`);
  await p.addScriptTag({ content: glowFn });
  await p.evaluate(() => drawGlow(document.getElementById('g'), 1100, 820, { band: .16, width: .11 }));
  await p.screenshot({ path: process.env.PREVIEW || path.join(ROOT, 'build', 'brand-preview.png') });
  await b.close();
  console.log('hotovo');
})();
