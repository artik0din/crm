import { parseCsvRecords, readTextFile } from "./import-leads-csv-parse";
import {
	parseCalendarDate,
	parseStrictSignedInteger,
} from "./import-leads-validation";

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
	siteDenomination: string;
	siteCategorieJuridique: string;
	siteNaf: string;
	siteTrancheEffectif: string;
	siteEtat: string;
	siteSiegeDept: string;
};

export type CsvColumnSet = ReadonlySet<string>;

export type ParseLeadRowResult =
	| { ok: true; row: LeadRow }
	| { ok: false; reason: "missing_email" | "invalid_integer" | "invalid_date" };

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
	const records = parseCsvRecords(line.endsWith("\n") ? line : `${line}\n`);
	return records[0] ?? [];
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
	return row[index] ?? "";
}

function hasColumn(columns: CsvColumnSet, key: string): boolean {
	return columns.has(key);
}

function parseBool(raw: string): boolean {
	const value = raw.trim().toLowerCase();
	return value === "true" || value === "1" || value === "oui";
}

function parseScore(
	raw: string,
	columns: CsvColumnSet,
): number | null | "invalid" {
	if (!hasColumn(columns, "score")) return null;
	const parsed = parseStrictSignedInteger(raw);
	if (!parsed.ok) return parsed.reason === "empty" ? "invalid" : "invalid";
	return parsed.value;
}

function parseOptionalDate(
	raw: string,
	column: string,
	columns: CsvColumnSet,
): string | null | "invalid" {
	if (!hasColumn(columns, column)) return null;
	const parsed = parseCalendarDate(raw);
	if (!parsed.ok) {
		if (parsed.reason === "empty") return null;
		return "invalid";
	}
	return parsed.value;
}

export function parseLeadRow(
	row: string[],
	map: Map<string, number>,
	columns: CsvColumnSet,
): ParseLeadRowResult {
	const emailNorm = cell(row, map, "email_norm");
	const emailRaw = cell(row, map, "E-mail");
	const email = (emailNorm || emailRaw).trim().toLowerCase();
	if (!email.includes("@")) return { ok: false, reason: "missing_email" };

	const scoreResult = parseScore(cell(row, map, "score"), columns);
	if (scoreResult === "invalid") {
		return { ok: false, reason: "invalid_integer" };
	}

	const createdAt = parseOptionalDate(
		cell(row, map, "Date de création"),
		"Date de création",
		columns,
	);
	if (createdAt === "invalid") {
		return { ok: false, reason: "invalid_date" };
	}

	const sirenDateCreation = parseOptionalDate(
		cell(row, map, "siren_date_creation"),
		"siren_date_creation",
		columns,
	);
	if (sirenDateCreation === "invalid") {
		return { ok: false, reason: "invalid_date" };
	}

	return {
		ok: true,
		row: {
			idSource: cell(row, map, "ID"),
			email,
			firstName: cell(row, map, "Prénom") || null,
			lastName: cell(row, map, "Nom") || null,
			createdAt,
			sourceFile: cell(row, map, "source_file"),
			tags: cell(row, map, "Étiquettes"),
			domain: cell(row, map, "domaine").toLowerCase(),
			domainPro: parseBool(cell(row, map, "domaine_pro")),
			telE164: cell(row, map, "tel_e164"),
			telValid: parseBool(cell(row, map, "tel_valide")),
			telType: cell(row, map, "tel_type").toLowerCase(),
			siren: cell(row, map, "siren"),
			sirenEtat: cell(row, map, "siren_etat").toUpperCase(),
			sirenDateCreation: sirenDateCreation ?? "",
			sirenNaf: cell(row, map, "siren_naf"),
			sirenSiegeDept: cell(row, map, "siren_siege_dept"),
			sirenSiegeCommune: cell(row, map, "siren_siege_commune"),
			confiance: cell(row, map, "confiance").toLowerCase(),
			technoSite: cell(row, map, "techno_site"),
			sirenSite: cell(row, map, "siren_site"),
			score: scoreResult,
			siteDenomination: cell(row, map, "site_denomination"),
			siteCategorieJuridique: cell(row, map, "site_categorie_juridique"),
			siteNaf: cell(row, map, "site_naf"),
			siteTrancheEffectif: cell(row, map, "site_tranche_effectif"),
			siteEtat: cell(row, map, "site_etat").toLowerCase(),
			siteSiegeDept: cell(row, map, "site_siege_dept"),
		},
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
	columns: CsvColumnSet;
	rows: LeadRow[];
	linesRead: number;
	missingEmail: number;
	invalidInteger: number;
	invalidDate: number;
}> {
	const text = await readTextFile(path);
	const records = parseCsvRecords(text);
	if (records.length === 0) {
		return {
			headers: [],
			columns: new Set(),
			rows: [],
			linesRead: 0,
			missingEmail: 0,
			invalidInteger: 0,
			invalidDate: 0,
		};
	}

	const headers = records[0];
	validateHeaders(headers);
	const map = indexMap(headers);
	const columns: CsvColumnSet = new Set(headers);

	const rows: LeadRow[] = [];
	let missingEmail = 0;
	let invalidInteger = 0;
	let invalidDate = 0;

	for (let index = 1; index < records.length; index++) {
		const parsed = parseLeadRow(records[index], map, columns);
		if (parsed.ok) {
			rows.push(parsed.row);
			continue;
		}
		if (parsed.reason === "missing_email") missingEmail++;
		else if (parsed.reason === "invalid_integer") invalidInteger++;
		else if (parsed.reason === "invalid_date") invalidDate++;
	}

	return {
		headers,
		columns,
		rows,
		linesRead: records.length - 1,
		missingEmail,
		invalidInteger,
		invalidDate,
	};
}
