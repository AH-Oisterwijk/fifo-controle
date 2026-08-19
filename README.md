# FIFO Controle

Browsergebaseerde FIFO-controle voor gebruik op handterminals, telefoons en pc's. De webapp draait statisch via GitHub Pages, leest product- en personenlijsten uit CSV-bestanden, vult Microsoft Forms vooraf in en gebruikt Power Automate + Office Scripts om de controle in `Shift Overdracht.xlsx` te verwerken.

## Omgevingen

Deze repository gebruikt twee branches:

- `main` = productie
- `beta` = testen van nieuwe wijzigingen

GitHub Actions publiceert beide branches tegelijk:

- productie: `https://ah-oisterwijk.github.io/fifo-controle/`
- beta: `https://ah-oisterwijk.github.io/fifo-controle/beta/`

Nieuwe functionaliteit wordt eerst op `beta` getest. Na goedkeuring kan `beta` via een pull request naar `main` worden gemerged.

## Structuur

```text
.github/
  workflows/
    pages.yml
assets/
  styles.css
data/
  products.csv
  medewerkers.csv
  shiftleiders.csv
js/
  app.js
  data.js
  forms.js
  qr.js
  state.js
  ui.js
config.js
index.html
fifo_shift_overdracht.ts
fifo_export_personen.ts
POWER_AUTOMATE_SETUP.md
README.md
```

### Webapp-bestanden

- `index.html` bevat alleen de pagina-structuur en laadt de losse CSS/JavaScript-bestanden.
- `assets/styles.css` bevat alle vormgeving.
- `js/data.js` laadt en parseert de CSV-bestanden.
- `js/state.js` beheert de dagelijkse productselectie, gevuld/niet-gevuld-statussen, weging en lokale opslag.
- `js/ui.js` rendert de interface en verwerkt gebruikersacties.
- `js/qr.js` genereert de QR-codes voor NASA-nummers.
- `js/forms.js` bouwt de controle-output en Microsoft Forms-link.
- `js/app.js` start de applicatie en koppelt de vaste pagina-events.
- `config.js` bevat de Microsoft Forms prefilled URL-template.

Deze opsplitsing is bewust zonder build-tool of framework gehouden: GitHub Pages kan de bestanden direct serveren en lokaal testen blijft eenvoudig.

## Productselectie

De webapp selecteert per dag 17 productregels:

```text
Zuivel               3
Boter                 1
Kaas/Vleeswaren       3
Vis                    1
Vlees/Vega             2
Kip                    1
Maaltijden             2
Sappen                 1
Panklaar               3
```

De hoofdafdelingen blijven:

```text
Zuivel
Kaas/Vleeswaren
Vlees/Vis/Kip/Vega
Maaltijden/Sappen
Panklaar
```

Vlees en Vega vormen in de webapp samen de selectiegroep `Vlees/Vega` met twee controles per dag. Vis en Kip blijven aparte groepen. In `data/products.csv` blijven `Vlees` en `Vega` bewust als afzonderlijke subafdelingen opgeslagen, zodat die scheiding later eenvoudig kan worden teruggebracht. Maaltijden/Sappen en Zuivel/Boter blijven eveneens als afzonderlijke gevuld/niet-gevuld-groepen werken.

## `data/products.csv`

Verplicht formaat:

```text
Nasa;Productnaam;Afdeling;Subafdeling;Actief;Gewicht;Kans14
```

Betekenis:

- `Nasa`: NASA-/artikelnummer.
- `Productnaam`: naam die in de controle wordt getoond.
- `Afdeling`: hoofdafdeling voor scoring en rapportage.
- `Subafdeling`: oorspronkelijke productsubafdeling. `Vlees` en `Vega` blijven hier bewust apart; de webapp combineert ze tijdens selectie tot `Vlees/Vega`.
- `Actief`: `Ja` voor producten die geselecteerd mogen worden.
- `Kans14`: op hoeveel van de 14 geanalyseerde dagen het product binnenkwam, van 1 t/m 14.
- `Gewicht`: selectieweging. De huidige productdata gebruikt in principe `Kans14³`, zodat frequent binnenkomende producten duidelijk vaker worden geselecteerd.

De eerste dagelijkse selectie is deterministisch per datum: dezelfde datum en dezelfde CSV-versie leveren dezelfde initiële selectie op.

### Ander willekeurig product

`Ander willekeurig product` gebruikt dezelfde gewogen productpool. Per controleslot wordt bijgehouden welke producten al zijn geskipt. Een product kan pas opnieuw in de cyclus komen nadat alle beschikbare alternatieven voor dat slot voorbij zijn geweest.

## Personenlijsten

### `data/medewerkers.csv`

```text
Medewerkers
Voornaam Achternaam
...
```

Deze lijst wordt gebruikt als bij een FIFO-fout wordt aangegeven dat de medewerker daadwerkelijk is aangesproken.

### `data/shiftleiders.csv`

```text
Shiftleiders / Managers
Naam
...
```

De gekozen shiftleider/manager wordt met de controle meegestuurd.

Beide lijsten kunnen via de personen-sync-flow uit `Shift Overdracht.xlsx` naar GitHub worden geëxporteerd. Zie `POWER_AUTOMATE_SETUP.md`.

## Microsoft Forms

De webapp gebruikt één Microsoft Form met twee velden:

```text
Datum
Controle data
```

`config.js` bevat één prefilled URL-template met:

```text
__DATUM__
__CONTROLE_DATA__
```

De applicatie bouwt bij afronden een compacte payload en opent Microsoft Forms met de gegevens vooraf ingevuld. De gebruiker bevestigt daar de inzending met de normale Forms-knop.

`config.js` wordt bewust niet opgesplitst per branch. Zowel productie als beta gebruiken dezelfde configuratiestructuur.

## Waarschuwingen

Bij status `Fout` kan `Medewerker aanspreken` worden aangevinkt. Dit hoort alleen te gebeuren als de medewerker ook daadwerkelijk is aangesproken.

Als een medewerker is gekozen, schrijft het Office Script een waarschuwing naar:

```text
Werkblad: Lijst waarschuwingen
Tabel: Tabel_waarschuwingen
```

De tabel heeft vaste bestaande rijen. Het script zoekt de eerstvolgende lege tabelrij en maakt de tabel niet groter.

Vaste waarden:

```text
Reden = Niet FIFO
Officieel (Schriftelijk) = Nee
```

De opmerking wordt opgeslagen als:

```text
Productnaam (NASA)
```

## Office Script: `fifo_shift_overdracht.ts`

Er is één Office Script voor zowel normale Power Automate-runs als het aanmaken/herstellen van de FIFO-detailbladen.

Ondersteunde modes:

### `fifo`

Verwerkt een Forms-inzending, schrijft de uitslag naar de juiste week/dagcel, voegt de historische regels toe aan `FIFO Controle Data`, vernieuwt `FIFO Controle Details` en schrijft eventuele waarschuwingen.

### `missing`

Registreert een niet-uitgevoerde controle als de betreffende dagcel nog leeg is:

```text
Niet uitgevoerd 🙁
```

### `setup`

Bouwt/herbouwt het dashboard op basis van de bestaande historie.

Het script controleert bij normale runs zelf of deze werkbladen bestaan:

```text
FIFO Controle Details
FIFO Controle Data
```

Als één van beide ontbreekt, wordt het ontbrekende blad automatisch aangemaakt. Bestaande inhoud van `FIFO Controle Data` wordt daarbij niet verwijderd.

## FIFO Controle Details

Het dashboard bevat een dagselectie en weekselectie. Formules reageren op de gekozen datum/week en blijven dus niet op de laatst uitgevoerde controle hangen.

Bij een nieuwe `fifo`- of `missing`-run wordt de dashboardselectie automatisch op de datum en week van die nieuwe run gezet.

De weekwaarde `Niet uitgevoerd` telt de zichtbare dagen met status `Niet uitgevoerd`; dubbele ruwe `MISSING`-regels tellen daardoor niet meerdere keren mee.

## Shift Overdracht

Het script bepaalt de ISO-week en schrijft naar het bijbehorende werkblad, bijvoorbeeld:

```text
WK32-2026
```

Dagcellen:

```text
Maandag     B20
Dinsdag     C20
Woensdag    D20
Donderdag   E20
Vrijdag     F20
Zaterdag    G20
Zondag      H20
```

De tekst in de dagcel linkt naar `FIFO Controle Details`.

## Power Automate

De huidige opzet gebruikt drie flows:

1. Forms-inzending verwerken (`mode = fifo`).
2. Niet-uitgevoerde controle registreren (`mode = missing`).
3. Medewerkers en shiftleiders vanuit Excel naar GitHub exporteren.

De concrete acties en parameters staan in `POWER_AUTOMATE_SETUP.md`.

## GitHub Pages

`.github/workflows/pages.yml` bouwt één Pages-artifact met:

```text
main → /
beta → /beta/
```

Daardoor kan beta onafhankelijk getest worden zonder productie te wijzigen.

## Lokaal testen

Open `index.html` niet rechtstreeks via `file://`, omdat de browser dan de CSV-fetches kan blokkeren.

Start vanuit de repositorymap:

```bash
python3 -m http.server 8080
```

Open daarna:

```text
http://localhost:8080/
```

Controleer minimaal:

- `data/products.csv` wordt geladen;
- medewerkers en shiftleiders verschijnen in de dropdowns;
- productselectie telt 17 regels;
- gevuld/niet gevuld werkt per subafdeling;
- Goed/Fout blijft zichtbaar geselecteerd;
- `Ander willekeurig product` herhaalt geen geskipt product voordat de pool op is;
- de Forms-link bevat een datum en compacte `FIFO_JSON:`-payload.

## Wijzigingsworkflow

Werk voor nieuwe functionaliteit op `beta`:

```text
1. wijzig beta
2. wacht tot GitHub Pages is gedeployed
3. test /fifo-controle/beta/
4. maak na goedkeuring een pull request beta → main
```

`main` is de productiebranch en hoort niet direct gebruikt te worden voor experimentele wijzigingen.
