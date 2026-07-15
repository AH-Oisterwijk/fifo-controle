# Power Automate setup - FIFO Controle

## Overzicht

Er zijn drie flows:

```text
1. Forms-inzending verwerken
2. Niet-uitgevoerde FIFO controleren
3. Personenlijsten exporteren naar GitHub
```

## Microsoft Forms

Gebruik deze Forms-velden:

```text
Datum
Controle data
```

Aanbevolen:

```text
Datum = datum
Controle data = lang antwoord / lange tekst
```

Maak een prefilled Forms-link met:

```text
Datum: __DATUM__
Controle data: __CONTROLE_DATA__
```

Als Forms niet direct placeholders accepteert, vul dan testwaarden in:

```text
2026-01-30
TESTDATA
```

Maak de prefilled link en vervang daarna in de URL:

```text
2026-01-30 → __DATUM__
TESTDATA   → __CONTROLE_DATA__
```

Plak de volledige link in `config.js`.

---

# Flow 1 - Forms-inzending verwerken

Trigger:

```text
Microsoft Forms → When a new response is submitted
```

Daarna:

```text
Microsoft Forms → Get response details
```

Daarna:

```text
Excel Online (Business) → Run script
```

Gebruik script:

```text
fifo_shift_overdracht.ts
```

Parameters:

```text
mode = fifo
password = jouw bladwachtwoord
dateKey = antwoord "Datum"
controleData = antwoord "Controle data"
```

Het script schrijft de FIFO-status in de juiste dagcel en voegt eventuele waarschuwingen toe aan `Tabel_waarschuwingen`.

---

# Flow 2 - Niet-uitgevoerde FIFO controleren

Maak een scheduled cloud flow, bijvoorbeeld dagelijks om 22:30.

## Compose

Gebruik deze expression:

```text
formatDateTime(convertTimeZone(utcNow(),'UTC','W. Europe Standard Time'),'yyyy-MM-dd')
```

## Run script

Gebruik script:

```text
fifo_shift_overdracht.ts
```

Parameters:

```text
mode = missing
password = jouw bladwachtwoord
dateKey = Outputs van Compose
controleData = leeg
```

Het script schrijft alleen als de dagcel nog leeg is:

```text
Niet uitgevoerd 🙁
```

---

# Flow 3 - Personenlijsten exporteren naar GitHub

Deze flow werkt `data/medewerkers.csv` en `data/shiftleiders.csv` automatisch bij vanuit `Shift Overdracht.xlsx`.

## Bron in Excel

Deze tabellen moeten bestaan:

```text
Tabel_medewerkers
Tabel_shiftleiders
```

`Tabel_medewerkers` heeft kolom:

```text
Medewerkers
```

`Tabel_shiftleiders` gebruikt de eerste kolom:

```text
Shiftleiders / Managers
```

## Run script

Gebruik script:

```text
fifo_export_personen.ts
```

Dit script geeft JSON terug met:

```text
medewerkersCsv
shiftleidersCsv
medewerkersAantal
shiftleidersAantal
exportedAt
```

## Parse JSON

Gebruik als content de output van de Run script-actie.

Schema:

```json
{
  "type": "object",
  "properties": {
    "medewerkersCsv": { "type": "string" },
    "shiftleidersCsv": { "type": "string" },
    "medewerkersAantal": { "type": "integer" },
    "shiftleidersAantal": { "type": "integer" },
    "exportedAt": { "type": "string" }
  }
}
```

## GitHub-token

Maak een fine-grained personal access token voor de repository.

Benodigde rechten:

```text
Repository permissions → Contents → Read and write
```

Zet dit token alleen in Power Automate. Niet in `index.html` of `config.js`.

## data/medewerkers.csv bijwerken

### HTTP GET

```text
GET https://api.github.com/repos/OWNER/REPO/contents/data/medewerkers.csv
```

Headers:

```text
Accept: application/vnd.github+json
Authorization: Bearer JOUW_GITHUB_TOKEN
X-GitHub-Api-Version: 2022-11-28
```

### HTTP PUT

```text
PUT https://api.github.com/repos/OWNER/REPO/contents/data/medewerkers.csv
```

Headers:

```text
Accept: application/vnd.github+json
Authorization: Bearer JOUW_GITHUB_TOKEN
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

Body:

```json
{
  "message": "Update medewerkers.csv",
  "content": "@{base64(body('Parse_JSON')?['medewerkersCsv'])}",
  "sha": "@{body('HTTP_GET_medewerkers')?['sha']}"
}
```

## data/shiftleiders.csv bijwerken

### HTTP GET

```text
GET https://api.github.com/repos/OWNER/REPO/contents/data/shiftleiders.csv
```

Headers hetzelfde als hierboven.

### HTTP PUT

```text
PUT https://api.github.com/repos/OWNER/REPO/contents/data/shiftleiders.csv
```

Body:

```json
{
  "message": "Update shiftleiders.csv",
  "content": "@{base64(body('Parse_JSON')?['shiftleidersCsv'])}",
  "sha": "@{body('HTTP_GET_shiftleiders')?['sha']}"
}
```

Zorg dat beide CSV-bestanden al bestaan in GitHub, zodat de GET-stap de `sha` kan ophalen.

---

# Conditional formatting

Gebruik op de FIFO-cellen, bijvoorbeeld `B20:H20`:

```text
Niet uitgevoerd → rood
fout bij → geel/oranje
niet gevuld bij → blauw/lichtgrijs
alles goed → groen
```

Betekenis:

```text
Rood = controle niet gedaan
Geel/oranje = controle gedaan, FIFO-fout gevonden
Blauw/grijs = controle gedaan, afdeling was niet gevuld
Groen = controle gedaan, alles akkoord
```
