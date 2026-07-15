# FIFO Controle

Statische GitHub Pages-site voor FIFO-controles.

De pagina leest CSV-bestanden uit de map `data/`, vult Microsoft Forms vooraf in en Power Automate verwerkt de Forms-inzending in `Shift Overdracht.xlsx`.

## Bestanden

```text
index.html
config.js
README.md
POWER_AUTOMATE_SETUP.md
fifo_shift_overdracht.ts
fifo_export_personen.ts
data/products.csv
data/medewerkers.csv
data/shiftleiders.csv
```

## CSV-bestanden

De HTML leest deze bestanden:

```text
data/products.csv
data/medewerkers.csv
data/shiftleiders.csv
```

### data/products.csv

Kolommen:

```text
Nasa;Productnaam;Afdeling;Subafdeling;Actief
```

### data/medewerkers.csv

Kolom:

```text
Medewerkers
```

### data/shiftleiders.csv

Kolom:

```text
Shiftleiders / Managers
```

`medewerkers.csv` en `shiftleiders.csv` kunnen automatisch vanuit `Shift Overdracht.xlsx` worden bijgewerkt met Power Automate.

## Microsoft Forms

Gebruik één formulier met deze velden:

```text
Datum
Controle data
```

Aanbevolen veldtypes:

```text
Datum = datum
Controle data = lang antwoord / lange tekst
```

Maak een prefilled Forms-link en gebruik daarin deze placeholders:

```text
__DATUM__
__CONTROLE_DATA__
```

Plak de volledige link in `config.js`.

## Shift Overdracht

Het Office Script schrijft per dag naar de juiste cel:

```text
Maandag    B20
Dinsdag    C20
Woensdag   D20
Donderdag  E20
Vrijdag    F20
Zaterdag   G20
Zondag     H20
```

De week-sheet wordt bepaald met ISO-weeknummer, bijvoorbeeld:

```text
WK21-2026
```

Mogelijke teksten in de cel:

```text
FIFO gecontroleerd: alles goed 😃
FIFO gecontroleerd: fout bij Zuivel
FIFO gecontroleerd: niet gevuld bij Panklaar
FIFO gecontroleerd: fout bij Zuivel | niet gevuld bij Panklaar
Niet uitgevoerd 🙁
```

## Waarschuwingen

Bij een product met status **Fout** kan in de HTML worden aangevinkt:

```text
Medewerker aanspreken
```

Als dit is aangevinkt, moet een medewerker gekozen worden. Power Automate zet deze regel vervolgens in:

```text
Sheet: Lijst waarschuwingen
Tabel: Tabel_waarschuwingen
```

Met vaste waarden:

```text
Reden = Niet FIFO
Officieel (Schriftelijk) = Nee
```

## Lokaal testen

Gebruik niet dubbelklikken op `index.html`.

Gebruik:

```bash
python3 -m http.server 8080
```

Open daarna:

```text
http://localhost:8080/
```
