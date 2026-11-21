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

## Spuštění
Trezor Connect potřebuje HTTPS (nebo `localhost`):
```
python3 -m http.server 8080   # v kořeni repa, pak http://localhost:8080/kapsa/
```
