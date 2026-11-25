// Generuje podklady značky: logo N, vlnky, ikonu aplikace.
// Spuštění: node tools/brand.js  (ikona se renderuje přes Playwright, pokud je k dispozici)
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'src', 'brand');
fs.mkdirSync(OUT, { recursive: true });

// Logo: N s diagonálním průřezem (bílé, průřez je průhledný).
const logo = (fill = '#fff') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
    <polygon points="7,7 40,7 62,45 62,7 93,7 93,93 60,93 38,55 38,93 7,93" fill="#fff" stroke="#fff" stroke-width="12" stroke-linejoin="round"/>
    <line x1="17" y1="11" x2="83" y2="89" stroke="#000" stroke-width="6.5" stroke-linecap="round"/>
  </mask></defs>
  <rect width="100" height="100" fill="${fill}" mask="url(#m)"/>
</svg>`;

// Vlnky: hustě skládané sinusové linky, tmavá námořnická nahoře, světlá záře dole.
function waves(w = 1600, h = 1000, seed = 1) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const lines = [];
  const rows = 38;
  for (let i = 0; i < rows; i++) {
    const y0 = (i / (rows - 1)) * h * 1.1 - h * 0.05;
    const amp = 22 + 14 * Math.sin(i * 0.21) ** 2;
    const f1 = 0.0046 + rnd() * 0.00015, f2 = 0.0118;
    const ph = i * 0.16;
    let d = '';
    for (let x = -20; x <= w + 20; x += 16) {
      const y = y0 + amp * Math.sin(x * f1 + ph) + amp * 0.35 * Math.sin(x * f2 - ph * 1.3);
      d += (x === -20 ? 'M' : 'L') + x + ',' + y.toFixed(1);
    }
    const t = i / (rows - 1);
    lines.push(`<path d="${d}" stroke="url(#ln)" stroke-opacity="${(0.25 + t * 0.55).toFixed(2)}" stroke-width="${(10 + t * 10).toFixed(1)}" stroke-linecap="round" fill="none"/>`);
    lines.push(`<path d="${d}" transform="translate(0,9)" stroke="#020414" stroke-opacity="${(0.5 - t * 0.3).toFixed(2)}" stroke-width="6" fill="none"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#03061a"/><stop offset=".45" stop-color="#0b1f7a"/><stop offset=".8" stop-color="#2450e6"/><stop offset="1" stop-color="#6f93ff"/>
    </linearGradient>
    <linearGradient id="ln" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2a5cff"/><stop offset=".5" stop-color="#4f7dff"/><stop offset="1" stop-color="#2a5cff"/>
    </linearGradient>
    <radialGradient id="glow" cx=".55" cy="1.02" r=".55">
      <stop offset="0" stop-color="#f1eaff" stop-opacity=".95"/><stop offset=".35" stop-color="#b9c8ff" stop-opacity=".55"/><stop offset="1" stop-color="#5b7cff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="pink" cx=".78" cy=".92" r=".22">
      <stop offset="0" stop-color="#f6b8ea" stop-opacity=".55"/><stop offset="1" stop-color="#f6b8ea" stop-opacity="0"/>
    </radialGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  ${lines.join('\n  ')}
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect width="100%" height="100%" fill="url(#pink)"/>
  <rect width="100%" height="100%" filter="url(#grain)"/>
</svg>`;
}

fs.writeFileSync(path.join(OUT, 'logo.svg'), logo());
fs.writeFileSync(path.join(OUT, 'waves.svg'), waves());
console.log('logo.svg, waves.svg hotovo');

// Ikona: skleněná karta s logem na vlnkách.
(async () => {
  let chromium; try { ({ chromium } = require('playwright')); } catch { return console.log('Playwright chybí, ikonu přeskočeno'); }
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  const wv = 'data:image/svg+xml;base64,' + Buffer.from(waves(512, 512, 7)).toString('base64');
  const lg = 'data:image/svg+xml;base64,' + Buffer.from(logo()).toString('base64');
  await p.setContent(`<body style="margin:0;background:transparent">
    <div style="width:512px;height:512px;border-radius:114px;overflow:hidden;position:relative;background:url(${wv}) center/cover">
      <div style="position:absolute;inset:78px;border-radius:72px;background:linear-gradient(160deg,rgba(70,110,255,.55),rgba(30,70,230,.35));
        box-shadow:inset 0 0 0 3px rgba(190,210,255,.55), inset 0 2px 30px rgba(255,255,255,.25), 0 20px 60px rgba(0,10,60,.5);backdrop-filter:blur(10px)"></div>
      <img src="${lg}" style="position:absolute;left:156px;top:156px;width:200px;height:200px;filter:drop-shadow(0 6px 18px rgba(0,20,90,.45))">
    </div></body>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(__dirname, '..', 'build', 'icon.png'), omitBackground: true });
  await b.close();
  console.log('build/icon.png hotovo');
})();
