import { describe, expect, it } from "bun:test";
import { DISPATCH } from "../agent/lib/dispatch-config";
import scheduleRecheckTool from "../agent/tools/schedule_recheck";

describe("schedule_recheck tool", () => {
	it("verifies DISPATCH.automaticEnrichment is disabled", () => {
		expect(DISPATCH.automaticEnrichment).toBe(false);
	});

	it("returns scheduled: false when automatic enrichment is disabled", async () => {
		const ctx = {
			session: {
				auth: {
					initiator: {
						attributes: {
							purpose: "research",
							taskId: "test-task-123",
						},
					},
				},
			},
		} as never;

		const result = await scheduleRecheckTool.execute(
			{
				contactId: "test-contact-123",
				days: 30,
				reason: "a job change here would move the Acme deal",
				budget: 4,
			},
			ctx,
		);

		expect(result).toEqual({
			scheduled: false,
			reason: "Automatic enrichment is disabled.",
		});
	});
});
