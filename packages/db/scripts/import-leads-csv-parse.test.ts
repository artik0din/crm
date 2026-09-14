import { describe, expect, it } from "bun:test";
import { parseLeadRow, validateHeaders } from "./import-leads-csv";
import { parseCsvRecords } from "./import-leads-csv-parse";

describe("import-leads-csv-parse", () => {
	it("parses multiline quoted fields", () => {
		const csv = 'a,b\n"line1\nline2",x\n';
		const records = parseCsvRecords(csv);
		expect(records[1][0]).toBe("line1\nline2");
		expect(records[1][1]).toBe("x");
	});

	it("parses doubled quotes inside quoted fields", () => {
		const csv = 'h\n"say ""hi""",z\n';
		const records = parseCsvRecords(csv);
		expect(records[1][0]).toBe('say "hi"');
	});

	it("strips a UTF-8 BOM from the header row", () => {
		const csv =
			"\uFEFFid,email_norm,source_file,domaine,domaine_pro,score,E-mail\n1,a@b.test,f,d,false,1,a@b.test\n";
		const records = parseCsvRecords(csv);
		expect(records[0][0]).toBe("id");
		const columns = new Set(records[0]);
		const map = new Map(records[0].map((header, index) => [header, index]));
		const parsed = parseLeadRow(records[1], map, columns);
		expect(parsed.ok).toBe(true);
	});
});

describe("import-leads-csv validation", () => {
	const headers = [
		"ID",
		"E-mail",
		"email_norm",
		"source_file",
		"domaine",
		"domaine_pro",
		"score",
	];
	const columns = new Set(headers);
	const map = new Map(headers.map((header, index) => [header, index]));

	it("rejects invalid integer scores", () => {
		const row = ["1", "a@b.test", "a@b.test", "f", "d", "false", "2.9"];
		const parsed = parseLeadRow(row, map, columns);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.reason).toBe("invalid_integer");
	});

	it("rejects invalid calendar dates", () => {
		const extended = [...headers, "Date de création"];
		const extColumns = new Set(extended);
		const extMap = new Map(extended.map((header, index) => [header, index]));
		const row = [
			"1",
			"a@b.test",
			"a@b.test",
			"f",
			"d",
			"false",
			"1",
			"2024-02-31",
		];
		const parsed = parseLeadRow(row, extMap, extColumns);
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.reason).toBe("invalid_date");
	});

	it("accepts leap-day dates", () => {
		const extended = [...headers, "siren_date_creation"];
		const extColumns = new Set(extended);
		const extMap = new Map(extended.map((header, index) => [header, index]));
		const row = [
			"1",
			"a@b.test",
			"a@b.test",
			"f",
			"d",
			"false",
			"1",
			"2024-02-29",
		];
		const parsed = parseLeadRow(row, extMap, extColumns);
		expect(parsed.ok).toBe(true);
	});

	it("requires core headers", () => {
		expect(() => validateHeaders(["ID"])).toThrow();
	});
});
