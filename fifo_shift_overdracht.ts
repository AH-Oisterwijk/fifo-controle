const DETAILS_SHEET_NAME = "FIFO Controle Details";
const DATA_SHEET_NAME = "FIFO Controle Data";
const ALLOW_WORKBOOK_SETUP = true;
const DASHBOARD_DETAIL_FIRST_ROW = 9;
const DASHBOARD_DETAIL_ROWS = 120; // Ruimer dan praktisch mogelijk binnen het huidige Forms-URL-budget.

function main(
  workbook: ExcelScript.Workbook,
  mode: string = "",
  password: string = "",
  dateKey: string = "",
  controleData: string = ""
): string {
  const cleanMode = normalize(mode);

  if (cleanMode === "setup") {
    if (!ALLOW_WORKBOOK_SETUP) {
      throw new Error("Setup is niet beschikbaar in deze versie. Gebruik fifo_shift_overdracht_eerste_run.ts voor de eenmalige setup.");
    }

    runDashboardSetup(workbook, password);
    return `OK setup: '${DETAILS_SHEET_NAME}' en '${DATA_SHEET_NAME}' zijn aangemaakt/bijgewerkt en beveiligd.`;
  }

  const parsedDate = parseDateKey(dateKey);
  const week = getIsoWeekAndYear(parsedDate);
  const sheetName = `WK${week.week}-${week.year}`;

  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(`Werkblad '${sheetName}' niet gevonden.`);
  }

  const targetCell = getTargetCell(parsedDate);
  const protectionWasPaused = pauseProtectionIfNeeded(sheet, password);

  try {
    const range = sheet.getRange(targetCell);

    if (cleanMode === "missing") {
      const currentValue = String(range.getValue() ?? "").trim();

      if (currentValue === "") {
        range.setValue("Niet uitgevoerd 🙁");
        registerMissingControle(workbook, password, dateKey);
      }

      return `OK missing-check: ${sheetName}!${targetCell}`;
    }

    if (cleanMode !== "fifo") {
      throw new Error(`Onbekende mode: ${mode}`);
    }

    const payload = parseControleData(controleData);
    const analyse = analyseFifoControle(payload, dateKey);

    updateFifoDetails(workbook, password, analyse);
    addWaarschuwingen(workbook, password, payload, dateKey);

    const cellText = buildMainCellText(analyse);
    setInternalHyperlinkFormula(range, DETAILS_SHEET_NAME, "A1", cellText);

    return `OK fifo: ${sheetName}!${targetCell} = ${cellText}; NASA-regels=${analyse.Details.length}; Producten=${(payload.Producten || []).length}`;
  } finally {
    if (protectionWasPaused) {
      sheet.getProtection().resumeProtection();
    }
  }
}

interface ControlePayload {
  DatumTijd?: string;
  DagKey?: string;
  Shiftleider?: string;
  Scores?: { [key: string]: string };
  AfdelingStatussen?: { [key: string]: AfdelingStatus };
  AfdelingenNietGevuld?: string[];
  Producten?: ProductRegel[];
  Waarschuwingen?: WaarschuwingRegel[];
}

interface AfdelingStatus {
  Status?: string;
  Score?: string;
}

interface ProductRegel {
  Subafdeling?: string;
  Afdeling?: string;
  Nasa?: string;
  Productnaam?: string;
  Status?: string;
  MedewerkerNaam?: string;
  AfdelingNietGevuld?: boolean;

  // Compacte veldnamen vanuit index.html, zodat de Forms-URL korter blijft.
  S?: string;
  A?: string;
  N?: string;
  P?: string;
  T?: string;
  M?: string;
  G?: boolean;
}

interface WaarschuwingRegel {
  DatumGegeven?: string;
  NaamMedewerker?: string;
  Reden?: string;
  Officieel?: string;
  ShiftleiderManager?: string;
  Opmerkingen?: string;
}


interface CompactControlePayload {
  v?: number;
  d?: string;
  dt?: string;
  s?: string;
  sc?: { [key: string]: string };
  st?: { [key: string]: string };
  ng?: string[];
  p?: (string | number | boolean)[][];
  w?: (string | number | boolean)[][];
}

interface DetailRegel {
  DatumKey: string;
  DatumTijd: string;
  Shiftleider: string;
  Afdeling: string;
  Subafdeling: string;
  Nasa: string;
  Productnaam: string;
  Status: string;
  Medewerker: string;
  TeltMee: boolean;
  Correct: boolean;
}

interface AfdelingSamenvatting {
  Afdeling: string;
  Status: string;
  Correct: number;
  Totaal: number;
  Percentage: string;
  Fout: number;
}

interface FifoAnalyse {
  DatumKey: string;
  DatumTijd: string;
  Shiftleider: string;
  Correct: number;
  Totaal: number;
  Percentage: number;
  PercentageTekst: string;
  Details: DetailRegel[];
  Samenvatting: AfdelingSamenvatting[];
  ProductDetailsAanwezig: boolean;
}


function runDashboardSetup(workbook: ExcelScript.Workbook, password: string): void {
  const existingDataSheet = workbook.getWorksheet(DATA_SHEET_NAME);
  const storedHistoryRowsBefore = existingDataSheet ? countStoredHistoryRows(existingDataSheet) : 0;

  resetDetailSheetsForSetup(workbook, password);

  let workbookWasProtected = unprotectWorkbookIfNeeded(workbook, password);

  try {
    const dataSheet = getRequiredWorksheet(workbook, DATA_SHEET_NAME);
    dataSheet.setVisibility(ExcelScript.SheetVisibility.visible);

    const storedHistoryRowsAfterReset = countStoredHistoryRows(dataSheet);
    if (storedHistoryRowsAfterReset < storedHistoryRowsBefore) {
      throw new Error(`Setup afgebroken: FIFO Controle Data bevat na de dashboard-reset minder historische regels (${storedHistoryRowsAfterReset}) dan ervoor (${storedHistoryRowsBefore}).`);
    }

    // FIFO Controle Data blijft onbeschermd. De sheet wordt verborgen en de werkboekstructuur wordt beschermd,
    // waardoor gebruikers hem niet kunnen openen zonder werkboekwachtwoord.
    ensureHistoryHeader(dataSheet);
    refreshAvailableLists(dataSheet);

    const storedHistoryRowsAfterRefresh = countStoredHistoryRows(dataSheet);
    if (storedHistoryRowsAfterRefresh < storedHistoryRowsBefore) {
      throw new Error(`Setup afgebroken: FIFO Controle Data verloor tijdens het vernieuwen historische regels (${storedHistoryRowsAfterRefresh}/${storedHistoryRowsBefore}).`);
    }

    const dashboardSheet = getRequiredWorksheet(workbook, DETAILS_SHEET_NAME);
    const dashboardPaused = pauseProtectionIfNeeded(dashboardSheet, password);

    try {
      buildDashboardSheet(
        dashboardSheet,
        getLatestDateDisplay(dataSheet),
        getLatestWeekDisplay(dataSheet)
      );
    } finally {
      protectOrResume(dashboardSheet, password, dashboardPaused);
    }

    dataSheet.setVisibility(ExcelScript.SheetVisibility.hidden);
  } finally {
    if (workbookWasProtected) {
      workbook.getProtection().protect(password);
    }
  }
}

function parseControleData(controleData: string): ControlePayload {
  let text = String(controleData || "").trim();

  if (!text) {
    throw new Error("Controle data is leeg. Controleer of het Forms-veld 'Controle data' goed is gekoppeld in Power Automate.");
  }

  if (text.startsWith("FIFO_JSON:")) {
    text = text.substring("FIFO_JSON:".length).trim();
  }

  try {
    const parsed = JSON.parse(text) as ControlePayload & CompactControlePayload;
    return expandCompactControlePayload(parsed);
  } catch (e) {
    throw new Error("Controle data is geen geldige JSON. Controleer of de HTML de Forms-link goed vult.");
  }
}

function expandCompactControlePayload(payload: ControlePayload & CompactControlePayload): ControlePayload {
  const isCompact = payload.v === 3 || Boolean(payload.d || payload.dt || payload.s || payload.sc || payload.st || payload.ng || payload.p || payload.w);

  if (!isCompact) {
    return payload as ControlePayload;
  }

  const scores: { [key: string]: string } = payload.Scores || {};
  const afdelingStatussen: { [key: string]: AfdelingStatus } = payload.AfdelingStatussen || {};
  const afdelingenNietGevuld: string[] = payload.AfdelingenNietGevuld || [];
  const producten: ProductRegel[] = payload.p ? [] : (payload.Producten || []);
  const waarschuwingen: WaarschuwingRegel[] = payload.Waarschuwingen || [];

  if (payload.sc) {
    const keys = Object.keys(payload.sc);

    for (const key of keys) {
      const afdeling = decodeAfdelingCode(key);
      scores[afdeling] = String(payload.sc[key] || "");
    }
  }

  if (payload.st) {
    const keys = Object.keys(payload.st);

    for (const key of keys) {
      const afdeling = decodeAfdelingCode(key);
      const statusCode = String(payload.st[key] || "");
      const status = statusCode === "N" ? "Niet gevuld vandaag" : "Gevuld";

      afdelingStatussen[afdeling] = {
        Status: status,
        Score: scores[afdeling] || ""
      };
    }
  }

  if (payload.ng) {
    for (const code of payload.ng) {
      const afdeling = decodeAfdelingCode(String(code || ""));

      if (!afdelingenNietGevuld.some(x => normalize(x) === normalize(afdeling))) {
        afdelingenNietGevuld.push(afdeling);
      }

      afdelingStatussen[afdeling] = {
        Status: "Niet gevuld vandaag",
        Score: scores[afdeling] || "0/0"
      };
    }
  }

  if (payload.p) {
    for (const row of payload.p) {
      const afdeling = decodeAfdelingCode(String(row[0] ?? ""));
      const nasa = String(row[1] ?? "").trim();
      const status = decodeStatusCode(String(row[2] ?? ""));
      const medewerker = String(row[3] ?? "").trim();
      const afdelingNietGevuld = toCompactBoolean(row[4]) || normalize(status) === normalize("Afdeling niet gevuld");

      producten.push({
        Afdeling: afdeling,
        Subafdeling: "",
        Nasa: nasa,
        Productnaam: "",
        Status: afdelingNietGevuld ? "Afdeling niet gevuld" : status,
        MedewerkerNaam: medewerker,
        AfdelingNietGevuld: afdelingNietGevuld
      });
    }
  }

  if (payload.w) {
    for (const row of payload.w) {
      const naamMedewerker = String(row[1] ?? "").trim();

      if (!naamMedewerker) {
        continue;
      }

      waarschuwingen.push({
        DatumGegeven: String(row[0] ?? payload.d ?? "").trim(),
        NaamMedewerker: naamMedewerker,
        Reden: "Niet FIFO",
        Officieel: "Nee",
        ShiftleiderManager: String(row[2] ?? payload.s ?? "").trim(),
        Opmerkingen: String(row[3] ?? "").trim()
      });
    }
  }

  return {
    DatumTijd: String(payload.dt || payload.DatumTijd || "").trim(),
    DagKey: String(payload.d || payload.DagKey || "").trim(),
    Shiftleider: String(payload.s || payload.Shiftleider || "").trim(),
    Scores: scores,
    AfdelingStatussen: afdelingStatussen,
    AfdelingenNietGevuld: afdelingenNietGevuld,
    Producten: producten,
    Waarschuwingen: waarschuwingen
  };
}

function decodeAfdelingCode(code: string): string {
  const clean = String(code || "").trim();

  if (clean === "Z") return "Zuivel";
  if (clean === "K") return "Kaas/Vleeswaren";
  if (clean === "V") return "Vlees/Vis/Kip/Vega";
  if (clean === "M") return "Maaltijden/Sappen";
  if (clean === "P") return "Panklaar";

  return clean;
}

function decodeStatusCode(code: string): string {
  const clean = String(code || "").trim();

  if (clean === "G") return "Goed";
  if (clean === "F") return "Fout";
  if (clean === "N") return "Niet gevuld";
  if (clean === "A") return "Afdeling niet gevuld";

  return clean || "Onbekend";
}

function toCompactBoolean(value: string | number | boolean): boolean {
  if (value === true || value === 1) return true;

  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "ja";
}

function analyseFifoControle(payload: ControlePayload, fallbackDateKey: string): FifoAnalyse {
  const datumKey = String(payload.DagKey || fallbackDateKey || "").trim();
  const datumTijd = String(payload.DatumTijd || "").trim();
  const shiftleider = String(payload.Shiftleider || "").trim();

  const afdelingen = [
    "Zuivel",
    "Kaas/Vleeswaren",
    "Vlees/Vis/Kip/Vega",
    "Maaltijden/Sappen",
    "Panklaar"
  ];

  const producten = payload.Producten || [];
  const details: DetailRegel[] = [];

  for (const p of producten) {
    const afdeling = productText(p, "Afdeling", "A");
    const afdelingNietGevuld = productBool(p, "AfdelingNietGevuld", "G") || isAfdelingNietGevuld(payload, afdeling);
    const ruweStatus = productText(p, "Status", "T");
    let status = afdelingNietGevuld ? "Afdeling niet gevuld" : (ruweStatus || "Geen registratie");

    if (
      normalize(status) === normalize("Open") ||
      normalize(status) === normalize("Onbekend")
    ) {
      status = "Geen registratie";
    }

    const teltMee =
      !afdelingNietGevuld &&
      normalize(status) !== normalize("Niet gevuld") &&
      normalize(status) !== normalize("Geen registratie");

    const correct = teltMee && normalize(status) === normalize("Goed");

    details.push({
      DatumKey: datumKey,
      DatumTijd: datumTijd,
      Shiftleider: shiftleider,
      Afdeling: afdeling,
      Subafdeling: productText(p, "Subafdeling", "S"),
      Nasa: productText(p, "Nasa", "N"),
      Productnaam: productText(p, "Productnaam", "P"),
      Status: status,
      Medewerker: productText(p, "MedewerkerNaam", "M"),
      TeltMee: teltMee,
      Correct: correct
    });
  }

  const samenvatting: AfdelingSamenvatting[] = [];
  let totaalCorrect = 0;
  let totaalMeetellend = 0;

  for (const afdeling of afdelingen) {
    const nietGevuld = isAfdelingNietGevuld(payload, afdeling);

    if (producten.length > 0) {
      const regels = details.filter(r => normalize(r.Afdeling) === normalize(afdeling));
      const meetellend = regels.filter(r => r.TeltMee);
      const correct = meetellend.filter(r => r.Correct).length;
      const totaal = meetellend.length;
      const fout = meetellend.filter(r => !r.Correct).length;

      if (!nietGevuld) {
        totaalCorrect += correct;
        totaalMeetellend += totaal;
      }

      samenvatting.push({
        Afdeling: afdeling,
        Status: nietGevuld ? "Niet gevuld" : "Gevuld",
        Correct: nietGevuld ? 0 : correct,
        Totaal: nietGevuld ? 0 : totaal,
        Percentage: nietGevuld ? "-" : percentageText(correct, totaal),
        Fout: nietGevuld ? 0 : fout
      });
    } else {
      const score = scoreForAfdeling(payload, afdeling);
      const parsed = parseScore(score);

      if (!nietGevuld && parsed) {
        totaalCorrect += parsed.correct;
        totaalMeetellend += parsed.total;
      }

      samenvatting.push({
        Afdeling: afdeling,
        Status: nietGevuld ? "Niet gevuld" : "Gevuld",
        Correct: nietGevuld || !parsed ? 0 : parsed.correct,
        Totaal: nietGevuld || !parsed ? 0 : parsed.total,
        Percentage: nietGevuld || !parsed ? "-" : percentageText(parsed.correct, parsed.total),
        Fout: nietGevuld || !parsed ? 0 : Math.max(parsed.total - parsed.correct, 0)
      });
    }
  }

  const percentage = totaalMeetellend > 0 ? Math.round((totaalCorrect / totaalMeetellend) * 100) : 0;

  return {
    DatumKey: datumKey,
    DatumTijd: datumTijd,
    Shiftleider: shiftleider,
    Correct: totaalCorrect,
    Totaal: totaalMeetellend,
    Percentage: percentage,
    PercentageTekst: totaalMeetellend > 0 ? `${percentage}%` : "-",
    Details: details,
    Samenvatting: samenvatting,
    ProductDetailsAanwezig: producten.length > 0
  };
}

function updateFifoDetails(workbook: ExcelScript.Workbook, password: string, analyse: FifoAnalyse): void {
  ensureDetailSheets(workbook, password);

  let workbookWasProtected = unprotectWorkbookIfNeeded(workbook, password);

  try {
    const dataSheet = getRequiredWorksheet(workbook, DATA_SHEET_NAME);
    dataSheet.setVisibility(ExcelScript.SheetVisibility.visible);

    // Runtime doet alleen data-opslag en keuzelijsten. Het dashboard zelf is eenmalig door setup gebouwd.
    appendHistorieData(dataSheet, analyse);
    refreshAvailableLists(dataSheet);

    // B3 (dag) en K3 (week) blijven bewust onaangeraakt. De permanente formules rekenen automatisch door.
    dataSheet.setVisibility(ExcelScript.SheetVisibility.hidden);
  } finally {
    if (workbookWasProtected) {
      workbook.getProtection().protect(password);
    }
  }
}

function registerMissingControle(workbook: ExcelScript.Workbook, password: string, dateKey: string): void {
  ensureDetailSheets(workbook, password);

  let workbookWasProtected = unprotectWorkbookIfNeeded(workbook, password);

  try {
    const dataSheet = getRequiredWorksheet(workbook, DATA_SHEET_NAME);
    dataSheet.setVisibility(ExcelScript.SheetVisibility.visible);

    // Runtime doet alleen data-opslag en keuzelijsten. De gekozen dag/week in Details blijven staan.
    appendMissingData(dataSheet, dateKey);
    refreshAvailableLists(dataSheet);

    dataSheet.setVisibility(ExcelScript.SheetVisibility.hidden);
  } finally {
    if (workbookWasProtected) {
      workbook.getProtection().protect(password);
    }
  }
}

function ensureDetailSheets(workbook: ExcelScript.Workbook, password: string): void {
  // setup is de enige modus die sheets aanmaakt. Runtime mag een ontbrekende setup niet stilzwijgend repareren.
  getRequiredWorksheet(workbook, DETAILS_SHEET_NAME);
  getRequiredWorksheet(workbook, DATA_SHEET_NAME);
}

function resetDetailSheetsForSetup(workbook: ExcelScript.Workbook, password: string): void {
  let workbookWasProtected = unprotectWorkbookIfNeeded(workbook, password);

  try {
    deleteWorksheetIfExists(workbook, DETAILS_SHEET_NAME, password);

    const existingDataSheet = workbook.getWorksheet(DATA_SHEET_NAME);
    if (!existingDataSheet) {
      workbook.addWorksheet(DATA_SHEET_NAME);
    }

    workbook.addWorksheet(DETAILS_SHEET_NAME);

    const warningSheet = workbook.getWorksheet("Lijst waarschuwingen");
    if (warningSheet) {
      getRequiredWorksheet(workbook, DETAILS_SHEET_NAME).setPosition(warningSheet.getPosition() + 1);
      getRequiredWorksheet(workbook, DATA_SHEET_NAME).setPosition(getRequiredWorksheet(workbook, DETAILS_SHEET_NAME).getPosition() + 1);
    }

    getRequiredWorksheet(workbook, DETAILS_SHEET_NAME).setVisibility(ExcelScript.SheetVisibility.visible);
    getRequiredWorksheet(workbook, DATA_SHEET_NAME).setVisibility(ExcelScript.SheetVisibility.visible);
  } finally {
    if (workbookWasProtected) {
      workbook.getProtection().protect(password);
    }
  }
}

function deleteWorksheetIfExists(workbook: ExcelScript.Workbook, name: string, password: string): void {
  const sheet = workbook.getWorksheet(name);

  if (sheet) {
    const protection = sheet.getProtection();

    if (protection.getProtected()) {
      if (!protection.checkPassword(password)) {
        throw new Error(`Onjuist werkbladwachtwoord voor werkblad '${name}'.`);
      }

      protection.pauseProtection(password);
    }

    sheet.delete();
  }
}

function buildSetupDashboard(sheet: ExcelScript.Worksheet): void {
  buildDashboardSheet(sheet, "", "");
}

function buildDashboardSheet(
  sheet: ExcelScript.Worksheet,
  selectedDateKey: string,
  selectedWeekDisplay: string
): void {
  const detailEndRow = DASHBOARD_DETAIL_FIRST_ROW + DASHBOARD_DETAIL_ROWS - 1;
  const canvasLastRow = Math.max(60, detailEndRow + 4);
  const canvas = sheet.getRange(`A1:Q${canvasLastRow}`);
  canvas.unmerge();
  canvas.clear(ExcelScript.ClearApplyTo.all);
  canvas.setNumberFormatLocal("General");

  // Eén dynamische helper bepaalt de laatste opgeslagen datarij. Alle permanente dashboardformules
  // gebruiken INDEX(...,$Q$1), zodat nieuwe fifo/missing-runs zichtbaar worden zonder dashboard-rebuild.
  sheet.getRange("Q1").setFormula(`=MAX(2,LOOKUP(2,1/('${DATA_SHEET_NAME}'!$P:$P<>""),ROW('${DATA_SHEET_NAME}'!$P:$P)))`);
  sheet.getRange("Q:Q").getFormat().setColumnWidth(2);
  sheet.getRange("Q:Q").getFormat().getFont().setColor("#FFFFFF");

  sheet.getRange("A1:E1").merge(false);
  sheet.getRange("A1").setFormula(`=IF($B$3="","Controle -",LET(x,$B$3,d,IF(ISNUMBER(x),x,DATE(VALUE(LEFT(x,4)),VALUE(MID(x,6,2)),VALUE(RIGHT(x,2)))),l,IF(INT(d)=TODAY(),"VANDAAG",IF(INT(d)=TODAY()-1,"GISTEREN",IF(INT(d)=TODAY()-2,"EERGISTEREN",""))),"Controle "&YEAR(d)&"-"&RIGHT("0"&MONTH(d),2)&"-"&RIGHT("0"&DAY(d),2)&IF(l="",""," ("&l&")")))`);
  sheet.getRange("A1:E1").getFormat().getFill().setColor("#1F4E78");
  sheet.getRange("A1:E1").getFormat().getFont().setColor("#FFFFFF");
  sheet.getRange("A1:E1").getFormat().getFont().setBold(true);
  sheet.getRange("A1").getFormat().getFont().setSize(16);

  sheet.getRange("A3").setValue("Datum");
  sheet.getRange("B3").setNumberFormatLocal("yyyy-mm-dd");
  sheet.getRange("B3").setValue(selectedDateKey);
  sheet.getRange("B3").getFormat().getFill().setColor("#FFF2CC");
  sheet.getRange("B3").getFormat().getFont().setBold(true);

  sheet.getRange("A5").setValue("Status");
  sheet.getRange("B5").setFormula(`=LET(d,IF(ISNUMBER($B$3),YEAR($B$3)&"-"&RIGHT("0"&MONTH($B$3),2)&"-"&RIGHT("0"&DAY($B$3),2),$B$3),t,IFERROR(MAXIFS('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),'${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),d),0),IF(d="","⚪ Geen datum gekozen",IF(t=0,"⚪ Geen registratie",IFERROR(SWITCH(INDEX(FILTER('${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),('${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1)=d)*('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1)=t)),1),"FIFO","🟩 Uitgevoerd","MISSING","🟥 Niet uitgevoerd","⚪ Onbekend"),"⚪ Geen registratie"))))`);
  sheet.getRange("D5").setValue("Score");
  sheet.getRange("E5").setFormula(`=LET(d,IF(ISNUMBER($B$3),YEAR($B$3)&"-"&RIGHT("0"&MONTH($B$3),2)&"-"&RIGHT("0"&DAY($B$3),2),$B$3),t,IFERROR(MAXIFS('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),'${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),d),0),g,COUNTIFS('${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),d,'${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),t,'${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),"FIFO",'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja",'${DATA_SHEET_NAME}'!$N$2:INDEX('${DATA_SHEET_NAME}'!$N:$N,$Q$1),"Ja"),n,COUNTIFS('${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),d,'${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),t,'${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),"FIFO",'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja"),IF(d="","-",IF(t=0,"-",IF(n=0,"-",IF(g=n,"🟩 ","🟥 ")&g&"/"&n))))`);

  sheet.getRange("A6").setValue("Shiftleider");
  sheet.getRange("B6").setFormula(`=LET(d,IF(ISNUMBER($B$3),YEAR($B$3)&"-"&RIGHT("0"&MONTH($B$3),2)&"-"&RIGHT("0"&DAY($B$3),2),$B$3),t,IFERROR(MAXIFS('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),'${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),d),0),raw,IF(OR(d="",t=0),"",IFERROR(INDEX(FILTER('${DATA_SHEET_NAME}'!$H$2:INDEX('${DATA_SHEET_NAME}'!$H:$H,$Q$1),('${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1)=d)*('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1)=t)),1),"")),s,TRIM(raw&""),IF(OR(d="",t=0,s="",s="0"),"-",s))`);
  sheet.getRange("D6").setValue("Percentage");
  sheet.getRange("E6").setFormula(`=LET(d,IF(ISNUMBER($B$3),YEAR($B$3)&"-"&RIGHT("0"&MONTH($B$3),2)&"-"&RIGHT("0"&DAY($B$3),2),$B$3),t,IFERROR(MAXIFS('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),'${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),d),0),g,COUNTIFS('${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),d,'${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),t,'${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),"FIFO",'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja",'${DATA_SHEET_NAME}'!$N$2:INDEX('${DATA_SHEET_NAME}'!$N:$N,$Q$1),"Ja"),n,COUNTIFS('${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),d,'${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),t,'${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),"FIFO",'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja"),IF(d="","-",IF(t=0,"-",IF(n=0,"-",ROUND(g/n*100,0)&"%"))))`);

  sheet.getRange(`A5:E${detailEndRow}`).setNumberFormatLocal("General");
  sheet.getRange("B3").setNumberFormatLocal("yyyy-mm-dd");
  sheet.getRange("A5:E6").getFormat().getFont().setBold(true);
  sheet.getRange("A3:A6").getFormat().getFill().setColor("#F2F2F2");
  sheet.getRange("D5:D6").getFormat().getFill().setColor("#F2F2F2");
  sheet.getRange("B5:B6").getFormat().getFill().setColor("#FFFFFF");
  sheet.getRange("E5:E6").getFormat().getFill().setColor("#FFFFFF");
  setThinBorders(sheet.getRange("A5:E6"));

  sheet.getRange("A8:E8").setValues([[
    "Afdeling",
    "NASA",
    "Resultaat",
    "Fout door ...",
    "Score"
  ]]);
  formatHeader(sheet.getRange("A8:E8"));

  sheet.getRange(`A${DASHBOARD_DETAIL_FIRST_ROW}:F${detailEndRow}`).clear(ExcelScript.ClearApplyTo.contents);
  sheet.getRange(`A${DASHBOARD_DETAIL_FIRST_ROW}:F${detailEndRow}`).setNumberFormatLocal("General");
  sheet.getRange(`A${DASHBOARD_DETAIL_FIRST_ROW}:F${detailEndRow}`).getFormat().getFill().setColor("#FFFFFF");
  setThinBorders(sheet.getRange(`A8:E${detailEndRow}`));

  for (let row = DASHBOARD_DETAIL_FIRST_ROW - 1; row < detailEndRow; row++) {
    writeDayProductRow(sheet, row);
  }

  sheet.getRange("F:F").getFormat().setColumnWidth(2);
  sheet.getRange("F:F").getFormat().getFont().setColor("#FFFFFF");

  sheet.getRange(`I1:I${canvasLastRow}`).getFormat().getFill().setColor("#404040");
  sheet.getRange("I:I").getFormat().setColumnWidth(3);

  sheet.getRange("J1:N1").merge(false);
  sheet.getRange("J1").setFormula(`=IF($K$3="","Controles week -","Controles week "&IFERROR(IF(LEFT($K$3,2)="WK",MID($K$3,3,FIND("-",$K$3)-3),$K$3),$K$3))`);
  sheet.getRange("J1:N1").getFormat().getFill().setColor("#7030A0");
  sheet.getRange("J1:N1").getFormat().getFont().setColor("#FFFFFF");
  sheet.getRange("J1:N1").getFormat().getFont().setBold(true);
  sheet.getRange("J1").getFormat().getFont().setSize(16);

  sheet.getRange("J3").setValue("Week");
  sheet.getRange("K3").setNumberFormatLocal("@");
  sheet.getRange("K3").setValue(selectedWeekDisplay);
  sheet.getRange("K3").getFormat().getFill().setColor("#FFF2CC");
  sheet.getRange("K3").getFormat().getFont().setBold(true);

  sheet.getRange("J5").setValue("Weekscore");
  sheet.getRange("K5").setFormula(`=LET(w,$K$3,g,COUNTIFS('${DATA_SHEET_NAME}'!$E$2:INDEX('${DATA_SHEET_NAME}'!$E:$E,$Q$1),w,'${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),"FIFO",'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja",'${DATA_SHEET_NAME}'!$N$2:INDEX('${DATA_SHEET_NAME}'!$N:$N,$Q$1),"Ja"),t,COUNTIFS('${DATA_SHEET_NAME}'!$E$2:INDEX('${DATA_SHEET_NAME}'!$E:$E,$Q$1),w,'${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),"FIFO",'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja"),IF(w="","-",IF(t=0,"-",IF(g=t,"🟩 ","🟥 ")&g&"/"&t)))`);

  sheet.getRange("M5").setValue("Niet uitgevoerd");
  sheet.getRange("N5").setFormula(`=LET(w,$K$3,x,COUNTIF($K$9:$K$15,"*Niet uitgevoerd*"),IF(w="","-",IF(x=0,"🟩 0","🟥 "&x)))`);

  sheet.getRange("J5:N5").getFormat().getFont().setBold(true);
  sheet.getRange("J3:J5").getFormat().getFill().setColor("#F2F2F2");
  sheet.getRange("M5:M5").getFormat().getFill().setColor("#F2F2F2");
  sheet.getRange("K5:L5").getFormat().getFill().setColor("#FFFFFF");
  sheet.getRange("N5").getFormat().getFill().setColor("#FFFFFF");
  setThinBorders(sheet.getRange("J5:N5"));

  sheet.getRange("J8:N8").setValues([[
    "Dag",
    "Status",
    "Score",
    "Niet-FIFO afdelingen",
    "Shiftleider"
  ]]);
  formatPurpleHeader(sheet.getRange("J8:N8"));

  const dagen = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
  for (let i = 0; i < dagen.length; i++) {
    writeWeekDagRow(sheet, 8 + i, dagen[i]);
  }

  sheet.getRange("J9:N15").getFormat().getFill().setColor("#FFFFFF");
  setThinBorders(sheet.getRange("J8:N15"));

  sheet.getRange("B3").getDataValidation().setRule({
    list: { inCellDropDown: true, source: `='${DATA_SHEET_NAME}'!$R$2:$R$1000` }
  });

  sheet.getRange("K3").getDataValidation().setRule({
    list: { inCellDropDown: true, source: `='${DATA_SHEET_NAME}'!$T$2:$T$1000` }
  });

  sheet.getRange("A:A").getFormat().setColumnWidth(115);
  sheet.getRange("B:B").getFormat().setColumnWidth(82);
  sheet.getRange("C:C").getFormat().setColumnWidth(95);
  sheet.getRange("D:D").getFormat().setColumnWidth(115);
  sheet.getRange("E:E").getFormat().setColumnWidth(82);

  sheet.getRange("J:J").getFormat().setColumnWidth(82);
  sheet.getRange("K:K").getFormat().setColumnWidth(115);
  sheet.getRange("L:L").getFormat().setColumnWidth(82);
  sheet.getRange("M:M").getFormat().setColumnWidth(150);
  sheet.getRange("N:N").getFormat().setColumnWidth(110);

  sheet.getRange("A:N").getFormat().setWrapText(true);
  sheet.getRange("A:N").getFormat().getFont().setSize(9);
  sheet.getRange("A1:N1").getFormat().getFont().setSize(16);

  sheet.getRange("A1:N1").getFormat().setRowHeight(22);
  sheet.getRange("A2:N7").getFormat().setRowHeight(18);
  sheet.getRange(`A8:N${detailEndRow}`).getFormat().setRowHeight(18);

  const all = sheet.getUsedRange();
  if (all) {
    all.getFormat().setVerticalAlignment(ExcelScript.VerticalAlignment.top);
  }

  sheet.getRange(`A1:Q${canvasLastRow}`).getFormat().getProtection().setLocked(true);
  sheet.getRange("B3").getFormat().getProtection().setLocked(false);
  sheet.getRange("K3").getFormat().getProtection().setLocked(false);
}

function detailRowsForDashboard(analyse: FifoAnalyse): (string | number | boolean)[][] {
  if (analyse.Details.length > 0) {
    return analyse.Details
      .slice()
      .sort((a, b) => {
        const statusA = statusSortOrder(a.Status);
        const statusB = statusSortOrder(b.Status);
        if (statusA !== statusB) return statusA - statusB;
        return `${a.Afdeling}${a.Subafdeling}${a.Nasa}`.localeCompare(`${b.Afdeling}${b.Subafdeling}${b.Nasa}`);
      })
      .map(r => [
        r.Afdeling,
        r.Subafdeling,
        r.Nasa,
        r.Productnaam,
        r.Status,
        r.Medewerker,
        r.TeltMee ? "Ja" : "Nee",
        r.Correct ? "Ja" : "Nee"
      ]);
  }

  return [["", "", "", "Geen productdetails beschikbaar", "Update index.html", "", "", ""]];
}

function statusSortOrder(status: string): number {
  const s = normalize(status);
  if (s === normalize("Fout")) return 1;
  if (s === normalize("Goed")) return 2;
  if (s === normalize("Afdeling niet gevuld")) return 3;
  if (s === normalize("Niet gevuld")) return 4;
  return 5;
}

function appendHistorieData(sheet: ExcelScript.Worksheet, analyse: FifoAnalyse): void {
  const headers = historyHeaders();
  const nextRow = ensureHistoryHeader(sheet);
  const now = new Date();
  const runTimestamp = now.getTime();
  const rows: (string | number | boolean)[][] = [];
  const week = getIsoWeekAndYear(parseDateKey(analyse.DatumKey));
  const weekKey = `${week.year}-W${twoDigit(week.week)}`;
  const weekDisplay = `WK${week.week}-${week.year}`;
  const dagNaam = getDayName(parseDateKey(analyse.DatumKey));
  const datumDisplay = formatDateDisplay(analyse.DatumKey);
  const runDisplay = formatDateTimeDisplay(now);

  if (analyse.Details.length > 0) {
    for (const r of analyse.Details) {
      rows.push([
        runDisplay,
        analyse.DatumKey,
        datumDisplay,
        weekKey,
        weekDisplay,
        dagNaam,
        "FIFO",
        analyse.Shiftleider,
        r.Afdeling,
        r.Nasa,
        r.Status,
        r.Medewerker,
        r.TeltMee ? "Ja" : "Nee",
        r.Correct ? "Ja" : "Nee",
        analyse.PercentageTekst,
        runTimestamp
      ]);
    }
  } else {
    for (const s of analyse.Samenvatting) {
      rows.push([
        runDisplay,
        analyse.DatumKey,
        datumDisplay,
        weekKey,
        weekDisplay,
        dagNaam,
        "FIFO",
        analyse.Shiftleider,
        s.Afdeling,
        "",
        `${s.Correct}/${s.Totaal}`,
        "",
        s.Status === "Gevuld" ? "Ja" : "Nee",
        s.Fout === 0 && s.Totaal > 0 ? "Ja" : "Nee",
        analyse.PercentageTekst,
        runTimestamp
      ]);
    }
  }

  if (rows.length > 0) {
    const targetRange = sheet.getRangeByIndexes(nextRow, 0, rows.length, headers.length);
    targetRange.setNumberFormatLocal("@");
    targetRange.setValues(rows);
    sheet.getRangeByIndexes(nextRow, 15, rows.length, 1).setNumberFormatLocal("0");
  }
}

function appendMissingData(sheet: ExcelScript.Worksheet, dateKey: string): void {
  const headers = historyHeaders();
  const nextRow = ensureHistoryHeader(sheet);
  const parsedDate = parseDateKey(dateKey);
  const week = getIsoWeekAndYear(parsedDate);
  const weekKey = `${week.year}-W${twoDigit(week.week)}`;
  const now = new Date();

  const targetRange = sheet.getRangeByIndexes(nextRow, 0, 1, headers.length);
  targetRange.setNumberFormatLocal("@");
  targetRange.setValues([[
    formatDateTimeDisplay(now),
    dateKey,
    formatDateDisplay(dateKey),
    weekKey,
    `WK${week.week}-${week.year}`,
    getDayName(parsedDate),
    "MISSING",
    "",
    "",
    "",
    "Niet uitgevoerd 🙁",
    "",
    "Nee",
    "Nee",
    "-",
    now.getTime()
  ]]);
  sheet.getRangeByIndexes(nextRow, 15, 1, 1).setNumberFormatLocal("0");
}

function ensureHistoryHeader(sheet: ExcelScript.Worksheet): number {
  const headers = historyHeaders();
  sheet.getRangeByIndexes(0, 0, 1, headers.length).setValues([headers]);
  formatHeader(sheet.getRangeByIndexes(0, 0, 1, headers.length));

  sheet.getRange("R1").setValue("Datums");
  sheet.getRange("S1").setValue("Reserve");
  sheet.getRange("T1").setValue("Weken");
  sheet.getRange("U1").setValue("Reserve");
  formatHeader(sheet.getRange("R1:U1"));

  sheet.getRange("A:O").setNumberFormatLocal("@");
  sheet.getRange("P:P").setNumberFormatLocal("0");
  sheet.getRange("R:R").setNumberFormatLocal("yyyy-mm-dd");
  sheet.getRange("S:U").setNumberFormatLocal("@");

  const used = sheet.getUsedRange();
  const rowCount = used ? Math.max(used.getRowCount(), 2) : 2;
  const dateValues = sheet.getRangeByIndexes(1, 1, rowCount - 1, 1).getValues();

  for (let row = dateValues.length - 1; row >= 0; row--) {
    if (String(dateValues[row][0] ?? "").trim() !== "") {
      return row + 2;
    }
  }

  return 1;
}

function countStoredHistoryRows(sheet: ExcelScript.Worksheet): number {
  const used = sheet.getUsedRange();
  const rowCount = used ? used.getRowCount() : 0;
  if (rowCount <= 1) return 0;

  const values = sheet.getRangeByIndexes(1, 0, rowCount - 1, 16).getValues();
  let count = 0;
  for (const row of values) {
    if (row.some(value => String(value ?? "").trim() !== "")) count++;
  }
  return count;
}


function historyHeaders(): string[] {
  return [
    "Run opgeslagen op",
    "Datum key",
    "Datum",
    "Week key",
    "Week",
    "Dag",
    "Type",
    "Shiftleider / Manager",
    "Afdeling",
    "NASA",
    "Resultaat",
    "Medewerker",
    "Telt mee",
    "Correct",
    "Controle percentage",
    "Run timestamp"
  ];
}

function refreshAvailableLists(sheet: ExcelScript.Worksheet): void {
  ensureHistoryHeader(sheet);

  const used = sheet.getUsedRange();
  const rowCount = used ? Math.max(used.getRowCount(), 2) : 2;
  const values = sheet.getRangeByIndexes(1, 0, rowCount - 1, 16).getValues();

  let changed = false;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const dateKey = normalizeDashboardDateKey(row[1], row[2]);

    if (!dateKey) {
      continue;
    }

    const parsedDate = parseDateKey(dateKey);
    const week = getIsoWeekAndYear(parsedDate);
    const weekKey = `${week.year}-W${twoDigit(week.week)}`;
    const weekDisplay = `WK${week.week}-${week.year}`;
    const dagNaam = getDayName(parsedDate);
    const datumDisplay = formatDateDisplay(dateKey);

    if (String(row[1] ?? "").trim() !== dateKey) {
      row[1] = dateKey;
      changed = true;
    }

    if (String(row[2] ?? "").trim() !== datumDisplay) {
      row[2] = datumDisplay;
      changed = true;
    }

    if (String(row[3] ?? "").trim() !== weekKey) {
      row[3] = weekKey;
      changed = true;
    }

    if (String(row[4] ?? "").trim() !== weekDisplay) {
      row[4] = weekDisplay;
      changed = true;
    }

    if (String(row[5] ?? "").trim() !== dagNaam) {
      row[5] = dagNaam;
      changed = true;
    }

    const type = String(row[6] ?? "").trim();
    const resultaat = String(row[10] ?? "").trim();

    if (
      normalize(type) === normalize("FIFO") &&
      (
        normalize(resultaat) === normalize("Open") ||
        normalize(resultaat) === normalize("Onbekend") ||
        normalize(resultaat) === normalize("Geen registratie")
      )
    ) {
      if (String(row[10] ?? "").trim() !== "Geen registratie") {
        row[10] = "Geen registratie";
        changed = true;
      }

      if (String(row[12] ?? "").trim() !== "Nee") {
        row[12] = "Nee";
        changed = true;
      }

      if (String(row[13] ?? "").trim() !== "Nee") {
        row[13] = "Nee";
        changed = true;
      }
    }
  }

  sheet.getRange("A:O").setNumberFormatLocal("@");
  sheet.getRange("P:P").setNumberFormatLocal("0");

  if (changed && values.length > 0) {
    sheet.getRangeByIndexes(1, 0, values.length, 16).setValues(values);
  }

  const dateMap: { [key: string]: string } = {};
  const weekMap: { [key: string]: string } = {};

  for (const row of values) {
    const dateKey = normalizeDashboardDateKey(row[1], row[2]);
    const weekDisplay = String(row[4] ?? "").trim();

    if (dateKey) {
      dateMap[dateKey] = dateKey;
    }

    if (weekDisplay) {
      weekMap[weekDisplay] = weekDisplay;
    }
  }

  const dateKeys = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));
  const weekDisplays = Object.keys(weekMap).sort((a, b) => compareWeekDisplayDescending(a, b));

  sheet.getRange("R2:U1000").clear(ExcelScript.ClearApplyTo.contents);
  sheet.getRange("R2:R1000").setNumberFormatLocal("yyyy-mm-dd");
  sheet.getRange("S2:U1000").setNumberFormatLocal("@");

  if (dateKeys.length > 0) {
    sheet.getRangeByIndexes(1, 17, Math.min(dateKeys.length, 999), 1).setValues(
      dateKeys.slice(0, 999).map(key => [key])
    );
  }

  if (weekDisplays.length > 0) {
    sheet.getRangeByIndexes(1, 19, Math.min(weekDisplays.length, 999), 1).setValues(
      weekDisplays.slice(0, 999).map(week => [week])
    );
  }
}

function getWeekDisplayForDateKey(dateKey: string): string {
  const week = getIsoWeekAndYear(parseDateKey(dateKey));
  return `WK${week.week}-${week.year}`;
}

function getLatestDateDisplay(sheet: ExcelScript.Worksheet): string {
  refreshAvailableLists(sheet);
  return String(sheet.getRange("R2").getValue() ?? "").trim();
}

function getLatestWeekDisplay(sheet: ExcelScript.Worksheet): string {
  refreshAvailableLists(sheet);
  return String(sheet.getRange("T2").getValue() ?? "").trim();
}

function normalizeDashboardDateKey(value: string | number | boolean, fallbackValue: string | number | boolean): string {
  const direct = parseDashboardDateValue(value);

  if (direct) {
    return direct;
  }

  return parseDashboardDateValue(fallbackValue);
}

function parseDashboardDateValue(value: string | number | boolean): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return excelSerialToDateKey(value);
  }

  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  if (/^\d{5,6}$/.test(text)) {
    return excelSerialToDateKey(Number(text));
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${twoDigit(Number(isoMatch[2]))}-${twoDigit(Number(isoMatch[3]))}`;
  }

  const nlMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (nlMatch) {
    return `${nlMatch[3]}-${twoDigit(Number(nlMatch[2]))}-${twoDigit(Number(nlMatch[1]))}`;
  }

  return "";
}

function excelSerialToDateKey(serial: number): string {
  const millisPerDay = 24 * 60 * 60 * 1000;
  const excelEpoch = Date.UTC(1899, 11, 30);
  const date = new Date(excelEpoch + Math.round(serial) * millisPerDay);

  return `${date.getUTCFullYear()}-${twoDigit(date.getUTCMonth() + 1)}-${twoDigit(date.getUTCDate())}`;
}

function compareWeekDisplayDescending(a: string, b: string): number {
  return weekDisplaySortKey(b) - weekDisplaySortKey(a);
}

function weekDisplaySortKey(value: string): number {
  const match = String(value || "").match(/^WK(\d{1,2})-(\d{4})$/i);

  if (!match) {
    return 0;
  }

  return Number(match[2]) * 100 + Number(match[1]);
}



























function writeDirectDayDetail(sheet: ExcelScript.Worksheet, analyse: FifoAnalyse): void {
  const statusText = analyse.Totaal <= 0 ? "🟦 Geen gevulde afdelingen" : "🟩 Uitgevoerd";
  const scoreText = analyse.Totaal <= 0
    ? "-"
    : `${analyse.Correct === analyse.Totaal ? "🟩" : "🟥"} ${analyse.Correct}/${analyse.Totaal}`;

  sheet.getRange("B5").setValue(statusText);
  sheet.getRange("B6").setValue(analyse.Shiftleider);
  sheet.getRange("E5").setNumberFormatLocal("@");
  sheet.getRange("E5").setValue(scoreText);
  sheet.getRange("E6").setValue(analyse.PercentageTekst);

  colorStatusCell(sheet.getRange("B5"), statusText);
  sheet.getRange("B6").getFormat().getFill().setColor("#FFFFFF");
  colorScoreCell(sheet.getRange("E5"), analyse.Correct, analyse.Totaal);
  colorPercentageCell(sheet.getRange("E6"), analyse.Percentage);

  const directDetailRows = Math.max(
    DASHBOARD_DETAIL_ROWS,
    analyse.Details.length + analyse.Samenvatting.length + 2
  );
  const directEndRow = DASHBOARD_DETAIL_FIRST_ROW + directDetailRows - 1;
  const clearRange = sheet.getRange(`A${DASHBOARD_DETAIL_FIRST_ROW}:E${directEndRow}`);
  clearRange.unmerge();
  clearRange.clear(ExcelScript.ClearApplyTo.contents);
  clearRange.setNumberFormatLocal("@");
  clearRange.getFormat().getFill().setColor("#FFFFFF");
  clearRange.getFormat().getFont().setBold(false);
  setThinBorders(clearRange);

  const afdelingOrder = [
    "Zuivel",
    "Kaas/Vleeswaren",
    "Vlees/Vis/Kip/Vega",
    "Maaltijden/Sappen",
    "Panklaar"
  ];

  const summaryByAfdeling: { [key: string]: AfdelingSamenvatting } = {};
  for (const summary of analyse.Samenvatting) {
    summaryByAfdeling[normalize(summary.Afdeling)] = summary;
  }

  let row = 8;

  for (const afdeling of afdelingOrder) {
    const summary = summaryByAfdeling[normalize(afdeling)];
    const details = analyse.Details.filter(detail => normalize(detail.Afdeling) === normalize(afdeling));

    row = writeDepartmentSummaryRow(sheet, row, afdeling, summary);

    for (const detail of details) {
      row = writeNasaDetailRow(sheet, row, detail);
    }
  }

  writeLegend(sheet, row + 1);
}

function writeDepartmentSummaryRow(
  sheet: ExcelScript.Worksheet,
  zeroBasedRow: number,
  afdeling: string,
  summary: AfdelingSamenvatting
): number {
  const score = summary ? `${summary.Correct}/${summary.Totaal}` : "0/0";
  const resultaat = departmentResultText(summary);

  const rowRange = sheet.getRangeByIndexes(zeroBasedRow, 0, 1, 5);
  rowRange.setNumberFormatLocal("@");
  rowRange.setValues([[
    afdeling,
    "Afdeling totaal",
    resultaat,
    "",
    score
  ]]);

  rowRange.getFormat().getFont().setBold(true);
  rowRange.getFormat().getFill().setColor(departmentSummaryColor(summary));
  setDepartmentBorders(rowRange);

  return zeroBasedRow + 1;
}

function writeNasaDetailRow(
  sheet: ExcelScript.Worksheet,
  zeroBasedRow: number,
  detail: DetailRegel
): number {
  const rowRange = sheet.getRangeByIndexes(zeroBasedRow, 0, 1, 5);
  rowRange.setNumberFormatLocal("@");
  rowRange.setValues([[
    "",
    detail.Nasa,
    directStatusText(detail.Status),
    detail.Medewerker,
    ""
  ]]);

  rowRange.getFormat().getFill().setColor(detailRowColor(detail.Status));
  rowRange.getFormat().getFont().setBold(false);
  setThinBorders(rowRange);

  return zeroBasedRow + 1;
}

function writeLegend(sheet: ExcelScript.Worksheet, zeroBasedRow: number): void {
  const range = sheet.getRangeByIndexes(zeroBasedRow, 0, 1, 5);
  range.clear(ExcelScript.ClearApplyTo.contents);
  range.merge(false);
  range.setValue("Legenda: 🟩 Goed   🟥 Fout   🟦 Niet gevuld   ⚪ Geen registratie");
  range.getFormat().getFill().setColor("#F2F2F2");
  range.getFormat().getFont().setBold(true);
  setThinBorders(range);
}

function departmentResultText(summary: AfdelingSamenvatting): string {
  if (!summary || summary.Totaal <= 0) {
    return "🟦 Niet gevuld";
  }

  if (summary.Fout > 0) {
    return "🟥 Niet FIFO";
  }

  return "🟩 Goed";
}

function departmentSummaryColor(summary: AfdelingSamenvatting): string {
  if (!summary || summary.Totaal <= 0) {
    return "#BDD7EE";
  }

  if (summary.Fout > 0) {
    return "#F4CCCC";
  }

  return "#D9EAD3";
}

function detailRowColor(status: string): string {
  const s = normalize(status);

  if (s === normalize("Goed")) {
    return "#E2F0D9";
  }

  if (s === normalize("Fout")) {
    return "#F4CCCC";
  }

  if (s === normalize("Niet gevuld") || s === normalize("Afdeling niet gevuld")) {
    return "#D9EAF7";
  }

  return "#F2F2F2";
}

function directStatusText(status: string): string {
  const s = normalize(status);
  if (s === normalize("Goed")) return "🟩 Goed";
  if (s === normalize("Fout")) return "🟥 Fout";
  if (s === normalize("Niet gevuld")) return "🟦 Niet gevuld";
  if (s === normalize("Afdeling niet gevuld")) return "🟦 Afdeling niet gevuld";
  return status || "Onbekend";
}

function colorStatusCell(range: ExcelScript.Range, value: string): void {
  if (value.indexOf("🟩") >= 0) {
    range.getFormat().getFill().setColor("#E2F0D9");
  } else if (value.indexOf("🟥") >= 0) {
    range.getFormat().getFill().setColor("#F4CCCC");
  } else if (value.indexOf("🟦") >= 0) {
    range.getFormat().getFill().setColor("#D9EAF7");
  } else {
    range.getFormat().getFill().setColor("#F2F2F2");
  }
}

function colorScoreCell(range: ExcelScript.Range, correct: number, total: number): void {
  if (total <= 0) {
    range.getFormat().getFill().setColor("#F2F2F2");
  } else if (correct === total) {
    range.getFormat().getFill().setColor("#E2F0D9");
  } else {
    range.getFormat().getFill().setColor("#F4CCCC");
  }
}

function colorPercentageCell(range: ExcelScript.Range, percentage: number): void {
  if (percentage >= 100) {
    range.getFormat().getFill().setColor("#E2F0D9");
  } else if (percentage > 0) {
    range.getFormat().getFill().setColor("#FFF2CC");
  } else {
    range.getFormat().getFill().setColor("#F2F2F2");
  }
}

function writeDayProductRow(sheet: ExcelScript.Worksheet, zeroBasedRow: number): void {
  const excelRow = zeroBasedRow + 1;
  const index = zeroBasedRow - 7;

  sheet.getRange(`A${excelRow}:E${excelRow}`).setNumberFormatLocal("General");

  const selectedDateKey = `IF(ISNUMBER($B$3),YEAR($B$3)&"-"&RIGHT("0"&MONTH($B$3),2)&"-"&RIGHT("0"&DAY($B$3),2),$B$3)`;
  const latestRunForDate = `IFERROR(MAXIFS('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),'${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),${selectedDateKey}),0)`;
  const condition = `('${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1)=${selectedDateKey})*('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1)=(${latestRunForDate}))*('${DATA_SHEET_NAME}'!$I$2:INDEX('${DATA_SHEET_NAME}'!$I:$I,$Q$1)<>"")`;

  sheet.getRangeByIndexes(zeroBasedRow, 0, 1, 1).setFormula(`=IFERROR(INDEX(FILTER('${DATA_SHEET_NAME}'!$I$2:INDEX('${DATA_SHEET_NAME}'!$I:$I,$Q$1),${condition}),${index}),"")`);
  sheet.getRangeByIndexes(zeroBasedRow, 1, 1, 1).setFormula(`=IFERROR(INDEX(FILTER('${DATA_SHEET_NAME}'!$J$2:INDEX('${DATA_SHEET_NAME}'!$J:$J,$Q$1),${condition}),${index}),"")`);
  sheet.getRangeByIndexes(zeroBasedRow, 2, 1, 1).setFormula(`=LET(x,IFERROR(INDEX(FILTER('${DATA_SHEET_NAME}'!$K$2:INDEX('${DATA_SHEET_NAME}'!$K:$K,$Q$1),${condition}),${index}),""),IF(x="","",IF(OR(x="Open",x="Geen registratie",x="Onbekend"),"⚪ Geen registratie",IF(x="Goed","🟩 Goed",IF(x="Fout","🟥 Fout",IF(OR(x="Niet gevuld",x="Afdeling niet gevuld"),"🟦 "&x,x))))))`);
  sheet.getRangeByIndexes(zeroBasedRow, 3, 1, 1).setFormula(`=LET(r,C${excelRow},m,IFERROR(INDEX(FILTER('${DATA_SHEET_NAME}'!$L$2:INDEX('${DATA_SHEET_NAME}'!$L:$L,$Q$1),${condition}),${index}),""),mt,TRIM(m&""),IF(r="","",IF(ISNUMBER(SEARCH("Fout",r)),IF(OR(mt="",mt="0"),"Onbekend",mt),"-")))`);
  sheet.getRangeByIndexes(zeroBasedRow, 4, 1, 1).setFormula(`=IF(OR(A${excelRow}="",A${excelRow}=A${excelRow - 1}),"",LET(t,${latestRunForDate},g,COUNTIFS('${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),${selectedDateKey},'${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),t,'${DATA_SHEET_NAME}'!$I$2:INDEX('${DATA_SHEET_NAME}'!$I:$I,$Q$1),A${excelRow},'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja",'${DATA_SHEET_NAME}'!$N$2:INDEX('${DATA_SHEET_NAME}'!$N:$N,$Q$1),"Ja"),n,COUNTIFS('${DATA_SHEET_NAME}'!$B$2:INDEX('${DATA_SHEET_NAME}'!$B:$B,$Q$1),${selectedDateKey},'${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),t,'${DATA_SHEET_NAME}'!$I$2:INDEX('${DATA_SHEET_NAME}'!$I:$I,$Q$1),A${excelRow},'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja"),IF(OR(t=0,n=0),"-",IF(g=n,"🟩 ","🟥 ")&g&"/"&n)))`);
}

function writeWeekDagRow(sheet: ExcelScript.Worksheet, zeroBasedRow: number, dagNaam: string): void {
  const excelRow = zeroBasedRow + 1;

  sheet.getRangeByIndexes(zeroBasedRow, 9, 1, 1).setValue(dagNaam);

  const latestRunForDay = `IFERROR(MAXIFS('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),'${DATA_SHEET_NAME}'!$E$2:INDEX('${DATA_SHEET_NAME}'!$E:$E,$Q$1),$K$3,'${DATA_SHEET_NAME}'!$F$2:INDEX('${DATA_SHEET_NAME}'!$F:$F,$Q$1),J${excelRow}),0)`;

  sheet.getRangeByIndexes(zeroBasedRow, 10, 1, 1).setFormula(`=LET(t,${latestRunForDay},IF(t=0,"⚪ Geen registratie",IFERROR(SWITCH(INDEX(FILTER('${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),('${DATA_SHEET_NAME}'!$E$2:INDEX('${DATA_SHEET_NAME}'!$E:$E,$Q$1)=$K$3)*('${DATA_SHEET_NAME}'!$F$2:INDEX('${DATA_SHEET_NAME}'!$F:$F,$Q$1)=J${excelRow})*('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1)=t)),1),"FIFO","🟩 Uitgevoerd","MISSING","🟥 Niet uitgevoerd","⚪ Onbekend"),"⚪ Geen registratie")))`);

  sheet.getRangeByIndexes(zeroBasedRow, 11, 1, 1).setFormula(`=LET(t,${latestRunForDay},g,COUNTIFS('${DATA_SHEET_NAME}'!$E$2:INDEX('${DATA_SHEET_NAME}'!$E:$E,$Q$1),$K$3,'${DATA_SHEET_NAME}'!$F$2:INDEX('${DATA_SHEET_NAME}'!$F:$F,$Q$1),J${excelRow},'${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),t,'${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),"FIFO",'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja",'${DATA_SHEET_NAME}'!$N$2:INDEX('${DATA_SHEET_NAME}'!$N:$N,$Q$1),"Ja"),n,COUNTIFS('${DATA_SHEET_NAME}'!$E$2:INDEX('${DATA_SHEET_NAME}'!$E:$E,$Q$1),$K$3,'${DATA_SHEET_NAME}'!$F$2:INDEX('${DATA_SHEET_NAME}'!$F:$F,$Q$1),J${excelRow},'${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1),t,'${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1),"FIFO",'${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1),"Ja"),IF(t=0,"-",IF(n=0,"-",IF(g=n,"🟩 ","🟥 ")&g&"/"&n)))`);

  sheet.getRangeByIndexes(zeroBasedRow, 12, 1, 1).setFormula(`=LET(t,${latestRunForDay},IF(t=0,"-",IFERROR(TEXTJOIN(", ",TRUE,UNIQUE(FILTER('${DATA_SHEET_NAME}'!$I$2:INDEX('${DATA_SHEET_NAME}'!$I:$I,$Q$1),('${DATA_SHEET_NAME}'!$E$2:INDEX('${DATA_SHEET_NAME}'!$E:$E,$Q$1)=$K$3)*('${DATA_SHEET_NAME}'!$F$2:INDEX('${DATA_SHEET_NAME}'!$F:$F,$Q$1)=J${excelRow})*('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1)=t)*('${DATA_SHEET_NAME}'!$G$2:INDEX('${DATA_SHEET_NAME}'!$G:$G,$Q$1)="FIFO")*('${DATA_SHEET_NAME}'!$M$2:INDEX('${DATA_SHEET_NAME}'!$M:$M,$Q$1)="Ja")*('${DATA_SHEET_NAME}'!$N$2:INDEX('${DATA_SHEET_NAME}'!$N:$N,$Q$1)<>"Ja")))),"-")))`);

  sheet.getRangeByIndexes(zeroBasedRow, 13, 1, 1).setFormula(`=LET(t,${latestRunForDay},raw,IF(t=0,"",IFERROR(INDEX(FILTER('${DATA_SHEET_NAME}'!$H$2:INDEX('${DATA_SHEET_NAME}'!$H:$H,$Q$1),('${DATA_SHEET_NAME}'!$E$2:INDEX('${DATA_SHEET_NAME}'!$E:$E,$Q$1)=$K$3)*('${DATA_SHEET_NAME}'!$F$2:INDEX('${DATA_SHEET_NAME}'!$F:$F,$Q$1)=J${excelRow})*('${DATA_SHEET_NAME}'!$P$2:INDEX('${DATA_SHEET_NAME}'!$P:$P,$Q$1)=t)),1),"")),s,TRIM(raw&""),IF(OR(t=0,s="",s="0"),"-",s))`);
}

function formatDateDisplay(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return `${twoDigit(d.getUTCDate())}/${twoDigit(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function formatDateTimeDisplay(date: Date): string {
  return `${twoDigit(date.getDate())}/${twoDigit(date.getMonth() + 1)}/${date.getFullYear()} ${twoDigit(date.getHours())}:${twoDigit(date.getMinutes())}`;
}

function getDayName(date: Date): string {
  const names: { [key: number]: string } = {
    1: "Maandag",
    2: "Dinsdag",
    3: "Woensdag",
    4: "Donderdag",
    5: "Vrijdag",
    6: "Zaterdag",
    0: "Zondag"
  };

  return names[date.getUTCDay()];
}

function twoDigit(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function refreshAvailableDates(sheet: ExcelScript.Worksheet): void {
  ensureHistoryHeader(sheet);

  const used = sheet.getUsedRange();
  const rowCount = used ? Math.max(used.getRowCount(), 2) : 2;
  const values = sheet.getRangeByIndexes(1, 1, rowCount - 1, 1).getValues();

  const seen: { [key: string]: boolean } = {};
  const dates: string[] = [];

  for (const row of values) {
    const dateText = String(row[0] ?? "").trim();

    if (dateText && !seen[dateText]) {
      seen[dateText] = true;
      dates.push(dateText);
    }
  }

  dates.sort((a, b) => b.localeCompare(a));

  sheet.getRange("P2:P1000").clear(ExcelScript.ClearApplyTo.contents);

  if (dates.length > 0) {
    sheet.getRangeByIndexes(1, 15, Math.min(dates.length, 999), 1).setValues(
      dates.slice(0, 999).map(dateText => [dateText])
    );
  }
}

function formatPurpleHeader(range: ExcelScript.Range): void {
  range.getFormat().getFill().setColor("#7030A0");
  range.getFormat().getFont().setColor("#FFFFFF");
  range.getFormat().getFont().setBold(true);
}

function setThinBorders(range: ExcelScript.Range): void {
  const borders = [
    ExcelScript.BorderIndex.edgeTop,
    ExcelScript.BorderIndex.edgeBottom,
    ExcelScript.BorderIndex.edgeLeft,
    ExcelScript.BorderIndex.edgeRight,
    ExcelScript.BorderIndex.insideHorizontal,
    ExcelScript.BorderIndex.insideVertical
  ];

  for (const border of borders) {
    const item = range.getFormat().getRangeBorder(border);
    item.setStyle(ExcelScript.BorderLineStyle.continuous);
    item.setWeight(ExcelScript.BorderWeight.thin);
    item.setColor("#D9D9D9");
  }
}

function setDepartmentBorders(range: ExcelScript.Range): void {
  setThinBorders(range);

  const top = range.getFormat().getRangeBorder(ExcelScript.BorderIndex.edgeTop);
  top.setStyle(ExcelScript.BorderLineStyle.continuous);
  top.setWeight(ExcelScript.BorderWeight.medium);
  top.setColor("#666666");

  const bottom = range.getFormat().getRangeBorder(ExcelScript.BorderIndex.edgeBottom);
  bottom.setStyle(ExcelScript.BorderLineStyle.continuous);
  bottom.setWeight(ExcelScript.BorderWeight.medium);
  bottom.setColor("#666666");
}

function formatHeader(range: ExcelScript.Range): void {
  range.getFormat().getFill().setColor("#1F4E78");
  range.getFormat().getFont().setColor("#FFFFFF");
  range.getFormat().getFont().setBold(true);
}

function buildMainCellText(analyse: FifoAnalyse): string {
  if (analyse.Totaal <= 0) {
    return "FIFO gecontroleerd: geen gevulde afdelingen";
  }

  return `FIFO gecontroleerd: ${analyse.PercentageTekst} goed (${analyse.Correct}/${analyse.Totaal})`;
}

function setInternalHyperlinkFormula(
  range: ExcelScript.Range,
  sheetName: string,
  cellAddress: string,
  text: string
): void {
  const safeSheet = sheetName.replace(/'/g, "''");
  const safeText = text.replace(/"/g, "\"\"");

  range.setFormula(`=HYPERLINK("#'${safeSheet}'!${cellAddress}","${safeText}")`);
  range.getFormat().getFont().setColor("#000000");
}

function getOrCreateWorksheet(workbook: ExcelScript.Workbook, name: string): ExcelScript.Worksheet {
  const existing = workbook.getWorksheet(name);
  if (existing) {
    return existing;
  }

  return workbook.addWorksheet(name);
}

function getRequiredWorksheet(workbook: ExcelScript.Workbook, name: string): ExcelScript.Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) {
    throw new Error(`Werkblad '${name}' bestaat niet. Run eerst fifo_shift_overdracht_eerste_run.ts met mode='setup'.`);
  }

  return sheet;
}

function unprotectWorkbookIfNeeded(workbook: ExcelScript.Workbook, password: string): boolean {
  const protection = workbook.getProtection();

  if (!protection.getProtected()) {
    return false;
  }

  protection.unprotect(password);
  return true;
}

function protectOrResume(sheet: ExcelScript.Worksheet, password: string, wasPaused: boolean): void {
  const protection = sheet.getProtection();

  if (wasPaused) {
    protection.resumeProtection();
    return;
  }

  if (!protection.getProtected()) {
    protection.protect({}, password);
  }
}

function isAfdelingNietGevuld(payload: ControlePayload, afdeling: string): boolean {
  const status = payload.AfdelingStatussen?.[afdeling]?.Status || "";
  if (normalize(status) === normalize("Niet gevuld vandaag")) {
    return true;
  }

  const lijst = payload.AfdelingenNietGevuld || [];
  return lijst.some(x => normalize(x) === normalize(afdeling));
}

function scoreForAfdeling(payload: ControlePayload, afdeling: string): string {
  const stateScore = payload.AfdelingStatussen?.[afdeling]?.Score;
  if (stateScore) {
    return String(stateScore);
  }

  const scores = payload.Scores || {};
  const directScore = scores[afdeling];

  if (directScore) {
    return String(directScore);
  }

  return "0/0";
}

function cleanFormsText(value: string | number | boolean | undefined | null): string {
  return String(value ?? "").replace(/\+/g, " ").trim();
}

function formatWarningOpmerking(value: string | number | boolean | undefined | null): string {
  const text = cleanFormsText(value);

  if (!text) {
    return "";
  }

  const parts = text.split("|").map(part => part.trim()).filter(part => part !== "");

  // Oude opbouw was: Afdeling | Subafdeling | NASA | Productnaam
  // Nieuwe gewenste opbouw is: Productnaam (NASA)
  if (parts.length >= 4) {
    const nasa = parts[2];
    const productnaam = parts.slice(3).join(" | ").trim();

    if (productnaam && nasa) {
      return `${productnaam} (${nasa})`;
    }

    if (productnaam) {
      return productnaam;
    }
  }

  return text;
}

function addWaarschuwingen(
  workbook: ExcelScript.Workbook,
  password: string,
  payload: ControlePayload,
  fallbackDateKey: string
): number {
  const waarschuwingen = payload.Waarschuwingen || [];

  if (!waarschuwingen.length) {
    return 0;
  }

  const warningSheet = workbook.getWorksheet("Lijst waarschuwingen");
  if (!warningSheet) {
    throw new Error("Werkblad 'Lijst waarschuwingen' niet gevonden.");
  }

  const table = workbook.getTable("Tabel_waarschuwingen");
  if (!table) {
    throw new Error("Tabel 'Tabel_waarschuwingen' niet gevonden.");
  }

  const pausedWarningSheet = pauseProtectionIfNeeded(warningSheet, password);

  try {
    const bodyRange = table.getRangeBetweenHeaderAndTotal();
    const values = bodyRange.getValues();

    const requiredColumns = [
      "Datum gegeven",
      "Naam medewerker",
      "Reden",
      "Officieel (Schriftelijk)",
      "Shiftleider / Manager",
      "Opmerkingen (optioneel)"
    ];

    const columnIndexes = getTableColumnIndexes(table, requiredColumns);
    let nextSearchRow = 0;
    let count = 0;

    for (const w of waarschuwingen) {
      const naamMedewerker = cleanFormsText(w.NaamMedewerker);
      const shiftleiderManager = cleanFormsText(w.ShiftleiderManager || payload.Shiftleider);

      if (!naamMedewerker) {
        continue;
      }

      const emptyRowIndex = findNextEmptyTableRow(values, columnIndexes, nextSearchRow);

      if (emptyRowIndex === -1) {
        throw new Error("Geen lege rij meer gevonden in Tabel_waarschuwingen. Maak de tabel groter of leeg oude regels.");
      }

      const rowValues = values[emptyRowIndex].slice();
      rowValues[columnIndexes["Datum gegeven"]] = String(w.DatumGegeven || payload.DagKey || fallbackDateKey);
      rowValues[columnIndexes["Naam medewerker"]] = naamMedewerker;
      rowValues[columnIndexes["Reden"]] = "Niet FIFO";
      rowValues[columnIndexes["Officieel (Schriftelijk)"]] = "Nee";
      rowValues[columnIndexes["Shiftleider / Manager"]] = shiftleiderManager;
      rowValues[columnIndexes["Opmerkingen (optioneel)"]] = formatWarningOpmerking(w.Opmerkingen);

      bodyRange
        .getCell(emptyRowIndex, 0)
        .getResizedRange(0, values[emptyRowIndex].length - 1)
        .setValues([rowValues]);

      values[emptyRowIndex] = rowValues;
      nextSearchRow = emptyRowIndex + 1;
      count++;
    }

    return count;
  } finally {
    if (pausedWarningSheet) {
      warningSheet.getProtection().resumeProtection();
    }
  }
}

function getTableColumnIndexes(
  table: ExcelScript.Table,
  requiredColumns: string[]
): { [key: string]: number } {
  const headers = table.getHeaderRowRange().getValues()[0].map(value => String(value || "").trim());
  const indexes: { [key: string]: number } = {};

  for (const requiredColumn of requiredColumns) {
    const index = headers.findIndex(header => normalize(header) === normalize(requiredColumn));

    if (index === -1) {
      throw new Error(`Kolom '${requiredColumn}' niet gevonden in Tabel_waarschuwingen.`);
    }

    indexes[requiredColumn] = index;
  }

  return indexes;
}

function findNextEmptyTableRow(
  values: (string | number | boolean)[][],
  columnIndexes: { [key: string]: number },
  startRow: number
): number {
  const columnsToCheck = [
    "Datum gegeven",
    "Naam medewerker",
    "Reden",
    "Officieel (Schriftelijk)",
    "Shiftleider / Manager",
    "Opmerkingen (optioneel)"
  ];

  for (let row = startRow; row < values.length; row++) {
    const isEmpty = columnsToCheck.every(columnName => {
      const columnIndex = columnIndexes[columnName];
      return String(values[row][columnIndex] ?? "").trim() === "";
    });

    if (isEmpty) {
      return row;
    }
  }

  return -1;
}

function pauseProtectionIfNeeded(sheet: ExcelScript.Worksheet, password: string): boolean {
  const protection = sheet.getProtection();

  if (!protection.getProtected()) {
    return false;
  }

  if (!protection.checkPassword(password)) {
    throw new Error(`Onjuist werkbladwachtwoord voor werkblad '${sheet.getName()}'.`);
  }

  protection.pauseProtection(password);
  return true;
}

function parseDateKey(dateKey: string): Date {
  const clean = String(dateKey || "").trim();

  let match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    ));
  }

  match = clean.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})/);
  if (match) {
    return new Date(Date.UTC(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    ));
  }

  throw new Error(`dateKey moet yyyy-MM-dd of dd-MM-yyyy zijn. Ontvangen: '${dateKey}'`);
}

function getTargetCell(date: Date): string {
  const day = date.getUTCDay();

  const columns: { [key: number]: string } = {
    1: "B",
    2: "C",
    3: "D",
    4: "E",
    5: "F",
    6: "G",
    0: "H"
  };

  return `${columns[day]}20`;
}

function getIsoWeekAndYear(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));

  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));

  const weekNo = Math.ceil(
    (((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7
  );

  return {
    week: weekNo,
    year: isoYear
  };
}

function parseScore(value: string): { correct: number; total: number } | null {
  const text = String(value || "").trim();
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);

  if (!match) {
    return null;
  }

  return {
    correct: Number(match[1]),
    total: Number(match[2])
  };
}

function percentageText(correct: number, total: number): string {
  if (total <= 0) {
    return "-";
  }

  return `${Math.round((correct / total) * 100)}%`;
}

function scoreColor(percentage: number): string {
  if (percentage >= 95) return "#E2F0D9";
  if (percentage >= 80) return "#FFF2CC";
  return "#F4CCCC";
}

function productText(product: ProductRegel, longName: keyof ProductRegel, shortName: keyof ProductRegel): string {
  const value = product[longName] ?? product[shortName] ?? "";
  return String(value).trim();
}

function productBool(product: ProductRegel, longName: keyof ProductRegel, shortName: keyof ProductRegel): boolean {
  const value = product[longName] ?? product[shortName] ?? false;
  return Boolean(value);
}

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
