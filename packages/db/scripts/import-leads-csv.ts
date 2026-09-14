export type LeadRow = {
	idSource: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	createdAt: string | null;
	sourceFile: string;
	tags: string;
	domain: string;
	domainPro: boolean;
	telE164: string;
	telValid: boolean;
	telType: string;
	siren: string;
	sirenEtat: string;
	sirenDateCreation: string;
	sirenNaf: string;
	sirenSiegeDept: string;
	sirenSiegeCommune: string;
	confiance: string;
	technoSite: string;
	sirenSite: string;
	score: number | null;
};

const REQUIRED_HEADERS = [
	"ID",
	"E-mail",
	"email_norm",
	"source_file",
	"domaine",
	"domaine_pro",
	"score",
] as const;

export function parseCsvLine(line: string): string[] {
	const out: string[] = [];
	let cur = "";
	let quoted = false;

	for (let index = 0; index < line.length; index++) {
		const char = line[index];

		if (quoted) {
			if (char === '"' && line[index + 1] === '"') {
				cur += '"';
				index++;
			} else if (char === '"') {
				quoted = false;
			} else {
				cur += char;
			}
			continue;
		}

		if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			out.push(cur);
			cur = "";
		} else {
			cur += char;
		}
	}

	out.push(cur);
	return out;
}

function indexMap(headers: string[]): Map<string, number> {
	const map = new Map<string, number>();
	for (let index = 0; index < headers.length; index++) {
		map.set(headers[index], index);
	}
	return map;
}

function cell(row: string[], map: Map<string, number>, key: string): string {
	const index = map.get(key);
	if (index === undefined) return "";
	return row[index]?.trim() ?? "";
}

function parseBool(raw: string): boolean {
	const value = raw.trim().toLowerCase();
	return value === "true" || value === "1" || value === "oui";
}

function parseScore(raw: string): number | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const parsed = Number.parseInt(trimmed, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

export function parseLeadRow(
	row: string[],
	map: Map<string, number>,
): LeadRow | null {
	const emailNorm = cell(row, map, "email_norm");
	const emailRaw = cell(row, map, "E-mail");
	const email = (emailNorm || emailRaw).trim().toLowerCase();
	if (!email?.includes("@")) return null;

	const score = parseScore(cell(row, map, "score"));

	return {
		idSource: cell(row, map, "ID"),
		email,
		firstName: cell(row, map, "Prénom") || null,
		lastName: cell(row, map, "Nom") || null,
		createdAt: cell(row, map, "Date de création") || null,
		sourceFile: cell(row, map, "source_file"),
		tags: cell(row, map, "Étiquettes"),
		domain: cell(row, map, "domaine").toLowerCase(),
		domainPro: parseBool(cell(row, map, "domaine_pro")),
		telE164: cell(row, map, "tel_e164"),
		telValid: parseBool(cell(row, map, "tel_valide")),
		telType: cell(row, map, "tel_type").toLowerCase(),
		siren: cell(row, map, "siren"),
		sirenEtat: cell(row, map, "siren_etat").toUpperCase(),
		sirenDateCreation: cell(row, map, "siren_date_creation"),
		sirenNaf: cell(row, map, "siren_naf"),
		sirenSiegeDept: cell(row, map, "siren_siege_dept"),
		sirenSiegeCommune: cell(row, map, "siren_siege_commune"),
		confiance: cell(row, map, "confiance").toLowerCase(),
		technoSite: cell(row, map, "techno_site"),
		sirenSite: cell(row, map, "siren_site"),
		score,
	};
}

export function validateHeaders(headers: string[]): void {
	for (const required of REQUIRED_HEADERS) {
		if (!headers.includes(required)) {
			throw new Error(`Missing CSV column "${required}".`);
		}
	}
}

export async function readLeadCsv(path: string): Promise<{
	headers: string[];
	rows: LeadRow[];
	linesRead: number;
	missingEmail: number;
}> {
	const text = await Bun.file(path).text();
	const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
	if (lines.length === 0) {
		return { headers: [], rows: [], linesRead: 0, missingEmail: 0 };
	}

	const headerLine = lines[0].replace(/^\uFEFF/, "");
	const headers = parseCsvLine(headerLine);
	validateHeaders(headers);
	const map = indexMap(headers);

	const rows: LeadRow[] = [];
	let missingEmail = 0;
	for (let index = 1; index < lines.length; index++) {
		const parsed = parseLeadRow(parseCsvLine(lines[index]), map);
		if (parsed) rows.push(parsed);
		else missingEmail++;
	}

	return { headers, rows, linesRead: lines.length - 1, missingEmail };
}
