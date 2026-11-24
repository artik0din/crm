export const FIELDS_CONFIG = {
	backfill: {
		maxRecordsPerRun: 500,
	},
	sort: {
		types: [
			"NUMBER",
			"TEXT",
			"LONG_TEXT",
			"URL",
			"EMAIL",
			"PHONE",
			"CHECKBOX",
		] as const,
	},
	filter: {
		types: [
			"SELECT",
			"USER",
			"NUMBER",
			"CHECKBOX",
			"TEXT",
			"URL",
			"EMAIL",
			"PHONE",
		] as const,
		textTypes: ["TEXT", "URL", "EMAIL", "PHONE"] as const,
		textMaxOptions: 50,
		numberBuckets: [
			{ id: "lt:1000", label: "< 1k", lt: 1000 },
			{ id: "1000:10000", label: "1k–10k", gte: 1000, lt: 10000 },
			{ id: "10000:50000", label: "10k–50k", gte: 10000, lt: 50000 },
			{ id: "50000:100000", label: "50k–100k", gte: 50000, lt: 100000 },
			{ id: "gte:100000", label: "100k+", gte: 100000 },
		] as const,
	},
} as const;
