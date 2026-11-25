# Napovídač

Teleprompter pro Windows. Sedí nahoře pod webkamerou, takže při čtení koukáte do kamery. Při sdílení obrazovky ho nikdo jiný nevidí. Text se posouvá jen tehdy, když mluvíte vy.

## Co umí
- **Neviditelný při sdílení** (Teams, Zoom, Meet, OBS, screenshoty). Používá `SetWindowDisplayAffinity` / `WDA_EXCLUDEFROMCAPTURE`, což funguje ve Windows 10 verze 2004 a novějších a ve Windows 11.
- **Jede, když mluvíte, a zastaví se, když přestanete.** Prodleva a citlivost se dají nastavit.
- **Pozná druhou stranu hovoru.** Mikrofon má zapnuté potlačení ozvěny a aplikace navíc poslouchá zvuk z reproduktorů (loopback). Když mluví druhá strana, text stojí, i když její hlas trochu proniká do mikrofonu.
- Dvě polohy: **pod kamerou** (černý „výřez“ u horní hrany) nebo **plovoucí okno**.
- Sekce (`# Nadpis`), skoky mezi nimi, odpočet, zrcadlení, barva a velikost písma.
- **Ovladač v iPhonu:** zapněte ho v nastavení, naskenujte QR kód a ovládejte přes Wi-Fi v Safari.
- Vše zůstává v počítači. Nic se nikam neposílá.
- Vzhled: modré logo N na skleněné kartě a vlnky. Podklady generuje `node tools/brand.js`.

## Zkratky
| | |
|---|---|
| Ctrl+Alt+Mezerník | spustit / pauza |
| Ctrl+Alt+↑ / ↓ | rychlost |
| Ctrl+Alt+← / → | sekce |
| Ctrl+Alt+Home | od začátku |
| Ctrl+Alt+H | zobrazit / skrýt |
| Ctrl+Alt+E | editor |

## Spuštění ze zdrojáků
```
cd napovidac
npm install
npm start
```

## Sestavení .exe
Sestavení běží přes GitHub Actions (`.github/workflows/napovidac.yml`) na Windows. Výsledek je ke stažení v Releases jako `Napovidac-…-instalace.exe` a `Napovidac-…-portable.exe`.

Ručně ve Windows: `npm run dist`.

## Tipy
- Nejspolehlivější je to **se sluchátky**. Hlas druhé strany se pak do mikrofonu nedostane vůbec.
- Pokud se text rozjíždí od šumu (klávesnice, ventilátor), snižte citlivost. Pokud nereaguje na tichý hlas, zvyšte ji.
- Aplikace běží v oznamovací oblasti vedle hodin. Ukončíte ji pravým kliknutím na ikonu.
