import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { AGENT_DISPATCH } from "../src/agent/agent-dispatch.config";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";
import { ContactsService } from "../src/contacts/contacts.service";

const suffix = process.env.TEST_RUN_ID ?? "manual-enrichment-spec";
const contactEmail = `enrich-${suffix}@example.test`;
const companyName = `Manual Enrich Co ${suffix}`;

const trigger = new AgentTriggerService(db);
const contactsService = new ContactsService(
	db,
	{} as never,
	trigger,
	{} as never,
	{} as never,
	{} as never,
);
const companiesService = new CompaniesService(
	db,
	trigger,
	{} as never,
	{} as never,
	{} as never,
	{} as never,
	{} as never,
);

let contactId: string;
let companyId: string;

async function clean() {
	if (contactId) {
		await db.agentTask.deleteMany({ where: { contactId } });
		await db.contact.deleteMany({ where: { id: contactId } });
	}
	if (companyId) {
		await db.agentTask.deleteMany({ where: { companyId } });
		await db.company.deleteMany({ where: { id: companyId } });
	}
}

beforeAll(async () => {
	const contact = await db.contact.create({
		data: {
			firstName: "Enrich",
			lastName: "Manual",
			email: contactEmail,
		},
		select: { id: true },
	});
	contactId = contact.id;

	const company = await db.company.create({
		data: { name: companyName },
		select: { id: true },
	});
	companyId = company.id;
});

afterAll(clean);

describe("manual-only enrichment", () => {
	it("verifies AGENT_DISPATCH.automaticEnrichment is disabled", () => {
		expect(AGENT_DISPATCH.automaticEnrichment).toBe(false);
	});

	it("does not enqueue tasks when a contact is created or imported", async () => {
		await trigger.contactCreated(contactId, "Imported from CSV");

		const tasks = await db.agentTask.findMany({
			where: { contactId },
		});

		expect(tasks).toHaveLength(0);
	});

	it("does not enqueue tasks when a company is created or imported", async () => {
		await trigger.companyCreated(companyId, "Imported from CSV");

		const tasks = await db.agentTask.findMany({
			where: { companyId },
		});

		expect(tasks).toHaveLength(0);
	});

	it("enqueues an identify task when manual enrich is requested on a contact", async () => {
		const result = await contactsService.enrich(contactId);

		expect(result).toEqual({ id: contactId, queued: true });

		const tasks = await db.agentTask.findMany({
			where: { contactId, kind: "identify" },
		});

		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.priority).toBe(PRIORITY.requested);
	});

	it("enqueues company-profile when manual enrich is requested on a company", async () => {
		const result = await companiesService.enrich(companyId);

		expect(result).toEqual({ id: companyId, queued: true });

		const tasks = await db.agentTask.findMany({
			where: { companyId, kind: "company-profile" },
		});

		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.priority).toBe(PRIORITY.requested);
	});
});
