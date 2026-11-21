# Kapsa: bitcoin mezi přáteli

Prototyp self-custodial aplikace jen pro BTC. Bez serveru, bez účtu, bez KYC.

## Dvě peněženky
| | Trezor 🔒 | Kapsa ⚡ |
|---|---|---|
| Co to je | Trezor Safe 7, on-chain BTC | Lightning peněženka na útratu |
| Klíče | v Trezoru, nikdy neopustí zařízení | v telefonu (self-custodial) |
| Platba | potvrzení tlačítkem na Trezoru | okamžitá, poplatek ~0–5 sats |
| Na co | úspory, větší částky | kafe, pivo, platby kámošům |

**Nabití** = on-chain převod z Trezoru na vkladovou adresu Kapsy (jako spořák → běžný účet).

## Co funguje už teď (reálně, přes Trezor Connect)
- připojení Trezoru, zůstatek a historie (`getAccountInfo`, účet `m/84'/0'/0'`, bc1q…)
- vlastní příjmová adresa + QR + ověření na displeji Trezoru (`getAddress showOnTrezor`)
- odeslání BTC z Trezoru (`composeTransaction push:true`: výběr poplatku, podpis, broadcast)
- kámoši (uloženo lokálně), přepínání sats/BTC, kurz v CZK

## Co je zatím DEMO
- Lightning Kapsa (zůstatek a platby jsou simulované v `localStorage`)
- vkladová adresa pro nabití (`LN_DEPOSIT_DEMO`), **neposílat na ni skutečné BTC**

## Další krok: skutečný Lightning
1. Napojit **Breez SDK (Spark / Nodeless)**: self-custodial Lightning bez vlastního nodu, umí vkladovou on-chain adresu a Lightning adresu.
2. Seed Kapsy šifrovat v zařízení (passkey / Secure Enclave).
3. Lightning adresa `jmeno@domena` přes vlastní doménu (LNURL-pay).
4. Zabalit jako PWA → později nativní iOS/Android (Trezor Safe 7 umí Bluetooth).

## Bezpečnost a decentralizace
**Už teď:**
- žádný server, účet ani databáze; kontakty a nastavení jsou jen v zařízení
- klíče k úsporám jsou jen v Trezoru, každou platbu i adresu potvrzuješ na jeho displeji
- písma i QR knihovna jsou uložené přímo v aplikaci, nic se nestahuje z cizích CDN
- přísná Content-Security-Policy: povolen je jen Trezor Connect (a CoinGecko, pokud zapneš kurz)
- kurz v CZK je vypnutý, dokud ho sám nezapneš (soukromí)
- vstupy se escapují (ochrana proti XSS), adresy se validují

**Kde je ještě centralizace, kterou odstraníme:**
1. **Trezor Connect** zatím jde přes `connect.trezor.io` a zůstatky čte z Blockbooku od Trezoru. Plán: přibalit `@trezor/connect-web` přímo do aplikace a připojit vlastní uzel (Bitcoin Core + Electrum/Blockbook, třeba na Umbrelu nebo Start9).
2. **Lightning:** Breez SDK / Spark je self-custodial (klíče jsou jen u tebe), ale používá jejich infrastrukturu. Alternativa pro plnou suverenitu je vlastní LN uzel.
3. **Lightning adresa** poběží na tvé vlastní doméně (LNURL-pay server). Bez ní platby fungují přes faktury a QR.
4. Před ostrým provozem: audit kódu, testy na testnetu/signetu a reproducible build.

## Spuštění
Trezor Connect potřebuje HTTPS (nebo `localhost`):
```
python3 -m http.server 8080   # ve složce aplikace, pak http://localhost:8080/
```

## Kontakty
- kontakt může mít víc adres (Lightning, bitcoin…) se štítkem; ★ = výchozí
- vytvoření z vyhledávání („Vytvořit kontakt Jirka“), z neznámé adresy, nebo po odeslání
- adresu jde naskenovat nebo přepsat z QR (kamera, nebo obrázek/screenshot od kámoše)
- čte BIP21 odkazy (`bitcoin:…?amount=…&label=…&lightning=…`) i `lightning:`
- skenování běží jen v zařízení (BarcodeDetector / přibalený jsQR), nic se nikam neposílá

## Soukromí (plán)
- nová adresa pro každou platbu (nikdy znovu nepoužívat adresu)
- nabíjení Kapsy přes swap (např. Boltz) místo přímého převodu, aby se Trezor a Kapsa on-chain nespojily
- výhledově eCash (Cashu/Fedimint) nebo Ark pro platby kámošům se silným soukromím
- coin control: vybírat, které mince z Trezoru se utrácejí
