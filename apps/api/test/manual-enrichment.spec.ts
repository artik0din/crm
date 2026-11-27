import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import type { Cache } from "cache-manager";
import { AGENT_DISPATCH } from "../src/agent/agent-dispatch.config";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { ImageMirrorService } from "../src/backfill/image-mirror.service";
import { CompaniesService } from "../src/companies/companies.service";
import { FaviconService } from "../src/companies/favicon.service";
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
	const [contacts, companies] = await Promise.all([
		db.contact.findMany({
			where: { email: contactEmail },
			select: { id: true },
		}),
		db.company.findMany({
			where: { name: companyName },
			select: { id: true },
		}),
	]);
	const cIds = contacts.map((c) => c.id);
	const compIds = companies.map((c) => c.id);
	if (cIds.length > 0) {
		await db.agentTask.deleteMany({ where: { contactId: { in: cIds } } });
		await db.contact.deleteMany({ where: { id: { in: cIds } } });
	}
	if (compIds.length > 0) {
		await db.agentTask.deleteMany({ where: { companyId: { in: compIds } } });
		await db.company.deleteMany({ where: { id: { in: compIds } } });
	}
}

beforeAll(async () => {
	await clean();

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

	it("runs image mirroring and favicon sweeps during auto backfill when automatic enrichment is disabled", async () => {
		let imagesSwept = false;
		let agentCalled = false;
		const mockImages = {
			sweep: async () => {
				imagesSwept = true;
				return { scanned: 0, copied: 0, failed: 0 };
			},
		} as unknown as ImageMirrorService;
		const mockAgent = {
			sweepWorkspace: async () => {
				agentCalled = true;
			},
			backfill: async () => {
				agentCalled = true;
				return { queued: 0, alreadyQueued: 0 };
			},
		} as unknown as AgentTriggerService;
		const mockCache = {
			get: async () => null,
			set: async () => {},
		} as unknown as Cache;
		const mockFavicon = {} as unknown as FaviconService;

		const backfill = new BackfillService(
			db,
			mockAgent,
			mockFavicon,
			mockImages,
			mockCache,
		);

		const result = await backfill.auto();
		expect(result).toEqual({ started: true });
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(imagesSwept).toBe(true);
		expect(agentCalled).toBe(false);
	});

	it("does not enqueue workspace-profile on background workspaceChanged when automatic enrichment is disabled", async () => {
		await trigger.workspaceChanged("example.test", "Background recheck");

		const tasks = await db.agentTask.findMany({
			where: {
				kind: "workspace-profile",
				reason: { contains: "example.test" },
			},
		});

		expect(tasks).toHaveLength(0);
	});

	it("enqueues workspace-profile as a requested task on workspaceRequested", async () => {
		try {
			await trigger.workspaceRequested(
				"onboarding.test",
				"Onboarding website entered",
			);

			const tasks = await db.agentTask.findMany({
				where: {
					kind: "workspace-profile",
					reason: { contains: "onboarding.test" },
				},
			});

			expect(tasks).toHaveLength(1);
			expect(tasks[0]?.priority).toBe(PRIORITY.requested);
		} finally {
			await db.agentTask.deleteMany({
				where: {
					kind: "workspace-profile",
					reason: { contains: "onboarding.test" },
				},
			});
		}
	});
});
