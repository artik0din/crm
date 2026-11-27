import {
	FILTERABLE_FIELD_TYPES,
	NUMBER_BUCKETS,
	SORTABLE_FIELD_TYPES,
	TEXT_FILTERABLE_FIELD_TYPES,
} from "@crm/db/fields";

export const FIELDS_CONFIG = {
	backfill: {
		maxRecordsPerRun: 500,
	},
	sort: {
		types: SORTABLE_FIELD_TYPES,
	},
	filter: {
		types: FILTERABLE_FIELD_TYPES,
		textTypes: TEXT_FILTERABLE_FIELD_TYPES,
		textMaxOptions: 50,
		numberBuckets: NUMBER_BUCKETS,
	},
} as const;
