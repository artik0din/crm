import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { SettingsService } from "../src/settings/settings.service";

type Row = {
	contextDevApiKey: string | null;
	contextDevSkipped: boolean;
};

function service(initial?: Partial<Row>) {
	let row: Row | null = initial
		? {
				contextDevApiKey: initial.contextDevApiKey ?? null,
				contextDevSkipped: initial.contextDevSkipped ?? false,
			}
		: null;

	const db = {
		appSetting: {
			findUnique: async () => row,
			upsert: async ({
				create,
				update,
			}: {
				create: Row & { id: string };
				update: Partial<Row>;
			}) => {
				row = row
					? {
							contextDevApiKey:
								update.contextDevApiKey ?? row.contextDevApiKey,
							contextDevSkipped:
								update.contextDevSkipped ?? row.contextDevSkipped,
						}
					: {
							contextDevApiKey: create.contextDevApiKey ?? null,
							contextDevSkipped: create.contextDevSkipped ?? false,
						};

				return row;
			},
		},
	} as unknown as Db;

	return new SettingsService(
		db,
		{} as never,
		{} as never,
		{} as never,
	);
}

describe("researchKey", () => {
	it("is unset until a key is saved or the step is skipped", async () => {
		const settings = service();

		expect(await settings.researchKey()).toEqual({
			configured: false,
			skipped: false,
			hint: null,
		});
	});

	it("treats a skip as settled for the gate without a key", async () => {
		const settings = service();

		expect(await settings.skipResearchKey()).toEqual({
			configured: false,
			skipped: true,
			hint: null,
		});
	});
});
