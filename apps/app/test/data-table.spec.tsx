import { describe, expect, it } from "bun:test";
import { DataTable } from "@crm/ui/components/data-table";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { renderToStaticMarkup } from "react-dom/server";

const mockQuery = {
	page: 1,
	pageSize: 25,
	sort: "",
	dir: "asc" as const,
	tab: "all",
	filters: {},
	setSort: () => {},
	setDir: () => {},
	setPage: () => {},
	setTab: () => {},
	setFilter: () => {},
	toggleSort: () => {},
};

describe("DataTable sticky columns", () => {
	it("pins the first data column to left-0 when there is no selection", () => {
		const html = renderToStaticMarkup(
			<NuqsTestingAdapter>
				<DataTable
					query={mockQuery}
					columns={[
						{
							id: "name",
							header: "Name",
							width: "16rem",
							cell: (row: { id: string; name: string }) => row.name,
						},
						{
							id: "title",
							header: "Title",
							cell: (row: { id: string; title: string }) => row.title,
						},
					]}
					getRowId={(row) => row.id}
					rows={[{ id: "1", name: "Alice", title: "Engineer" }]}
					total={1}
				/>
			</NuqsTestingAdapter>,
		);

		expect(html).toContain("sticky z-30 bg-muted left-0");
		expect(html).toContain("sticky z-10 bg-card group-hover:bg-muted/60");
		expect(html).toContain("width:16rem;min-width:16rem;max-width:16rem");
	});

	it("pins the checkbox to left-0 and the first data column to left-0 sm:left-10 when selection is enabled", () => {
		const html = renderToStaticMarkup(
			<NuqsTestingAdapter>
				<DataTable
					query={mockQuery}
					columns={[
						{
							id: "name",
							header: "Name",
							width: "16rem",
							cell: (row: { id: string; name: string }) => row.name,
						},
					]}
					getRowId={(row) => row.id}
					rows={[{ id: "1", name: "Alice" }]}
					total={1}
					selection={{
						state: {
							allSelected: false,
							someSelected: false,
							count: 0,
							has: () => false,
							toggle: () => {},
							toggleAll: () => {},
							clear: () => {},
							ids: [],
						},
						actions: null,
					}}
				/>
			</NuqsTestingAdapter>,
		);

		expect(html).toContain("sticky left-0 z-30 bg-muted h-11 w-10");
		expect(html).toContain("sticky z-30 bg-muted left-0 sm:left-10");
		expect(html).toContain(
			"sticky z-10 bg-card group-hover:bg-muted/60 group-data-[state=selected]:bg-muted left-0 sm:left-10",
		);
	});
});
