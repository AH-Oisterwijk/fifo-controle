/**
 * Office Script voor Shift Overdracht.xlsx.
 *
 * Gebruik:
 * - mode = "fifo" bij een Forms-inzending.
 * - mode = "missing" bij de geplande controle op niet-uitgevoerde FIFO.
 *
 * Bij mode="fifo" leest het script het Forms-veld "Controle data".
 * Dat veld bevat JSON vanuit de HTML-pagina.
 *
 * Het script:
 * - schrijft de FIFO-status in B20:H20 van de juiste week-sheet;
 * - onderscheidt FIFO-fouten van afdelingen die vandaag niet gevuld zijn;
 * - voegt waarschuwingen toe aan Tabel_waarschuwingen op sheet "Lijst waarschuwingen".
 */
function main(
    workbook: ExcelScript.Workbook,
    mode: string,
    password: string,
    dateKey: string,
    controleData: string = ""
): string {
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

        if (mode === "missing") {
            const currentValue = String(range.getValue() ?? "").trim();

            if (currentValue === "") {
                range.setValue("Niet uitgevoerd 🙁");
            }

            return `OK missing-check: ${sheetName}!${targetCell}`;
        }

        if (mode !== "fifo") {
            throw new Error(`Onbekende mode: ${mode}`);
        }

        const payload = parseControleData(controleData);

        const afdelingen = [
            "Zuivel",
            "Kaas/Vleeswaren",
            "Vlees/Vis/Kip/Vega",
            "Maaltijden/Sappen",
            "Panklaar"
        ];

        const fouten: string[] = [];
        const nietGevuld: string[] = [];

        for (const afdeling of afdelingen) {
            if (isAfdelingNietGevuld(payload, afdeling)) {
                nietGevuld.push(afdeling);
            } else if (!isAllCorrect(scoreForAfdeling(payload, afdeling))) {
                fouten.push(afdeling);
            }
        }

        const value = buildCellValue(fouten, nietGevuld);
        range.setValue(value);

        const waarschuwingenAantal = addWaarschuwingen(workbook, password, payload, dateKey);

        return `OK fifo: ${sheetName}!${targetCell} = ${value}; waarschuwingen toegevoegd: ${waarschuwingenAantal}`;
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
    MedewerkerAanspreken?: boolean;
    MedewerkerNaam?: string;
    AfdelingNietGevuld?: boolean;
}

interface WaarschuwingRegel {
    DatumGegeven?: string;
    NaamMedewerker?: string;
    Reden?: string;
    Officieel?: string;
    ShiftleiderManager?: string;
    Opmerkingen?: string;
}

function parseControleData(controleData: string): ControlePayload {
    const text = String(controleData || "").trim();

    if (!text) {
        throw new Error("Controle data is leeg. Controleer of het Forms-veld 'Controle data' goed is gekoppeld in Power Automate.");
    }

    try {
        return JSON.parse(text) as ControlePayload;
    } catch (e) {
        throw new Error("Controle data is geen geldige JSON. Controleer of de HTML de Forms-link goed vult.");
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

    const producten = payload.Producten || [];
    const items = producten.filter(p => String(p.Afdeling || "") === afdeling);
    const meetellend = items.filter(p => String(p.Status || "") !== "Niet gevuld");
    const correct = meetellend.filter(p => String(p.Status || "") === "Goed");

    return `${correct.length}/${meetellend.length}`;
}

function buildCellValue(fouten: string[], nietGevuld: string[]): string {
    if (fouten.length === 0 && nietGevuld.length === 0) {
        return "FIFO gecontroleerd: alles goed 😃";
    }

    const parts: string[] = [];

    if (fouten.length > 0) {
        parts.push(`fout bij ${fouten.join(" & ")}`);
    }

    if (nietGevuld.length > 0) {
        parts.push(`niet gevuld bij ${nietGevuld.join(" & ")}`);
    }

    return `FIFO gecontroleerd: ${parts.join(" | ")}`;
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

    const protectionWasPaused = pauseProtectionIfNeeded(warningSheet, password);

    try {
        let count = 0;

        for (const w of waarschuwingen) {
            const naamMedewerker = String(w.NaamMedewerker || "").trim();
            const shiftleiderManager = String(w.ShiftleiderManager || payload.Shiftleider || "").trim();

            if (!naamMedewerker) {
                continue;
            }

            table.addRow(-1, [
                String(w.DatumGegeven || payload.DagKey || fallbackDateKey),
                naamMedewerker,
                "Niet FIFO",
                "Nee",
                shiftleiderManager,
                String(w.Opmerkingen || "").trim()
            ]);

            count++;
        }

        return count;
    } finally {
        if (protectionWasPaused) {
            warningSheet.getProtection().resumeProtection();
        }
    }
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

/**
 * Accepteert:
 * - yyyy-MM-dd
 * - dd-MM-yyyy
 * - dd/MM/yyyy
 * - ISO-datetime die begint met yyyy-MM-dd
 */
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

/**
 * B20=maandag, C20=dinsdag, D20=woensdag, E20=donderdag,
 * F20=vrijdag, G20=zaterdag, H20=zondag.
 */
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

/**
 * ISO-weekberekening: maandag is start van de week.
 */
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

/**
 * True alleen als score in format x/y staat en x == y en y > 0.
 */
function isAllCorrect(value: string): boolean {
    const text = String(value || "").trim();
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);

    if (!match) {
        return false;
    }

    const correct = Number(match[1]);
    const total = Number(match[2]);

    return total > 0 && correct === total;
}

function normalize(value: string): string {
    return String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}
