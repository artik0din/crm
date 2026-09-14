import type { LeadRow } from "./import-leads-csv";

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

const SOURCE_FILE_TO_SEGMENT: Record<string, SegmentKey> = {
	"Business Pro - Purchase.csv": "acheteur",
	"Clients Pack Mindeo.csv": "pack_mindeo",
	"Business Pro - Membres Groupe Coaching.csv": "coaching",
	"Business Pro - Leads Actif -3 mois.csv": "actif_3m",
	"Business Pro - Leads Actif -6 mois.csv": "actif_6m",
	"Business Pro - Leads Actif -12 mois.csv": "actif_12m",
	"Business Pro - Leads Actif -24 mois.csv": "actif_24m",
};

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

export function sirenEtatOption(etat: string): string | null {
	if (etat === "A") return "actif";
	if (etat === "C") return "cesse";
	return null;
}

export function telTypeOption(telType: string): string | null {
	if (telType === "mobile" || telType === "fixe" || telType === "autre") {
		return telType;
	}
	return null;
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

export function parseImportDate(raw: string | null): string | null {
	if (!raw?.trim()) return null;
	const trimmed = raw.trim();
	const dateOnly = trimmed.slice(0, 10);
	if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly;
	return null;
}

export function contactFieldValues(row: LeadRow): Record<string, unknown> {
	const values: Record<string, unknown> = {};

	if (row.score !== null) values.score = row.score;

	const segment = segmentFromSourceFile(row.sourceFile);
	if (segment) values.segment = segment;

	values.engagement = engagementFromTags(row.tags);
	values.dirigeant = dirigeantFromConfiance(row.confiance);

	if (row.siren) values.siren = row.siren;

	const etat = sirenEtatOption(row.sirenEtat);
	if (etat) values.siren_etat = etat;

	if (row.sirenNaf) values.siren_naf = row.sirenNaf;

	const sirenDate = parseImportDate(row.sirenDateCreation);
	if (sirenDate) values.siren_date_creation = sirenDate;

	if (row.sirenSiegeDept) values.siren_siege_dept = row.sirenSiegeDept;
	if (row.sirenSiegeCommune) values.siren_siege_commune = row.sirenSiegeCommune;

	const telType = telTypeOption(row.telType);
	if (telType) values.tel_type = telType;

	if (row.technoSite) values.site_techno = row.technoSite;

	const inscrit = parseImportDate(row.createdAt);
	if (inscrit) values.inscrit_le = inscrit;

	if (row.idSource) values.id_source = row.idSource;

	return values;
}

export function companyFieldValues(row: LeadRow): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	if (row.technoSite) values.site_techno = row.technoSite;
	if (row.sirenSite) values.siren_site = row.sirenSite;
	return values;
}
