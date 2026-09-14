import type { Db } from "../src/client";
import { type FieldDefinitionWithOptions, writeValues } from "../src/fields";
import { FieldEntity, FieldType } from "../src/generated/prisma/enums";
import {
	type ImportFieldValueMap,
	SEGMENT_OPTIONS,
} from "./import-leads-mappings";

type SelectFieldSpec = {
	key: string;
	label: string;
	options: readonly string[];
	showOnTable: boolean;
	showOnFilter: boolean;
};

type ScalarFieldSpec = {
	key: string;
	label: string;
	type: FieldType;
	showOnTable: boolean;
	showOnFilter: boolean;
};

const CONTACT_SELECTS: SelectFieldSpec[] = [
	{
		key: "segment",
		label: "Segment",
		options: SEGMENT_OPTIONS,
		showOnTable: true,
		showOnFilter: true,
	},
	{
		key: "engagement",
		label: "Engagement",
		options: ["engaged", "disengaged", "neutre"],
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "dirigeant",
		label: "Dirigeant",
		options: ["haute", "moyenne", "ambigu", "aucun"],
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "siren_etat",
		label: "État SIREN",
		options: ["actif", "cesse"],
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "tel_type",
		label: "Type téléphone",
		options: ["mobile", "fixe", "autre"],
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "site_techno",
		label: "Techno site",
		options: [],
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "site_etat",
		label: "État site",
		options: ["actif", "cesse"],
		showOnTable: false,
		showOnFilter: false,
	},
];

const CONTACT_SCALARS: ScalarFieldSpec[] = [
	{
		key: "score",
		label: "Score",
		type: FieldType.NUMBER,
		showOnTable: true,
		showOnFilter: true,
	},
	{
		key: "siren",
		label: "SIREN",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "siren_naf",
		label: "Code NAF",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "siren_date_creation",
		label: "Date création SIREN",
		type: FieldType.DATE,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "siren_siege_dept",
		label: "Département siège",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "siren_siege_commune",
		label: "Commune siège",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "inscrit_le",
		label: "Inscrit le",
		type: FieldType.DATE,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "id_source",
		label: "ID source",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "site_denomination",
		label: "Dénomination site",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "site_categorie_juridique",
		label: "Catégorie juridique site",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "site_naf",
		label: "NAF site",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "site_tranche_effectif",
		label: "Tranche effectif site",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
	{
		key: "site_siege_dept",
		label: "Département siège site",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
];

const COMPANY_SELECTS: SelectFieldSpec[] = [
	{
		key: "site_techno",
		label: "Techno site",
		options: [],
		showOnTable: false,
		showOnFilter: false,
	},
];

const COMPANY_SCALARS: ScalarFieldSpec[] = [
	{
		key: "siren_site",
		label: "SIREN site",
		type: FieldType.TEXT,
		showOnTable: false,
		showOnFilter: false,
	},
];

export const IMPORT_FIELD_KEYS = [
	...new Set(
		[
			...CONTACT_SELECTS,
			...CONTACT_SCALARS,
			...COMPANY_SELECTS,
			...COMPANY_SCALARS,
		].map((spec) => spec.key),
	),
] as const;

export type ImportFieldSets = {
	contact: FieldDefinitionWithOptions[];
	company: FieldDefinitionWithOptions[];
};

export type FieldValueWriteStats = {
	upserted: number;
	cleared: number;
	rejectedUnknownOption: Record<string, number>;
};

export function unknownSelectOptions(
	entity: FieldEntity,
	values: ImportFieldValueMap,
): Record<string, number> {
	const specs =
		entity === FieldEntity.CONTACT ? CONTACT_SELECTS : COMPANY_SELECTS;
	const byKey = new Map(specs.map((spec) => [spec.key, spec]));
	const rejected: Record<string, number> = {};

	for (const [key, value] of Object.entries(values)) {
		const spec = byKey.get(key);
		if (!spec || spec.options.length === 0 || value === null || value === "") {
			continue;
		}
		if (
			!spec.options.some(
				(option) => option.toLowerCase() === String(value).toLowerCase(),
			)
		) {
			rejected[key] = (rejected[key] ?? 0) + 1;
		}
	}

	return rejected;
}

async function nextPosition(db: Db, entity: FieldEntity): Promise<number> {
	const row = await db.fieldDefinition.findFirst({
		where: { entity, archivedAt: null },
		orderBy: { position: "desc" },
		select: { position: true },
	});
	return (row?.position ?? -1) + 1;
}

async function assertFieldType(
	db: Db,
	entity: FieldEntity,
	key: string,
	expected: FieldType,
): Promise<void> {
	const existing = await db.fieldDefinition.findUnique({
		where: { entity_key: { entity, key } },
		select: { type: true, archivedAt: true },
	});
	if (!existing) return;
	if (existing.type !== expected) {
		throw new Error(
			`Field "${key}" on ${entity} has type ${existing.type}; import requires ${expected}.`,
		);
	}
}

async function ensureSelectField(
	db: Db,
	entity: FieldEntity,
	spec: SelectFieldSpec,
	position: number,
	extraOptions: string[],
): Promise<FieldDefinitionWithOptions> {
	await assertFieldType(db, entity, spec.key, FieldType.SELECT);

	const optionLabels = [
		...new Set([...spec.options, ...extraOptions].filter(Boolean)),
	].sort((left, right) => left.localeCompare(right));

	const definition = await db.fieldDefinition.upsert({
		where: { entity_key: { entity, key: spec.key } },
		create: {
			entity,
			key: spec.key,
			label: spec.label,
			type: FieldType.SELECT,
			agentFilled: false,
			showOnTable: spec.showOnTable,
			showOnFilter: spec.showOnFilter,
			position,
			options: {
				create: optionLabels.map((label, index) => ({
					label,
					position: index,
				})),
			},
		},
		update: {
			agentFilled: false,
			showOnTable: spec.showOnTable,
			showOnFilter: spec.showOnFilter,
			archivedAt: null,
		},
		include: { options: true },
	});

	const existing = new Set(
		definition.options
			.filter((option) => option.archivedAt === null)
			.map((option) => option.label),
	);
	const missing = optionLabels.filter((label) => !existing.has(label));
	if (missing.length > 0) {
		const start = definition.options.length;
		await db.fieldOption.createMany({
			data: missing.map((label, index) => ({
				fieldId: definition.id,
				label,
				position: start + index,
			})),
			skipDuplicates: true,
		});
	}

	return db.fieldDefinition.findUniqueOrThrow({
		where: { id: definition.id },
		include: { options: true },
	});
}

async function ensureScalarField(
	db: Db,
	entity: FieldEntity,
	spec: ScalarFieldSpec,
	position: number,
): Promise<FieldDefinitionWithOptions> {
	await assertFieldType(db, entity, spec.key, spec.type);

	return db.fieldDefinition.upsert({
		where: { entity_key: { entity, key: spec.key } },
		create: {
			entity,
			key: spec.key,
			label: spec.label,
			type: spec.type,
			agentFilled: false,
			showOnTable: spec.showOnTable,
			showOnFilter: spec.showOnFilter,
			position,
		},
		update: {
			agentFilled: false,
			showOnTable: spec.showOnTable,
			showOnFilter: spec.showOnFilter,
			archivedAt: null,
		},
		include: { options: true },
	});
}

export async function ensureImportFields(
	db: Db,
	siteTechnoValues: string[],
	selectedKeys: ReadonlySet<string> | null = null,
): Promise<ImportFieldSets> {
	const techno = [...new Set(siteTechnoValues.filter(Boolean))];

	let contactPosition = await nextPosition(db, FieldEntity.CONTACT);
	const contact: FieldDefinitionWithOptions[] = [];

	for (const spec of CONTACT_SELECTS) {
		if (selectedKeys && !selectedKeys.has(spec.key)) continue;
		const extra = spec.key === "site_techno" ? techno : [];
		contact.push(
			await ensureSelectField(
				db,
				FieldEntity.CONTACT,
				spec,
				contactPosition,
				extra,
			),
		);
		contactPosition++;
	}

	for (const spec of CONTACT_SCALARS) {
		if (selectedKeys && !selectedKeys.has(spec.key)) continue;
		contact.push(
			await ensureScalarField(db, FieldEntity.CONTACT, spec, contactPosition),
		);
		contactPosition++;
	}

	let companyPosition = await nextPosition(db, FieldEntity.COMPANY);
	const company: FieldDefinitionWithOptions[] = [];

	for (const spec of COMPANY_SELECTS) {
		if (selectedKeys && !selectedKeys.has(spec.key)) continue;
		company.push(
			await ensureSelectField(
				db,
				FieldEntity.COMPANY,
				spec,
				companyPosition,
				spec.key === "site_techno" ? techno : [],
			),
		);
		companyPosition++;
	}

	for (const spec of COMPANY_SCALARS) {
		if (selectedKeys && !selectedKeys.has(spec.key)) continue;
		company.push(
			await ensureScalarField(db, FieldEntity.COMPANY, spec, companyPosition),
		);
		companyPosition++;
	}

	return { contact, company };
}

export async function writeContactValues(
	db: Db,
	definitions: FieldDefinitionWithOptions[],
	contactId: string,
	values: ImportFieldValueMap,
): Promise<FieldValueWriteStats> {
	return writeImportValues(
		db,
		FieldEntity.CONTACT,
		contactId,
		definitions,
		values,
	);
}

export async function writeCompanyValues(
	db: Db,
	definitions: FieldDefinitionWithOptions[],
	companyId: string,
	values: ImportFieldValueMap,
): Promise<FieldValueWriteStats> {
	return writeImportValues(
		db,
		FieldEntity.COMPANY,
		companyId,
		definitions,
		values,
	);
}

async function writeImportValues(
	db: Db,
	entity: FieldEntity,
	recordId: string,
	definitions: FieldDefinitionWithOptions[],
	values: ImportFieldValueMap,
): Promise<FieldValueWriteStats> {
	const stats: FieldValueWriteStats = {
		upserted: 0,
		cleared: 0,
		rejectedUnknownOption: {},
	};
	const byKey = new Map(
		definitions.map((definition) => [definition.key, definition]),
	);
	const recordKey = entity === FieldEntity.CONTACT ? "contactId" : "companyId";

	for (const [key, value] of Object.entries(values)) {
		const definition = byKey.get(key);
		if (!definition) {
			throw new Error(`There is no import field called "${key}" on ${entity}.`);
		}

		if (value === null || value === "") {
			const deleted = await db.fieldValue.deleteMany({
				where: { fieldId: definition.id, [recordKey]: recordId },
			});
			stats.cleared += deleted.count;
			continue;
		}

		if (
			definition.type === FieldType.SELECT &&
			!definition.options.some(
				(option) =>
					option.archivedAt === null &&
					(option.id === value ||
						option.label.toLowerCase() === String(value).toLowerCase()),
			)
		) {
			stats.rejectedUnknownOption[key] =
				(stats.rejectedUnknownOption[key] ?? 0) + 1;
			continue;
		}

		await writeValues(db, entity, recordId, definitions, { [key]: value });
		stats.upserted++;
	}

	return stats;
}
