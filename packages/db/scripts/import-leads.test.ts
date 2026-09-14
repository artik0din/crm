import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { db } from "../src/client";
import { type FieldDefinitionWithOptions, readValue } from "../src/fields";
import { runImportLeads } from "./import-leads";

process.env.NODE_ENV = "test";

const fixture = join(import.meta.dir, "fixtures/leads-sample.csv");
const emailDomain = "@example.test";

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
	await runImportLeads({
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
		expect(stats.fieldValuesWritten).toBe(0);
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
});
