import "@crm/env/load";

import { type Db, db } from "../src/client";
import { FieldEntity, RecordSource } from "../src/generated/prisma/enums";
import {
	type CsvColumnSet,
	type LeadRow,
	readLeadCsv,
} from "./import-leads-csv";
import {
	ensureImportFields,
	IMPORT_FIELD_KEYS,
	type ImportFieldSets,
	unknownSelectOptions,
	writeCompanyValues,
	writeContactValues,
} from "./import-leads-fields";
import {
	companyFieldValues,
	companyFieldValuesToWrite,
	companyNameFromDomain,
	contactFieldValues,
	type ImportFieldValueMap,
	localPartFromEmail,
	mergeCompanyFieldValuesFirstWins,
	type SegmentKey,
	segmentFromSourceFile,
} from "./import-leads-mappings";

export type ImportRejectReason =
	| "missing_email"
	| "below_min_score"
	| "segment_filtered"
	| "invalid_integer"
	| "invalid_date";

export type ImportStats = {
	linesRead: number;
	rowsParsed: number;
	contactsCreated: number;
	contactsUpdated: number;
	companiesCreated: number;
	companiesUpdated: number;
	fieldValuesUpserted: number;
	fieldValuesCleared: number;
	rejectedUnknownOption: Record<string, number>;
	rejected: Record<ImportRejectReason, number>;
	durationMs: number;
};

export type ImportLeadsOptions = {
	csvPath: string;
	dryRun: boolean;
	limit: number | null;
	minScore: number | null;
	segments: Set<SegmentKey> | null;
	fields?: Set<string> | null;
	client?: Db;
};

const BATCH = 1000;

function addFieldWriteStats(
	stats: ImportStats,
	written: Awaited<ReturnType<typeof writeContactValues>>,
): void {
	stats.fieldValuesUpserted += written.upserted;
	stats.fieldValuesCleared += written.cleared;
	addUnknownOptionStats(stats, written.rejectedUnknownOption);
}

function addUnknownOptionStats(
	stats: ImportStats,
	rejected: Record<string, number>,
): void {
	for (const [key, count] of Object.entries(rejected)) {
		stats.rejectedUnknownOption[key] =
			(stats.rejectedUnknownOption[key] ?? 0) + count;
	}
}

function parseArgs(argv: string[]): ImportLeadsOptions {
	let csvPath: string | null = null;
	let dryRun = false;
	let limit: number | null = null;
	let minScore: number | null = null;
	let segments: Set<SegmentKey> | null = null;
	let fields: Set<string> | null = null;

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--limit") {
			const next = argv[index + 1];
			if (!next) throw new Error("--limit requires a number.");
			limit = Number.parseInt(next, 10);
			if (!Number.isFinite(limit) || limit < 1) {
				throw new Error("--limit must be a positive integer.");
			}
			index++;
			continue;
		}
		if (arg === "--min-score") {
			const next = argv[index + 1];
			if (!next) throw new Error("--min-score requires a number.");
			minScore = Number.parseInt(next, 10);
			if (!Number.isFinite(minScore)) {
				throw new Error("--min-score must be an integer.");
			}
			index++;
			continue;
		}
		if (arg === "--segments") {
			const next = argv[index + 1];
			if (!next) throw new Error("--segments requires a comma-separated list.");
			segments = new Set(
				next.split(",").map((part) => part.trim()) as SegmentKey[],
			);
			index++;
			continue;
		}
		if (arg === "--fields") {
			const next = argv[index + 1];
			if (!next) throw new Error("--fields requires a comma-separated list.");
			fields = new Set(
				next
					.split(",")
					.map((part) => part.trim())
					.filter(Boolean),
			);
			if (fields.size === 0) {
				throw new Error("--fields requires at least one field key.");
			}
			index++;
			continue;
		}
		if (!arg.startsWith("-") && !csvPath) {
			csvPath = arg;
		}
	}

	if (!csvPath) {
		throw new Error(
			"Usage: bun packages/db/scripts/import-leads.ts <csv> [--dry-run] [--limit N] [--min-score N] [--segments a,b] [--fields k1,k2]",
		);
	}

	return { csvPath, dryRun, limit, minScore, segments, fields };
}

function validateSelectedFields(fields: ReadonlySet<string> | null): void {
	if (!fields) return;
	const known = new Set<string>(IMPORT_FIELD_KEYS);
	const unknown = [...fields].filter((key) => !known.has(key)).sort();
	if (unknown.length > 0) {
		throw new Error(`Unknown import field key(s): ${unknown.join(", ")}.`);
	}
}

function selectFieldValues(
	values: ImportFieldValueMap,
	fields: ReadonlySet<string> | null,
): ImportFieldValueMap {
	if (!fields) return values;
	return Object.fromEntries(
		Object.entries(values).filter(([key]) => fields.has(key)),
	);
}

function emptyRejected() {
	return {
		missing_email: 0,
		below_min_score: 0,
		segment_filtered: 0,
		invalid_integer: 0,
		invalid_date: 0,
	} satisfies Record<ImportRejectReason, number>;
}

function shouldImportRow(
	row: LeadRow,
	minScore: number | null,
	segments: Set<SegmentKey> | null,
	rejected: Record<ImportRejectReason, number>,
): boolean {
	if (minScore !== null && (row.score === null || row.score < minScore)) {
		rejected.below_min_score++;
		return false;
	}

	if (segments) {
		const segment = segmentFromSourceFile(row.sourceFile);
		if (!segment || !segments.has(segment)) {
			rejected.segment_filtered++;
			return false;
		}
	}

	return true;
}

function nonEmpty(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

async function writeCompanyFieldsForDomain(
	client: Db,
	companyId: string,
	companyFields: ImportFieldSets["company"],
	row: LeadRow,
	columns: CsvColumnSet,
	companyFieldState: Map<string, ImportFieldValueMap>,
	stats: ImportStats,
	domain: string,
	fields: ReadonlySet<string> | null,
): Promise<void> {
	const rowValues = selectFieldValues(companyFieldValues(row, columns), fields);
	const merged = mergeCompanyFieldValuesFirstWins(
		companyFieldState.get(domain) ?? {},
		rowValues,
	);
	companyFieldState.set(domain, merged);
	const toWrite = companyFieldValuesToWrite(rowValues, merged);
	addFieldWriteStats(
		stats,
		await writeCompanyValues(client, companyFields, companyId, toWrite),
	);
}

async function upsertCompany(
	client: Db,
	domain: string,
	row: LeadRow,
	columns: CsvColumnSet,
	companyFields: ImportFieldSets["company"],
	stats: ImportStats,
	companyCache: Map<string, string>,
	companyFieldState: Map<string, ImportFieldValueMap>,
	dryRun: boolean,
): Promise<string | null> {
	const cached = companyCache.get(domain);
	if (cached) {
		if (!dryRun && companyFields.length > 0) {
			await writeCompanyFieldsForDomain(
				client,
				cached,
				companyFields,
				row,
				columns,
				companyFieldState,
				stats,
				domain,
				null,
			);
		}
		return cached;
	}

	const existing = await client.company.findFirst({
		where: { domain, archivedAt: null },
		select: { id: true },
	});

	if (dryRun) {
		if (existing) stats.companiesUpdated++;
		else stats.companiesCreated++;
		companyCache.set(domain, existing?.id ?? `dry-${domain}`);
		return companyCache.get(domain) ?? null;
	}

	const data = {
		name: companyNameFromDomain(domain),
		domain,
		website: `https://${domain}`,
		source: RecordSource.IMPORT,
	};

	const company = existing
		? await client.company.update({
				where: { id: existing.id },
				data,
				select: { id: true },
			})
		: await client.company.create({
				data,
				select: { id: true },
			});

	if (existing) stats.companiesUpdated++;
	else stats.companiesCreated++;

	companyCache.set(domain, company.id);

	if (companyFields.length > 0) {
		await writeCompanyFieldsForDomain(
			client,
			company.id,
			companyFields,
			row,
			columns,
			companyFieldState,
			stats,
			domain,
			null,
		);
	}

	return company.id;
}

async function upsertContact(
	client: Db,
	row: LeadRow,
	columns: CsvColumnSet,
	companyId: string | null,
	contactFields: ImportFieldSets["contact"],
	stats: ImportStats,
	dryRun: boolean,
): Promise<void> {
	const incomingFirst =
		nonEmpty(row.firstName) ?? localPartFromEmail(row.email);
	const incomingLast = nonEmpty(row.lastName);
	const incomingPhone = row.telValid && row.telE164 ? row.telE164.trim() : null;

	if (dryRun) {
		const existing = await client.contact.findFirst({
			where: { email: row.email, archivedAt: null },
			select: { id: true },
		});
		if (existing) stats.contactsUpdated++;
		else stats.contactsCreated++;
		return;
	}

	const existing = await client.contact.findFirst({
		where: { email: row.email, archivedAt: null },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			phone: true,
			companyId: true,
			source: true,
		},
	});

	const firstName = nonEmpty(existing?.firstName) ?? incomingFirst;
	const lastName = nonEmpty(existing?.lastName) ?? incomingLast;
	const phone = nonEmpty(existing?.phone) ?? incomingPhone;
	const linkedCompanyId = existing?.companyId ?? companyId;
	const source = existing?.source ?? RecordSource.IMPORT;

	const payload = {
		firstName,
		lastName,
		email: row.email,
		phone,
		companyId: linkedCompanyId,
		source,
	};

	const contact = existing
		? await client.contact.update({
				where: { id: existing.id },
				data: payload,
				select: { id: true },
			})
		: await client.contact.create({
				data: payload,
				select: { id: true },
			});

	if (existing) stats.contactsUpdated++;
	else stats.contactsCreated++;

	const values = contactFieldValues(row, columns);
	addFieldWriteStats(
		stats,
		await writeContactValues(client, contactFields, contact.id, values),
	);
}

export async function runImportLeads(
	options: ImportLeadsOptions,
): Promise<ImportStats> {
	const started = performance.now();
	const client = options.client ?? db;
	const selectedFields = options.fields ?? null;
	validateSelectedFields(selectedFields);
	const rejected = emptyRejected();
	const stats: ImportStats = {
		linesRead: 0,
		rowsParsed: 0,
		contactsCreated: 0,
		contactsUpdated: 0,
		companiesCreated: 0,
		companiesUpdated: 0,
		fieldValuesUpserted: 0,
		fieldValuesCleared: 0,
		rejectedUnknownOption: {},
		rejected,
		durationMs: 0,
	};

	const {
		rows: allRows,
		linesRead,
		missingEmail,
		invalidInteger,
		invalidDate,
		columns,
	} = await readLeadCsv(options.csvPath);
	stats.linesRead = linesRead;
	stats.rowsParsed = allRows.length;
	stats.rejected.missing_email = missingEmail;
	stats.rejected.invalid_integer = invalidInteger;
	stats.rejected.invalid_date = invalidDate;

	const rows = options.limit ? allRows.slice(0, options.limit) : allRows;
	const technoSites = rows.map((row) => row.technoSite).filter(Boolean);

	const companyCache = new Map<string, string>();
	const companyFieldState = new Map<string, ImportFieldValueMap>();
	let contactFields: ImportFieldSets["contact"] = [];
	let companyFields: ImportFieldSets["company"] = [];

	if (!options.dryRun) {
		const fieldSets = await ensureImportFields(
			client,
			technoSites,
			selectedFields,
		);
		contactFields = fieldSets.contact;
		companyFields = fieldSets.company;
	}

	let processed = 0;
	for (const row of rows) {
		if (!shouldImportRow(row, options.minScore, options.segments, rejected)) {
			continue;
		}

		if (options.dryRun) {
			addUnknownOptionStats(
				stats,
				unknownSelectOptions(
					FieldEntity.CONTACT,
					selectFieldValues(contactFieldValues(row, columns), selectedFields),
				),
			);
			if (row.domainPro && row.domain) {
				addUnknownOptionStats(
					stats,
					unknownSelectOptions(
						FieldEntity.COMPANY,
						selectFieldValues(companyFieldValues(row, columns), selectedFields),
					),
				);
			}
		}

		if (selectedFields) {
			if (
				!options.dryRun &&
				row.domainPro &&
				row.domain &&
				companyFields.length > 0
			) {
				const company = await client.company.findFirst({
					where: { domain: row.domain, archivedAt: null },
					select: { id: true },
				});
				if (company) {
					await writeCompanyFieldsForDomain(
						client,
						company.id,
						companyFields,
						row,
						columns,
						companyFieldState,
						stats,
						row.domain,
						selectedFields,
					);
				}
			}

			if (!options.dryRun && contactFields.length > 0) {
				const contact = await client.contact.findFirst({
					where: { email: row.email, archivedAt: null },
					select: { id: true },
				});
				if (contact) {
					const values = selectFieldValues(
						contactFieldValues(row, columns),
						selectedFields,
					);
					addFieldWriteStats(
						stats,
						await writeContactValues(client, contactFields, contact.id, values),
					);
				}
			}
			processed++;
			continue;
		}

		let companyId: string | null = null;
		if (row.domainPro && row.domain) {
			companyId = await upsertCompany(
				client,
				row.domain,
				row,
				columns,
				companyFields,
				stats,
				companyCache,
				companyFieldState,
				options.dryRun,
			);
		}

		await upsertContact(
			client,
			row,
			columns,
			companyId,
			contactFields,
			stats,
			options.dryRun,
		);
		processed++;

		if (processed % BATCH === 0 && !options.dryRun) {
			await flushProgress(processed);
		}
	}

	stats.durationMs = Math.round(performance.now() - started);
	return stats;
}

async function flushProgress(_processed: number): Promise<void> {
	return;
}

export function formatImportStats(stats: ImportStats): string {
	const rejectedUnknownOption = Object.values(
		stats.rejectedUnknownOption,
	).reduce((total, count) => total + count, 0);
	const lines = [
		`lines_read: ${stats.linesRead}`,
		`rows_parsed: ${stats.rowsParsed}`,
		`contacts_created: ${stats.contactsCreated}`,
		`contacts_updated: ${stats.contactsUpdated}`,
		`companies_created: ${stats.companiesCreated}`,
		`companies_updated: ${stats.companiesUpdated}`,
		`field_values_upserted: ${stats.fieldValuesUpserted}`,
		`field_values_cleared: ${stats.fieldValuesCleared}`,
		`rejected_missing_email: ${stats.rejected.missing_email}`,
		`rejected_invalid_integer: ${stats.rejected.invalid_integer}`,
		`rejected_invalid_date: ${stats.rejected.invalid_date}`,
		`rejected_below_min_score: ${stats.rejected.below_min_score}`,
		`rejected_segment_filtered: ${stats.rejected.segment_filtered}`,
		`rejected_unknown_option: ${rejectedUnknownOption}`,
		...Object.entries(stats.rejectedUnknownOption)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, count]) => `rejected_unknown_option.${key}: ${count}`),
		`duration_ms: ${stats.durationMs}`,
	];
	return lines.join("\n");
}

if (import.meta.main) {
	const options = parseArgs(process.argv.slice(2));
	runImportLeads(options)
		.then((stats) => {
			console.log(formatImportStats(stats));
		})
		.catch((error) => {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
}
