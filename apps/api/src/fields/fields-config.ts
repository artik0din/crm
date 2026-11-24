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
} as const;
