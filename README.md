# FIFO Controle productie v2

## Wat is nieuw

- Microsoft Forms kan nu ook zonder HTML gebruikt worden:
  - Nasa-velden per afdeling zijn optioneel.
  - Scorevelden per afdeling zijn verplicht.
  - Scoreformat: `x/y`.
- De HTML vult alle Nasa-velden en scorevelden vooraf in.
- Per productkaart:
  - `Ander willekeurig product`
  - `Zelf een product kiezen`
- Handmatig gekozen Nasa's mogen niet dubbel voorkomen binnen hetzelfde hoofdblok.
- De resetknop bovenaan wist statussen, fouttoelichtingen en aangepaste Nasa's na bevestiging.
- `Niet gevuld` telt niet mee in de score-noemer.

## Bestanden

Upload naar GitHub Pages:

```text
index.html
products.csv
config.js
README.md
```

Voor Power Automate / Excel:

```text
fifo_shift_overdracht_v2.ts
POWER_AUTOMATE_STAPPEN_V2.md
```

## products.csv

Kolommen:

```csv
Nasa;Productnaam;Afdeling;Subafdeling;Actief
```

Voorbeeld:

```csv
106375;ah bio halfv melk 1 lt;Zuivel;Zuivel;Ja
```

Afdeling moet één van deze zijn:

```text
Zuivel
Kaas/Vleeswaren
Vlees/Vis/Kip/Vega
Maaltijden/Sappen
Panklaar
```

Subafdeling moet één van deze zijn:

```text
Zuivel
Kaas/Vleeswaren
Vis
Vlees
Kip
Vega
Maaltijden
Sappen
Panklaar
```

## Scorelogica

Voor Forms/Excel wordt per afdeling alleen `x/y` ingevuld.

Voorbeeld:

- 4 producten gevraagd
- 3 goed
- 1 niet gevuld

Resultaat:

```text
3/3
```

Als er 1 fout is en 1 niet gevuld:

```text
2/3
```

## Prefilled Forms-link

Zie `POWER_AUTOMATE_STAPPEN_V2.md` voor alle placeholders.

De link plak je in:

```text
config.js
```

## Lokaal testen

Gebruik niet dubbelklikken op `index.html`, want dan kan de browser `products.csv` vaak niet lezen.

Gebruik:

```bash
python3 -m http.server 8080
```

Open daarna:

```text
http://localhost:8080/
```