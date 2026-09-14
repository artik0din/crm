import "@crm/env/load";

import { type Db, db } from "../src/client";
import { RecordSource } from "../src/generated/prisma/enums";
import {
	type CsvColumnSet,
	type LeadRow,
	readLeadCsv,
} from "./import-leads-csv";
import {
	ensureImportFields,
	type ImportFieldSets,
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
	fieldValuesWritten: number;
	rejected: Record<ImportRejectReason, number>;
	durationMs: number;
};

export type ImportLeadsOptions = {
	csvPath: string;
	dryRun: boolean;
	limit: number | null;
	minScore: number | null;
	segments: Set<SegmentKey> | null;
	client?: Db;
};

const BATCH = 1000;

function parseArgs(argv: string[]): ImportLeadsOptions {
	let csvPath: string | null = null;
	let dryRun = false;
	let limit: number | null = null;
	let minScore: number | null = null;
	let segments: Set<SegmentKey> | null = null;

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
		if (!arg.startsWith("-") && !csvPath) {
			csvPath = arg;
		}
	}

	if (!csvPath) {
		throw new Error(
			"Usage: bun packages/db/scripts/import-leads.ts <csv> [--dry-run] [--limit N] [--min-score N] [--segments a,b]",
		);
	}

	return { csvPath, dryRun, limit, minScore, segments };
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
): Promise<void> {
	const rowValues = companyFieldValues(row, columns);
	const merged = mergeCompanyFieldValuesFirstWins(
		companyFieldState.get(domain) ?? {},
		rowValues,
	);
	companyFieldState.set(domain, merged);
	const toWrite = companyFieldValuesToWrite(rowValues, merged);
	stats.fieldValuesWritten += await writeCompanyValues(
		client,
		companyFields,
		companyId,
		toWrite,
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
	stats.fieldValuesWritten += await writeContactValues(
		client,
		contactFields,
		contact.id,
		values,
	);
}

export async function runImportLeads(
	options: ImportLeadsOptions,
): Promise<ImportStats> {
	const started = performance.now();
	const client = options.client ?? db;
	const rejected = emptyRejected();
	const stats: ImportStats = {
		linesRead: 0,
		rowsParsed: 0,
		contactsCreated: 0,
		contactsUpdated: 0,
		companiesCreated: 0,
		companiesUpdated: 0,
		fieldValuesWritten: 0,
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
		const fieldSets = await ensureImportFields(client, technoSites);
		contactFields = fieldSets.contact;
		companyFields = fieldSets.company;
	}

	let processed = 0;
	for (const row of rows) {
		if (!shouldImportRow(row, options.minScore, options.segments, rejected)) {
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
	const lines = [
		`lines_read: ${stats.linesRead}`,
		`rows_parsed: ${stats.rowsParsed}`,
		`contacts_created: ${stats.contactsCreated}`,
		`contacts_updated: ${stats.contactsUpdated}`,
		`companies_created: ${stats.companiesCreated}`,
		`companies_updated: ${stats.companiesUpdated}`,
		`field_values_written: ${stats.fieldValuesWritten}`,
		`rejected_missing_email: ${stats.rejected.missing_email}`,
		`rejected_invalid_integer: ${stats.rejected.invalid_integer}`,
		`rejected_invalid_date: ${stats.rejected.invalid_date}`,
		`rejected_below_min_score: ${stats.rejected.below_min_score}`,
		`rejected_segment_filtered: ${stats.rejected.segment_filtered}`,
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
