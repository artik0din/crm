export const FIELD_ENTITIES = ["COMPANY", "CONTACT", "DEAL"] as const;

export type FieldEntityName = (typeof FIELD_ENTITIES)[number];

export const FIELD_TYPES = [
	"TEXT",
	"LONG_TEXT",
	"NUMBER",
	"DATE",
	"CHECKBOX",
	"SELECT",
	"URL",
	"EMAIL",
	"PHONE",
	"USER",
] as const;

export type FieldTypeName = (typeof FIELD_TYPES)[number];

export type FieldValueColumn =
	| "text"
	| "number"
	| "date"
	| "bool"
	| "optionId"
	| "userId";

export type FieldValueWrite = Partial<Record<FieldValueColumn, unknown>>;

const COLUMNS = {
	TEXT: "text",
	LONG_TEXT: "text",
	URL: "text",
	EMAIL: "text",
	PHONE: "text",
	NUMBER: "number",
	DATE: "date",
	CHECKBOX: "bool",
	SELECT: "optionId",
	USER: "userId",
} as const satisfies Record<FieldTypeName, FieldValueColumn>;

const TYPE_LABELS = {
	TEXT: "Text",
	LONG_TEXT: "Long text",
	NUMBER: "Number",
	DATE: "Date",
	CHECKBOX: "Checkbox",
	SELECT: "Select",
	URL: "URL",
	EMAIL: "Email",
	PHONE: "Phone",
	USER: "User",
} as const satisfies Record<FieldTypeName, string>;

export function columnFor(type: FieldTypeName): FieldValueColumn {
	return COLUMNS[type];
}

export function typeLabel(type: FieldTypeName): string {
	return TYPE_LABELS[type];
}

export function usesOptions(type: FieldTypeName): boolean {
	return type === "SELECT";
}

export const RECORD_ID_COLUMNS = {
	COMPANY: "companyId",
	CONTACT: "contactId",
	DEAL: "dealId",
} as const satisfies Record<FieldEntityName, string>;

export type RecordIdColumn =
	(typeof RECORD_ID_COLUMNS)[keyof typeof RECORD_ID_COLUMNS];

export function recordColumn(entity: FieldEntityName): RecordIdColumn {
	return RECORD_ID_COLUMNS[entity];
}

export const SORTABLE_FIELD_TYPES = [
	"NUMBER",
	"TEXT",
	"LONG_TEXT",
	"URL",
	"EMAIL",
	"PHONE",
	"CHECKBOX",
] as const satisfies readonly FieldTypeName[];

export type SortableFieldType = (typeof SORTABLE_FIELD_TYPES)[number];

export const FILTERABLE_FIELD_TYPES = [
	"SELECT",
	"USER",
	"NUMBER",
	"CHECKBOX",
	"TEXT",
	"URL",
	"EMAIL",
	"PHONE",
] as const satisfies readonly FieldTypeName[];

export type FilterableFieldType = (typeof FILTERABLE_FIELD_TYPES)[number];

export const TEXT_FILTERABLE_FIELD_TYPES = [
	"TEXT",
	"URL",
	"EMAIL",
	"PHONE",
] as const satisfies readonly FieldTypeName[];

export type TextFilterableFieldType =
	(typeof TEXT_FILTERABLE_FIELD_TYPES)[number];

export type NumberBucket = {
	id: string;
	label: string;
	gte?: number;
	lt?: number;
};

export const NUMBER_BUCKETS = [
	{ id: "lt:1000", label: "< 1k", lt: 1000 },
	{ id: "1000:10000", label: "1k–10k", gte: 1000, lt: 10000 },
	{ id: "10000:50000", label: "10k–50k", gte: 10000, lt: 50000 },
	{ id: "50000:100000", label: "50k–100k", gte: 50000, lt: 100000 },
	{ id: "gte:100000", label: "100k+", gte: 100000 },
] as const;

export type NumberBucketDefinition = (typeof NUMBER_BUCKETS)[number];

export function isFilterableFieldType(
	type: FieldTypeName,
): type is FilterableFieldType {
	return (FILTERABLE_FIELD_TYPES as readonly string[]).includes(type);
}

export function isSortableFieldType(
	type: FieldTypeName,
): type is SortableFieldType {
	return (SORTABLE_FIELD_TYPES as readonly string[]).includes(type);
}

const RESERVED_KEYS = new Set([
	"id",
	"createdat",
	"updatedat",
	"fields",
	"owner",
	"ownerid",
	"new",
]);

export function fieldKeyFromLabel(label: string): string {
	const key = label
		.trim()
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.replace(/^([0-9])/, "f_$1")
		.slice(0, 60);

	return RESERVED_KEYS.has(key) ? `${key}_field` : key;
}

export class FieldValueError extends Error {
	readonly key: string;

	constructor(key: string, message: string) {
		super(message);
		this.name = "FieldValueError";
		this.key = key;
	}
}

export type FieldValueJson = string | number | boolean | null;
