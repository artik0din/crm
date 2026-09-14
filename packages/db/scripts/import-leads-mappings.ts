import type { CsvColumnSet, LeadRow } from "./import-leads-csv";

export type ImportFieldValue = string | number | null;

export type ImportFieldValueMap = Record<string, ImportFieldValue>;

export const SEGMENT_OPTIONS = [
	"acheteur",
	"pack_mindeo",
	"coaching",
	"actif_3m",
	"actif_6m",
	"actif_12m",
	"actif_24m",
] as const;

export type SegmentKey = (typeof SEGMENT_OPTIONS)[number];

const SOURCE_FILE_TO_SEGMENT = {
	"Business Pro - Purchase.csv": "acheteur",
	"Clients Pack Mindeo.csv": "pack_mindeo",
	"Business Pro - Membres Groupe Coaching.csv": "coaching",
	"Business Pro - Leads Actif -3 mois.csv": "actif_3m",
	"Business Pro - Leads Actif -6 mois.csv": "actif_6m",
	"Business Pro - Leads Actif -12 mois.csv": "actif_12m",
	"Business Pro - Leads Actif -24 mois.csv": "actif_24m",
} satisfies Record<string, SegmentKey>;

export function segmentFromSourceFile(sourceFile: string): SegmentKey | null {
	return SOURCE_FILE_TO_SEGMENT[sourceFile] ?? null;
}

export function engagementFromTags(tags: string): string {
	const parts = tags
		.split(",")
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);
	if (parts.includes("disengaged")) return "disengaged";
	if (parts.includes("engaged")) return "engaged";
	return "neutre";
}

export function dirigeantFromConfiance(confiance: string): string {
	if (confiance === "haute") return "haute";
	if (confiance === "moyenne") return "moyenne";
	if (confiance === "ambigu") return "ambigu";
	return "aucun";
}

export function etatOption(etat: string): string | null {
	const normalized = etat.trim().toUpperCase();
	if (normalized === "A" || normalized === "ACTIF") return "actif";
	if (normalized === "C" || normalized === "CESSE") return "cesse";
	return normalized || null;
}

export function telTypeOption(telType: string): string | null {
	const normalized = telType.trim().toLowerCase();
	return normalized || null;
}

export function companyNameFromDomain(domain: string): string {
	const label = domain.split(".")[0] ?? domain;
	if (!label) return domain;
	return label.charAt(0).toUpperCase() + label.slice(1);
}

export function localPartFromEmail(email: string): string {
	const at = email.indexOf("@");
	if (at <= 0) return email;
	return email.slice(0, at);
}

function hasColumn(columns: CsvColumnSet, key: string): boolean {
	return columns.has(key);
}

function textValue(raw: string): string | null {
	const trimmed = raw.trim();
	return trimmed ? trimmed : null;
}

export function contactFieldValues(
	row: LeadRow,
	columns: CsvColumnSet,
): ImportFieldValueMap {
	const values: ImportFieldValueMap = {};

	if (hasColumn(columns, "score")) {
		values.score = row.score;
	}

	if (hasColumn(columns, "source_file")) {
		values.segment = row.sourceFile.trim()
			? (segmentFromSourceFile(row.sourceFile) ?? row.sourceFile.trim())
			: null;
	}

	if (hasColumn(columns, "Étiquettes")) {
		values.engagement = row.tags.trim() ? engagementFromTags(row.tags) : null;
	}

	if (hasColumn(columns, "confiance")) {
		values.dirigeant = row.confiance.trim()
			? dirigeantFromConfiance(row.confiance)
			: null;
	}

	if (hasColumn(columns, "siren")) {
		values.siren = textValue(row.siren);
	}

	if (hasColumn(columns, "siren_etat")) {
		values.siren_etat = etatOption(row.sirenEtat);
	}

	if (hasColumn(columns, "siren_naf")) {
		values.siren_naf = textValue(row.sirenNaf);
	}

	if (hasColumn(columns, "siren_date_creation")) {
		values.siren_date_creation = row.sirenDateCreation
			? row.sirenDateCreation
			: null;
	}

	if (hasColumn(columns, "siren_siege_dept")) {
		values.siren_siege_dept = textValue(row.sirenSiegeDept);
	}

	if (hasColumn(columns, "siren_siege_commune")) {
		values.siren_siege_commune = textValue(row.sirenSiegeCommune);
	}

	if (hasColumn(columns, "tel_type")) {
		values.tel_type = telTypeOption(row.telType);
	}

	if (hasColumn(columns, "techno_site")) {
		values.site_techno = textValue(row.technoSite);
	}

	if (hasColumn(columns, "Date de création")) {
		values.inscrit_le = row.createdAt;
	}

	if (hasColumn(columns, "ID")) {
		values.id_source = textValue(row.idSource);
	}

	if (hasColumn(columns, "site_denomination")) {
		values.site_denomination = textValue(row.siteDenomination);
	}

	if (hasColumn(columns, "site_categorie_juridique")) {
		values.site_categorie_juridique = textValue(row.siteCategorieJuridique);
	}

	if (hasColumn(columns, "site_naf")) {
		values.site_naf = textValue(row.siteNaf);
	}

	if (hasColumn(columns, "site_tranche_effectif")) {
		values.site_tranche_effectif = textValue(row.siteTrancheEffectif);
	}

	if (hasColumn(columns, "site_etat")) {
		values.site_etat = etatOption(row.siteEtat);
	}

	if (hasColumn(columns, "site_siege_dept")) {
		values.site_siege_dept = textValue(row.siteSiegeDept);
	}

	return values;
}

export function companyFieldValues(
	row: LeadRow,
	columns: CsvColumnSet,
): ImportFieldValueMap {
	const values: ImportFieldValueMap = {};
	if (hasColumn(columns, "techno_site")) {
		values.site_techno = textValue(row.technoSite);
	}
	if (hasColumn(columns, "siren_site")) {
		values.siren_site = textValue(row.sirenSite);
	}
	return values;
}

export function mergeCompanyFieldValuesFirstWins(
	existing: ImportFieldValueMap,
	incoming: ImportFieldValueMap,
): ImportFieldValueMap {
	const merged: ImportFieldValueMap = { ...existing };
	for (const [key, value] of Object.entries(incoming)) {
		const current = merged[key];
		if (current !== undefined && current !== null && current !== "") continue;
		if (value !== undefined && value !== null && value !== "") {
			merged[key] = value;
		}
	}
	return merged;
}

export function companyFieldValuesToWrite(
	rowValues: ImportFieldValueMap,
	merged: ImportFieldValueMap,
): ImportFieldValueMap {
	const out: ImportFieldValueMap = {};
	for (const [key, value] of Object.entries(rowValues)) {
		if (value === null || value === "") {
			const kept = merged[key];
			if (kept !== undefined && kept !== null && kept !== "") continue;
		}
		out[key] = value;
	}
	return out;
}
