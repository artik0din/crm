import { describe, expect, it } from "bun:test";
import {
	DataTable,
	MAX_COLUMN_WIDTH_REM,
	MIN_COLUMN_WIDTH_REM,
	readStoredWidths,
	resizeColumnWidth,
	startColumnDrag,
} from "@crm/ui/components/data-table";
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
	setPage: async () => {},
	setTab: () => {},
	setFilter: () => {},
	toggleSort: () => {},
};

describe("DataTable sticky columns", () => {
	it("renders fixed layout with percent classes and no sticky or handles without storageKey", () => {
		const html = renderToStaticMarkup(
			<NuqsTestingAdapter>
				<DataTable
					query={mockQuery}
					columns={[
						{
							id: "name",
							header: "Name",
							width: "w-[40%]",
							cell: (row: { id: string; name: string }) => row.name,
						},
						{
							id: "role",
							header: "Role",
							width: "w-[60%]",
							cell: (row: { id: string; role: string }) => row.role,
						},
					]}
					getRowId={(row) => row.id}
					rows={[{ id: "1", name: "Alice", role: "Admin" }]}
					total={1}
				/>
			</NuqsTestingAdapter>,
		);

		expect(html).toContain("table-fixed w-full");
		expect(html).toContain("w-[40%]");
		expect(html).toContain("w-[60%]");
		expect(html).not.toContain('role="separator"');
		expect(html).not.toContain("sticky z-");
		expect(html).not.toContain("width:11rem");
	});

	it("pins the first data column to left-0 when there is no selection", () => {
		const html = renderToStaticMarkup(
			<NuqsTestingAdapter>
				<DataTable
					storageKey="test"
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

		expect(html).toContain("sm:sticky sm:z-30 bg-muted");
		expect(html).toContain("sm:max-w-[45vw]");
		expect(html).toContain("sm:sticky sm:z-10 bg-card group-hover:bg-muted/60");
		expect(html).toContain("width:16rem;min-width:16rem;max-width:16rem");
	});

	it("pins the checkbox to left-0 and the first data column to left-0 sm:left-10 when selection is enabled", () => {
		const html = renderToStaticMarkup(
			<NuqsTestingAdapter>
				<DataTable
					storageKey="test"
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
		expect(html).toContain(
			"sm:sticky sm:z-30 bg-muted sm:max-w-[45vw] left-0 sm:left-10",
		);
		expect(html).toContain(
			"sm:sticky sm:z-10 bg-card group-hover:bg-muted/60 group-data-[state=selected]:bg-muted sm:max-w-[45vw] left-0 sm:left-10",
		);
	});

	it("pins the selection column and data column on clickable rows with row accent", () => {
		const html = renderToStaticMarkup(
			<NuqsTestingAdapter>
				<DataTable
					storageKey="test"
					query={mockQuery}
					onRowClick={() => {}}
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

		expect(html).toContain("[&amp;&gt;td.sticky]:sticky");
		expect(html).toContain("[&amp;&gt;td:first-child.sticky]:sticky");
		expect(html).toContain("sticky left-0 z-10");
	});

	it("pins the first data column on clickable rows without selection", () => {
		const html = renderToStaticMarkup(
			<NuqsTestingAdapter>
				<DataTable
					storageKey="test"
					query={mockQuery}
					onRowClick={() => {}}
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
				/>
			</NuqsTestingAdapter>,
		);

		expect(html).toContain("[&amp;&gt;td.sticky]:sticky");
		expect(html).toContain("sm:sticky sm:z-10");
	});

	it("pins the name column from sm up only and caps column width at 40rem", () => {
		const html = renderToStaticMarkup(
			<NuqsTestingAdapter>
				<DataTable
					storageKey="test"
					query={mockQuery}
					columns={[
						{
							id: "name",
							header: "Name",
							width: "50rem",
							cell: (row: { id: string; name: string }) => row.name,
						},
					]}
					getRowId={(row) => row.id}
					rows={[{ id: "1", name: "Alice" }]}
					total={1}
				/>
			</NuqsTestingAdapter>,
		);

		expect(html).toContain("sm:sticky sm:z-30 bg-muted");
		expect(html).toContain("sm:max-w-[45vw]");
		expect(html).toContain("width:40rem;min-width:40rem;max-width:40rem");
		expect(html).not.toContain("width:50rem");
	});

	it("renders first render with initial default widths without storage values", () => {
		const originalStorage = globalThis.localStorage;
		const store = new Map<string, string>([
			["contacts-test", JSON.stringify({ name: 22 })],
		]);
		globalThis.localStorage = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
			removeItem: (key: string) => {
				store.delete(key);
			},
			clear: () => {
				store.clear();
			},
			length: store.size,
			key: () => null,
		};

		try {
			const html = renderToStaticMarkup(
				<NuqsTestingAdapter>
					<DataTable
						storageKey="contacts-test"
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
					/>
				</NuqsTestingAdapter>,
			);

			expect(html).toContain("width:16rem;min-width:16rem;max-width:16rem");
			expect(html).not.toContain("width:22rem");
		} finally {
			globalThis.localStorage = originalStorage;
		}
	});

	it("reads stored widths correctly in client storage", () => {
		const originalWindow = globalThis.window;
		const store = new Map<string, string>([
			[
				"contacts-test",
				JSON.stringify({ name: 22, title: 50, invalid: "NaN" }),
			],
		]);
		const mockStorage = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
			removeItem: (key: string) => {
				store.delete(key);
			},
			clear: () => {
				store.clear();
			},
			length: store.size,
			key: () => null,
		};
		const winScope = globalThis as unknown as { window: unknown };
		winScope.window = {
			localStorage: mockStorage,
		};

		try {
			const widths = readStoredWidths("contacts-test");
			expect(widths.name).toBe(22);
			expect(widths.title).toBe(MAX_COLUMN_WIDTH_REM);
			expect(widths.invalid).toBeUndefined();
		} finally {
			winScope.window = originalWindow;
		}
	});

	it("renders safely when storage throws an exception", () => {
		const originalStorage = globalThis.localStorage;
		globalThis.localStorage = {
			getItem: () => {
				throw new Error("QuotaExceededError");
			},
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
			removeItem: () => {},
			clear: () => {},
			length: 0,
			key: () => null,
		};

		try {
			const html = renderToStaticMarkup(
				<NuqsTestingAdapter>
					<DataTable
						storageKey="broken-storage"
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
					/>
				</NuqsTestingAdapter>,
			);

			expect(html).toContain("width:16rem;min-width:16rem;max-width:16rem");
		} finally {
			globalThis.localStorage = originalStorage;
		}
	});

	it("changes width with keyboard within boundaries", () => {
		expect(resizeColumnWidth(16, 1)).toBe(17);
		expect(resizeColumnWidth(16, -1)).toBe(15);
		expect(resizeColumnWidth(MIN_COLUMN_WIDTH_REM, -2)).toBe(
			MIN_COLUMN_WIDTH_REM,
		);
		expect(resizeColumnWidth(MAX_COLUMN_WIDTH_REM, 5)).toBe(
			MAX_COLUMN_WIDTH_REM,
		);
	});
});

describe("DataTable pointer drag resize", () => {
	type MockEvent = {
		clientX?: number;
		button?: number;
		isPrimary?: boolean;
		pointerId?: number;
	};
	function createMockWindow() {
		const listeners = new Map<string, Set<(e: MockEvent) => void>>();
		return {
			addEventListener: (event: string, fn: (e: MockEvent) => void) => {
				if (!listeners.has(event)) listeners.set(event, new Set());
				listeners.get(event)?.add(fn);
			},
			removeEventListener: (event: string, fn: (e: MockEvent) => void) => {
				listeners.get(event)?.delete(fn);
			},
			dispatch: (event: string, payload: MockEvent) => {
				listeners.get(event)?.forEach((fn) => {
					fn(payload);
				});
			},
			hasListener: (event: string) => (listeners.get(event)?.size ?? 0) > 0,
		};
	}

	it("captures pointer, updates width on move, and completes on pointerup", () => {
		const originalWindow = globalThis.window;
		const mockWin = createMockWindow();
		const winScope = globalThis as unknown as { window: unknown };
		winScope.window = mockWin;

		const captured = { id: null as number | null };
		const released = { id: null as number | null };
		const target = {
			setPointerCapture: (id: number) => {
				captured.id = id;
			},
			releasePointerCapture: (id: number) => {
				released.id = id;
			},
			hasPointerCapture: (id: number) => captured.id === id,
		};

		const moves: number[] = [];
		let ended = false;

		try {
			startColumnDrag({
				columnId: "name",
				startWidth: 16,
				startX: 100,
				pointerId: 1,
				target,
				onMove: (w) => moves.push(w),
				onEnd: () => {
					ended = true;
				},
			});

			expect(captured.id).toBe(1);
			expect(mockWin.hasListener("pointermove")).toBe(true);

			mockWin.dispatch("pointermove", {
				clientX: 132,
				isPrimary: true,
				pointerId: 1,
			});
			mockWin.dispatch("pointermove", {
				clientX: 148,
				isPrimary: true,
				pointerId: 1,
			});

			expect(moves).toEqual([18, 19]);
			expect(ended).toBe(false);

			mockWin.dispatch("pointermove", {
				clientX: 200,
				isPrimary: false,
				pointerId: 2,
			});
			expect(moves).toEqual([18, 19]);

			mockWin.dispatch("pointerup", {
				pointerId: 1,
				isPrimary: true,
			});

			expect(ended).toBe(true);
			expect(released.id).toBe(1);
			expect(mockWin.hasListener("pointermove")).toBe(false);
			expect(mockWin.hasListener("pointerup")).toBe(false);
		} finally {
			winScope.window = originalWindow;
		}
	});

	it("ends drag safely and cleans up listeners on pointercancel", () => {
		const originalWindow = globalThis.window;
		const mockWin = createMockWindow();
		const winScope = globalThis as unknown as { window: unknown };
		winScope.window = mockWin;

		let ended = false;
		const released = { id: null as number | null };
		const target = {
			setPointerCapture: () => {},
			releasePointerCapture: (id: number) => {
				released.id = id;
			},
			hasPointerCapture: () => true,
		};

		try {
			startColumnDrag({
				columnId: "name",
				startWidth: 16,
				startX: 100,
				pointerId: 5,
				target,
				onMove: () => {},
				onEnd: () => {
					ended = true;
				},
			});

			mockWin.dispatch("pointercancel", {
				pointerId: 5,
				isPrimary: true,
			});

			expect(ended).toBe(true);
			expect(released.id).toBe(5);
			expect(mockWin.hasListener("pointermove")).toBe(false);
		} finally {
			winScope.window = originalWindow;
		}
	});

	it("ends drag safely on lostpointercapture", () => {
		const originalWindow = globalThis.window;
		const mockWin = createMockWindow();
		const winScope = globalThis as unknown as { window: unknown };
		winScope.window = mockWin;

		let ended = false;
		const target = {
			setPointerCapture: () => {},
			releasePointerCapture: () => {},
			hasPointerCapture: () => false,
		};

		try {
			startColumnDrag({
				columnId: "name",
				startWidth: 16,
				startX: 100,
				pointerId: 7,
				target,
				onMove: () => {},
				onEnd: () => {
					ended = true;
				},
			});

			mockWin.dispatch("lostpointercapture", {
				pointerId: 7,
				isPrimary: true,
			});

			expect(ended).toBe(true);
			expect(mockWin.hasListener("pointermove")).toBe(false);
		} finally {
			winScope.window = originalWindow;
		}
	});

	it("removes event listeners on unmount cleanup", () => {
		const originalWindow = globalThis.window;
		const mockWin = createMockWindow();
		const winScope = globalThis as unknown as { window: unknown };
		winScope.window = mockWin;

		let ended = false;
		const target = {
			setPointerCapture: () => {},
			releasePointerCapture: () => {},
			hasPointerCapture: () => false,
		};

		try {
			const cleanup = startColumnDrag({
				columnId: "name",
				startWidth: 16,
				startX: 100,
				pointerId: 3,
				target,
				onMove: () => {},
				onEnd: () => {
					ended = true;
				},
			});

			expect(mockWin.hasListener("pointermove")).toBe(true);
			cleanup();
			expect(mockWin.hasListener("pointermove")).toBe(false);
			expect(ended).toBe(false);
		} finally {
			winScope.window = originalWindow;
		}
	});
});
