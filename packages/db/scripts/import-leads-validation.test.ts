import { describe, expect, it } from "bun:test";
import {
	parseCalendarDate,
	parseStrictSignedInteger,
} from "./import-leads-validation";

describe("import-leads-validation", () => {
	it("parses strict signed integers", () => {
		expect(parseStrictSignedInteger("-3")).toEqual({ ok: true, value: -3 });
		expect(parseStrictSignedInteger("2abc").ok).toBe(false);
		expect(parseStrictSignedInteger("").ok).toBe(false);
	});

	it("validates calendar dates", () => {
		expect(parseCalendarDate("2024-02-31").ok).toBe(false);
		expect(parseCalendarDate("2024-02-29")).toEqual({
			ok: true,
			value: "2024-02-29",
		});
	});
});
