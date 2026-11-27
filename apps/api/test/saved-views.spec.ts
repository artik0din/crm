import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { parseSavedViewFilters } from "@crm/validation/saved-view";
import type { SavedViewCreateInput } from "../src/saved-views/saved-views.contracts";
import { SavedViewsService } from "../src/saved-views/saved-views.service";

type StoredRow = {
	id: string;
	entity: "CONTACT";
	name: string;
	shared: boolean;
	filters: unknown;
	ownerId: string;
	createdAt: Date;
	updatedAt: Date;
};

describe("saved views", () => {
	it("create and list round-trips hide", async () => {
		const rows: StoredRow[] = [];

		const db = {
			savedView: {
				create: async ({
					data,
				}: {
					data: {
						entity: "CONTACT";
						name: string;
						shared: boolean;
						filters: unknown;
						ownerId: string;
					};
				}) => {
					const row: StoredRow = {
						id: "view-1",
						entity: data.entity,
						name: data.name,
						shared: data.shared,
						filters: data.filters,
						ownerId: data.ownerId,
						createdAt: new Date("2026-01-01T00:00:00Z"),
						updatedAt: new Date("2026-01-01T00:00:00Z"),
					};
					rows.push(row);
					return row;
				},
				findMany: async () => rows,
			},
		} as unknown as Db;

		const service = new SavedViewsService(db);
		const input: SavedViewCreateInput = {
			entity: "CONTACT",
			name: "Active Leads",
			shared: false,
			filters: {
				q: "acme",
				sort: "name",
				dir: "asc",
				archived: false,
				filters: {},
				hide: ["email", "phone"],
			},
		};

		const created = await service.create(input, "user-1");
		expect(created.filters.hide).toEqual(["email", "phone"]);

		const listed = await service.list("CONTACT", "user-1");
		expect(listed).toHaveLength(1);
		expect(listed[0]?.filters.hide).toEqual(["email", "phone"]);
	});

	it("still parses an old stored view without hide", async () => {
		const oldFilters = {
			q: "legacy",
			sort: "createdAt",
			dir: "desc" as const,
			archived: false,
			filters: { owner: ["user-2"] },
		};

		const parsed = parseSavedViewFilters(oldFilters);
		expect(parsed.q).toBe("legacy");
		expect(parsed.hide).toBeUndefined();

		const db = {
			savedView: {
				findMany: async () => [
					{
						id: "old-view",
						entity: "CONTACT" as const,
						name: "Legacy View",
						shared: true,
						filters: oldFilters,
						ownerId: "user-2",
						createdAt: new Date("2025-01-01T00:00:00Z"),
						updatedAt: new Date("2025-01-01T00:00:00Z"),
					},
				],
			},
		} as unknown as Db;

		const service = new SavedViewsService(db);
		const listed = await service.list("CONTACT", "user-1");
		expect(listed).toHaveLength(1);
		expect(listed[0]?.name).toBe("Legacy View");
		expect(listed[0]?.filters.hide).toBeUndefined();
	});
});
