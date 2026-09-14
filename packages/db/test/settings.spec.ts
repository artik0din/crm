import { describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import {
	readContextDevKey,
	readContextDevSkipped,
	skipContextDev,
	writeContextDevKey,
} from "../src/settings";

type Row = {
	contextDevApiKey: string | null;
	contextDevSkipped: boolean;
};

function fakeDb(initial?: Partial<Row>) {
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
							contextDevApiKey: update.contextDevApiKey ?? row.contextDevApiKey,
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

	return { db, current: () => row };
}

describe("readContextDevSkipped", () => {
	it("is false when nobody has answered", async () => {
		const { db } = fakeDb();

		expect(await readContextDevSkipped(db)).toBe(false);
	});

	it("is true after the step is skipped", async () => {
		const { db } = fakeDb({ contextDevSkipped: true });

		expect(await readContextDevSkipped(db)).toBe(true);
	});
});

describe("skipContextDev", () => {
	it("records the skip on a missing row", async () => {
		const { db } = fakeDb();

		await skipContextDev(db);

		expect(await readContextDevSkipped(db)).toBe(true);
		expect(await readContextDevKey(db)).toBeNull();
	});
});

describe("writeContextDevKey", () => {
	it("clears a skip when a key is saved later", async () => {
		const { db } = fakeDb({ contextDevSkipped: true });

		await writeContextDevKey(db, " ctx_live_abcdefgh ");

		expect(await readContextDevKey(db)).toBe("ctx_live_abcdefgh");
		expect(await readContextDevSkipped(db)).toBe(false);
	});
});
