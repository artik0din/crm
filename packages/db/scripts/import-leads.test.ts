import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { db } from "../src/client";
import { type FieldDefinitionWithOptions, readValue } from "../src/fields";
import { runImportLeads } from "./import-leads";

process.env.NODE_ENV = "test";

const fixture = join(import.meta.dir, "fixtures/leads-sample.csv");
const emailDomain = "@example.test";
let initialStats: Awaited<ReturnType<typeof runImportLeads>>;

async function cleanup(): Promise<void> {
	const contacts = await db.contact.findMany({
		where: { email: { endsWith: emailDomain } },
		select: { id: true, companyId: true },
	});
	const contactIds = contacts.map((row) => row.id);
	const companyIds = [
		...new Set(
			contacts.map((row) => row.companyId).filter(Boolean) as string[],
		),
	];

	await db.fieldValue.deleteMany({
		where: {
			OR: [
				{ contactId: { in: contactIds } },
				{ companyId: { in: companyIds } },
			],
		},
	});
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.company.deleteMany({
		where: {
			OR: [
				{ id: { in: companyIds } },
				{ domain: { endsWith: ".example.test" } },
			],
		},
	});
}

async function fieldByKey(
	entity: "CONTACT" | "COMPANY",
	key: string,
): Promise<FieldDefinitionWithOptions> {
	return db.fieldDefinition.findFirstOrThrow({
		where: { entity, key, archivedAt: null },
		include: { options: true },
	});
}

beforeAll(async () => {
	await cleanup();
	initialStats = await runImportLeads({
		csvPath: fixture,
		dryRun: false,
		limit: null,
		minScore: null,
		segments: null,
	});
});

afterAll(async () => {
	await cleanup();
});

describe("import-leads", () => {
	it("creates import field definitions and options", async () => {
		const segment = await fieldByKey("CONTACT", "segment");
		expect(segment.options.map((row) => row.label)).toContain("acheteur");
		expect(segment.showOnTable).toBe(true);
		expect(segment.showOnFilter).toBe(true);
		expect(segment.agentFilled).toBe(false);

		const score = await fieldByKey("CONTACT", "score");
		expect(score.type).toBe("NUMBER");
	});

	it("uses email local part when first name is missing", async () => {
		const contact = await db.contact.findFirstOrThrow({
			where: { email: "local.only@example.test", archivedAt: null },
		});
		expect(contact.firstName).toBe("local.only");
	});

	it("drops invalid phone numbers", async () => {
		const contact = await db.contact.findFirstOrThrow({
			where: { email: "bob.pack@example.test", archivedAt: null },
		});
		expect(contact.phone).toBeNull();
	});

	it("links pro domain contacts to companies", async () => {
		const contact = await db.contact.findFirstOrThrow({
			where: { email: "alice.buyer@example.test", archivedAt: null },
			include: { company: true },
		});
		expect(contact.company?.domain).toBe("acme-corp.example.test");
	});

	it("maps Disengaged tags to engagement field", async () => {
		const field = await fieldByKey("CONTACT", "engagement");
		const row = await db.fieldValue.findFirst({
			where: {
				fieldId: field.id,
				contact: { email: "local.only@example.test" },
			},
		});
		const value = readValue(field, row ?? undefined);
		const option = field.options.find((entry) => entry.id === value);
		expect(option?.label).toBe("disengaged");
	});

	it("keeps negative scores", async () => {
		const field = await fieldByKey("CONTACT", "score");
		const row = await db.fieldValue.findFirst({
			where: {
				fieldId: field.id,
				contact: { email: "bob.pack@example.test" },
			},
		});
		expect(readValue(field, row ?? undefined)).toBe(-3);
	});

	it("maps site status codes and rejects unknown options", async () => {
		const field = await fieldByKey("CONTACT", "site_etat");
		const rows = await db.fieldValue.findMany({
			where: {
				fieldId: field.id,
				contact: {
					email: { in: ["alice.buyer@example.test", "bob.pack@example.test"] },
				},
			},
			include: { option: true },
		});
		expect(rows.map((row) => row.option?.label).sort()).toEqual([
			"actif",
			"cesse",
		]);
		expect(initialStats.rejectedUnknownOption.site_etat).toBe(1);
		expect(initialStats.fieldValuesCleared).toBe(0);
	});

	it("syncs only selected dynamic fields", async () => {
		const contact = await db.contact.findFirstOrThrow({
			where: { email: "alice.buyer@example.test", archivedAt: null },
			select: { id: true, firstName: true },
		});
		await db.fieldValue.deleteMany({ where: { contactId: contact.id } });

		const stats = await runImportLeads({
			csvPath: fixture,
			dryRun: false,
			limit: 1,
			minScore: null,
			segments: null,
			fields: new Set(["site_etat"]),
		});
		const values = await db.fieldValue.findMany({
			where: { contactId: contact.id },
			include: { field: true, option: true },
		});
		const unchanged = await db.contact.findUniqueOrThrow({
			where: { id: contact.id },
			select: { firstName: true },
		});

		expect(values).toHaveLength(1);
		expect(values[0]?.field.key).toBe("site_etat");
		expect(values[0]?.option?.label).toBe("actif");
		expect(unchanged.firstName).toBe(contact.firstName);
		expect(stats.contactsCreated).toBe(0);
		expect(stats.contactsUpdated).toBe(0);
		expect(stats.companiesCreated).toBe(0);
		expect(stats.companiesUpdated).toBe(0);
	});

	it("rejects unknown field keys before writes", async () => {
		const before = await db.fieldValue.count();
		await expect(
			runImportLeads({
				csvPath: fixture,
				dryRun: false,
				limit: 1,
				minScore: null,
				segments: null,
				fields: new Set(["unknown_field"]),
			}),
		).rejects.toThrow("Unknown import field key(s): unknown_field.");
		expect(await db.fieldValue.count()).toBe(before);
	});

	it("is idempotent on a second run", async () => {
		const contactsBefore = await db.contact.count({
			where: { email: { endsWith: emailDomain }, archivedAt: null },
		});

		const second = await runImportLeads({
			csvPath: fixture,
			dryRun: false,
			limit: null,
			minScore: null,
			segments: null,
		});
		const contactsAfter = await db.contact.count({
			where: { email: { endsWith: emailDomain }, archivedAt: null },
		});

		expect(contactsAfter).toBe(contactsBefore);
		expect(second.contactsCreated).toBe(0);
		expect(second.contactsUpdated).toBeGreaterThan(0);
		expect(second.fieldValuesUpserted).toBe(initialStats.fieldValuesUpserted);
		expect(second.fieldValuesCleared).toBe(initialStats.fieldValuesCleared);
		expect(second.rejectedUnknownOption).toEqual(
			initialStats.rejectedUnknownOption,
		);
	});

	it("dry-run writes nothing", async () => {
		const contactsBefore = await db.contact.count({
			where: { email: { endsWith: emailDomain }, archivedAt: null },
		});
		const fieldsBefore = await db.fieldDefinition.count({
			where: { key: "score", archivedAt: null },
		});

		const stats = await runImportLeads({
			csvPath: fixture,
			dryRun: true,
			limit: 5,
			minScore: null,
			segments: null,
		});

		const contactsAfter = await db.contact.count({
			where: { email: { endsWith: emailDomain }, archivedAt: null },
		});
		const fieldsAfter = await db.fieldDefinition.count({
			where: { key: "score", archivedAt: null },
		});

		expect(stats.contactsCreated + stats.contactsUpdated).toBeGreaterThan(0);
		expect(contactsAfter).toBe(contactsBefore);
		expect(fieldsAfter).toBe(fieldsBefore);
		expect(stats.fieldValuesUpserted).toBe(0);
		expect(stats.fieldValuesCleared).toBe(0);
	});

	it("writes company fields when the domain is already cached", async () => {
		const company = await db.company.findFirstOrThrow({
			where: { domain: "acme-corp.example.test", archivedAt: null },
		});
		const field = await fieldByKey("COMPANY", "siren_site");
		const row = await db.fieldValue.findFirst({
			where: { fieldId: field.id, companyId: company.id },
		});
		expect(readValue(field, row ?? undefined)).toBe("987654321");
	});

	it("does not overwrite core contact fields on re-import", async () => {
		const contact = await db.contact.findFirstOrThrow({
			where: { email: "kate.dup@example.test", archivedAt: null },
		});
		expect(contact.lastName).toBe("Dup");
	});

	it("filters rows with --min-score", async () => {
		const stats = await runImportLeads({
			csvPath: fixture,
			dryRun: true,
			limit: null,
			minScore: 5,
			segments: null,
		});
		expect(stats.rejected.below_min_score).toBeGreaterThan(0);
		expect(stats.contactsCreated + stats.contactsUpdated).toBeLessThan(
			stats.rowsParsed,
		);
	});

	it("clears dynamic values when a CSV column is present but empty", async () => {
		const engagementField = await fieldByKey("CONTACT", "engagement");
		const clearFixture = join(
			import.meta.dir,
			"fixtures/leads-bob-clear-tags.csv",
		);
		await runImportLeads({
			csvPath: clearFixture,
			dryRun: false,
			limit: null,
			minScore: null,
			segments: null,
		});
		const row = await db.fieldValue.findFirst({
			where: {
				fieldId: engagementField.id,
				contact: { email: "bob.pack@example.test" },
			},
		});
		expect(row).toBeNull();
	});

	it("stops when an import field has the wrong type", async () => {
		const score = await fieldByKey("CONTACT", "score");
		await db.fieldDefinition.update({
			where: { id: score.id },
			data: { type: "TEXT" },
		});
		await expect(
			runImportLeads({
				csvPath: fixture,
				dryRun: false,
				limit: 1,
				minScore: null,
				segments: null,
			}),
		).rejects.toThrow(/requires NUMBER/);
		await db.fieldDefinition.update({
			where: { id: score.id },
			data: { type: "NUMBER" },
		});
	});

	it("rejects weak self-host passwords in the guard script", () => {
		const guard = join(
			import.meta.dir,
			"../../../deploy/selfhost-guard-env.sh",
		);
		const weak = spawnSync("sh", [guard], {
			env: {
				...process.env,
				POSTGRES_PASSWORD: "CHANGE_ME",
				REDIS_PASSWORD: "aaaaaaaaaaaaaaaaaaaaaaaa",
			},
		});
		expect(weak.status).not.toBe(0);
		const ok = spawnSync("sh", [guard], {
			env: {
				...process.env,
				POSTGRES_PASSWORD: "aaaaaaaaaaaaaaaaaaaaaaaa",
				REDIS_PASSWORD: "bbbbbbbbbbbbbbbbbbbbbbbb",
			},
		});
		expect(ok.status).toBe(0);
	});
});
