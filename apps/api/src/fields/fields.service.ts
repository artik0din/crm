import {
	type Db,
	type FieldEntity,
	type Prisma,
	Prisma as PrismaNamespace,
} from "@crm/db";
import {
	attachValues,
	type FieldDefinitionWithOptions,
	FieldValueError,
	type FieldValueJson,
	fieldKeyFromLabel,
	type RecordField,
	readValue,
	recordColumn,
	type SerializedField,
	serializeField,
	usesOptions,
	writeValues,
} from "@crm/db/fields";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	FieldCreateInput,
	FieldReorderInput,
	FieldUpdateData,
} from "./fields.contracts";
import { FIELDS_CONFIG } from "./fields-config";

const WITH_OPTIONS = {
	options: { orderBy: { position: "asc" } },
} as const satisfies Prisma.FieldDefinitionInclude;

const RELATIONS = {
	COMPANY: "company",
	CONTACT: "contact",
	DEAL: "deal",
} as const satisfies Record<FieldEntity, string>;

@Injectable()
export class FieldsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async list(
		entity: FieldEntity,
		includeArchived: boolean,
	): Promise<SerializedField[]> {
		const definitions = await this.db.fieldDefinition.findMany({
			where: { entity, archivedAt: includeArchived ? undefined : null },
			include: WITH_OPTIONS,
			orderBy: { position: "asc" },
		});

		return definitions.map(serializeField);
	}

	async byKey(entity: FieldEntity, key: string): Promise<SerializedField> {
		const definition = await this.db.fieldDefinition.findUnique({
			where: { entity_key: { entity, key } },
			include: WITH_OPTIONS,
		});

		if (!definition) throw new NotFoundException("That field does not exist.");

		return serializeField(definition);
	}

	async create(input: FieldCreateInput): Promise<SerializedField> {
		const key = fieldKeyFromLabel(input.label);

		if (!key) {
			throw new BadRequestException("That label does not make a usable key.");
		}

		const taken = await this.db.fieldDefinition.findUnique({
			where: { entity_key: { entity: input.entity, key } },
			select: { id: true },
		});

		if (taken) {
			throw new ConflictException(`There is already a field called "${key}".`);
		}

		if (usesOptions(input.type) && input.options.length === 0) {
			throw new BadRequestException("A select needs at least one option.");
		}

		const last = await this.db.fieldDefinition.findFirst({
			where: { entity: input.entity },
			orderBy: { position: "desc" },
			select: { position: true },
		});

		const definition = await this.db.fieldDefinition.create({
			data: {
				entity: input.entity,
				key,
				label: input.label,
				type: input.type,
				agentFilled: input.agentFilled,
				agentBrief: input.agentBrief,
				required: input.required,
				showOnSheet: input.showOnSheet,
				showOnTable: input.showOnTable,
				showOnFilter: input.showOnFilter,
				position: (last?.position ?? -1) + 1,
				options: usesOptions(input.type)
					? {
							create: input.options.map((option, index) => ({
								label: option.label,
								position: index,
							})),
						}
					: undefined,
			},
			include: WITH_OPTIONS,
		});

		if (definition.agentFilled) {
			const ids = await this.missingRecordIds(
				definition.entity,
				definition.id,
				FIELDS_CONFIG.backfill.maxRecordsPerRun,
			);
			await this.agent.fieldBackfillRecords(
				definition.entity,
				[definition.key],
				ids,
				`New field: ${definition.label}`,
			);
		}

		return serializeField(definition);
	}

	async update(id: string, data: FieldUpdateData): Promise<SerializedField> {
		const existing = await this.db.fieldDefinition.findUnique({
			where: { id },
			include: WITH_OPTIONS,
		});

		if (!existing) throw new NotFoundException("That field does not exist.");

		const type = data.type ?? existing.type;

		if (data.type && data.type !== existing.type) {
			const values = await this.db.fieldValue.count({
				where: { fieldId: id },
			});

			if (values > 0) {
				throw new ConflictException(
					"This field already holds values, so its type cannot change. Archive it and make a new one.",
				);
			}
		}

		const optionCount = data.options
			? data.options.length
			: existing.options.filter((option) => option.archivedAt === null).length;

		if (usesOptions(type) && optionCount === 0) {
			throw new BadRequestException("A select needs at least one option.");
		}

		const definition = await this.db.$transaction(async (tx) => {
			if (data.options && usesOptions(type)) {
				const keep = new Set(
					data.options
						.map((option) => option.id)
						.filter((value): value is string => Boolean(value)),
				);

				await tx.fieldOption.updateMany({
					where: { fieldId: id, id: { notIn: [...keep] }, archivedAt: null },
					data: { archivedAt: new Date() },
				});

				for (const [index, option] of data.options.entries()) {
					if (option.id) {
						await tx.fieldOption.update({
							where: { id: option.id },
							data: { label: option.label, position: index },
						});
						continue;
					}

					await tx.fieldOption.create({
						data: { fieldId: id, label: option.label, position: index },
					});
				}
			}

			return tx.fieldDefinition.update({
				where: { id },
				data: {
					label: data.label,
					type: data.type,
					agentFilled: data.agentFilled,
					agentBrief: data.agentBrief,
					required: data.required,
					showOnSheet: data.showOnSheet,
					showOnTable: data.showOnTable,
					showOnFilter: data.showOnFilter,
				},
				include: WITH_OPTIONS,
			});
		});

		const briefChanged =
			data.agentBrief !== undefined && data.agentBrief !== existing.agentBrief;
		const turnedOn = data.agentFilled === true && !existing.agentFilled;

		if (definition.agentFilled && (briefChanged || turnedOn)) {
			const ids = await this.missingRecordIds(
				definition.entity,
				definition.id,
				FIELDS_CONFIG.backfill.maxRecordsPerRun,
			);
			await this.agent.fieldBackfillRecords(
				definition.entity,
				[definition.key],
				ids,
				briefChanged
					? `Brief changed: ${definition.label}`
					: `Turned on: ${definition.label}`,
			);
		}

		return serializeField(definition);
	}

	async reorder(input: FieldReorderInput): Promise<SerializedField[]> {
		const owned = await this.db.fieldDefinition.findMany({
			where: { id: { in: input.ids }, entity: input.entity },
			select: { id: true },
		});

		if (owned.length !== input.ids.length) {
			throw new BadRequestException(
				"That order names a field which is not on this record type.",
			);
		}

		await this.db.$transaction(
			input.ids.map((id, index) =>
				this.db.fieldDefinition.update({
					where: { id },
					data: { position: index },
				}),
			),
		);

		return this.list(input.entity, false);
	}

	async archive(id: string): Promise<SerializedField> {
		try {
			const definition = await this.db.fieldDefinition.update({
				where: { id },
				data: { archivedAt: new Date() },
				include: WITH_OPTIONS,
			});

			return serializeField(definition);
		} catch (error) {
			throw this.translate(error);
		}
	}

	async restore(id: string): Promise<SerializedField> {
		try {
			const definition = await this.db.fieldDefinition.update({
				where: { id },
				data: { archivedAt: null },
				include: WITH_OPTIONS,
			});

			return serializeField(definition);
		} catch (error) {
			throw this.translate(error);
		}
	}

	async delete(id: string): Promise<{ id: string }> {
		try {
			await this.db.fieldDefinition.delete({ where: { id } });
		} catch (error) {
			throw this.translate(error);
		}

		return { id };
	}

	async backfill(id: string): Promise<{ queued: boolean }> {
		const definition = await this.db.fieldDefinition.findUnique({
			where: { id },
			select: {
				entity: true,
				key: true,
				label: true,
				agentFilled: true,
				archivedAt: true,
			},
		});

		if (!definition) throw new NotFoundException("That field does not exist.");

		if (!definition.agentFilled || definition.archivedAt !== null) {
			throw new BadRequestException(
				"Your agents do not fill this field, so there is nothing to run.",
			);
		}

		const ids = await this.missingRecordIds(
			definition.entity,
			id,
			FIELDS_CONFIG.backfill.maxRecordsPerRun,
		);
		const result = await this.agent.fieldBackfillRecords(
			definition.entity,
			[definition.key],
			ids,
			"Asked to fill the rest",
		);

		return { queued: result.queued > 0 || result.merged > 0 };
	}

	/** Every agent-filled field is inherently blank on a record that was just created. */
	async queueBackfillForNewRecord(
		entity: FieldEntity,
		recordId: string,
	): Promise<void> {
		const definitions = await this.db.fieldDefinition.findMany({
			where: { entity, archivedAt: null, agentFilled: true },
			select: { key: true },
		});

		if (definitions.length === 0) return;

		await this.agent.fieldBackfillRecords(
			entity,
			definitions.map((definition) => definition.key),
			[recordId],
			"New record",
		);
	}

	private async missingRecordIds(
		entity: FieldEntity,
		fieldId: string,
		cap: number,
	): Promise<string[]> {
		const where = { fieldValues: { none: { fieldId } } };

		const rows =
			entity === "COMPANY"
				? await this.db.company.findMany({
						where,
						select: { id: true },
						take: cap,
					})
				: entity === "CONTACT"
					? await this.db.contact.findMany({
							where,
							select: { id: true },
							take: cap,
						})
					: await this.db.deal.findMany({
							where,
							select: { id: true },
							take: cap,
						});

		return rows.map((row) => row.id);
	}

	async coverage(id: string): Promise<{ filled: number; total: number }> {
		const definition = await this.db.fieldDefinition.findUnique({
			where: { id },
			select: { entity: true },
		});

		if (!definition) throw new NotFoundException("That field does not exist.");

		const column = recordColumn(definition.entity);

		const [filled, total] = await Promise.all([
			this.db.fieldValue.count({
				where: { fieldId: id, [column]: { not: null } },
			}),
			definition.entity === "COMPANY"
				? this.db.company.count()
				: definition.entity === "CONTACT"
					? this.db.contact.count()
					: this.db.deal.count(),
		]);

		return { filled, total };
	}

	async sortableFieldFor(
		entity: FieldEntity,
		sort: string,
	): Promise<FieldDefinitionWithOptions | null> {
		if (!sort.startsWith("field:")) return null;
		const key = sort.slice("field:".length);
		return this.db.fieldDefinition.findFirst({
			where: {
				entity,
				key,
				archivedAt: null,
				showOnTable: true,
				type: { in: [...FIELDS_CONFIG.sort.types] },
			},
			include: WITH_OPTIONS,
		});
	}

	async orderedRecordIds(
		entity: FieldEntity,
		where:
			| Prisma.CompanyWhereInput
			| Prisma.ContactWhereInput
			| Prisma.DealWhereInput,
		field: FieldDefinitionWithOptions,
		dir: "asc" | "desc",
		skip: number,
		take: number,
	): Promise<string[]> {
		const column =
			field.type === "NUMBER"
				? "number"
				: field.type === "CHECKBOX"
					? "bool"
					: "text";
		const recordIdColumn = recordColumn(entity);
		const relation = RELATIONS[entity];

		const filledWhere = {
			fieldId: field.id,
			[column]: { not: null },
			[relation]: where,
		} as Prisma.FieldValueWhereInput;

		const filledCount = await this.db.fieldValue.count({
			where: filledWhere,
		});

		const ids: string[] = [];

		if (skip < filledCount) {
			const filledTake = Math.min(take, filledCount - skip);
			const filledRows = await this.db.fieldValue.findMany({
				where: filledWhere,
				orderBy: [{ [column]: dir }, { id: "asc" }],
				skip,
				take: filledTake,
				select: { [recordIdColumn]: true },
			});

			for (const row of filledRows) {
				const id = (row as Record<string, unknown>)[recordIdColumn];
				if (typeof id === "string") ids.push(id);
			}
		}

		const remainingTake = take - ids.length;
		if (remainingTake > 0) {
			const secondSkip = Math.max(0, skip - filledCount);
			const unvaluedWhere = {
				AND: [
					where,
					{
						fieldValues: {
							none: {
								fieldId: field.id,
								[column]: { not: null },
							},
						},
					},
				],
			};

			const unvaluedRows =
				entity === "COMPANY"
					? await this.db.company.findMany({
							where: unvaluedWhere as Prisma.CompanyWhereInput,
							orderBy: [{ createdAt: "desc" }],
							skip: secondSkip,
							take: remainingTake,
							select: { id: true },
						})
					: entity === "CONTACT"
						? await this.db.contact.findMany({
								where: unvaluedWhere as Prisma.ContactWhereInput,
								orderBy: [{ createdAt: "desc" }],
								skip: secondSkip,
								take: remainingTake,
								select: { id: true },
							})
						: await this.db.deal.findMany({
								where: unvaluedWhere as Prisma.DealWhereInput,
								orderBy: [{ createdAt: "desc" }],
								skip: secondSkip,
								take: remainingTake,
								select: { id: true },
							});

			for (const row of unvaluedRows) {
				ids.push(row.id);
			}
		}

		return ids;
	}

	async definitionsFor(
		entity: FieldEntity,
		client: Prisma.TransactionClient = this.db,
	): Promise<FieldDefinitionWithOptions[]> {
		return client.fieldDefinition.findMany({
			where: { entity, archivedAt: null },
			include: WITH_OPTIONS,
			orderBy: { position: "asc" },
		});
	}

	async valuesFor(
		entity: FieldEntity,
		recordId: string,
	): Promise<RecordField[]> {
		const column = recordColumn(entity);

		const [definitions, rows] = await Promise.all([
			this.definitionsFor(entity),
			this.db.fieldValue.findMany({ where: { [column]: recordId } }),
		]);

		return attachValues(definitions, rows);
	}

	async tableValuesFor(
		entity: FieldEntity,
		recordIds: string[],
	): Promise<Map<string, Record<string, FieldValueJson>>> {
		const byRecord = new Map<string, Record<string, FieldValueJson>>();

		if (recordIds.length === 0) return byRecord;

		const definitions = await this.db.fieldDefinition.findMany({
			where: { entity, archivedAt: null, showOnTable: true },
			include: WITH_OPTIONS,
			orderBy: { position: "asc" },
		});

		if (definitions.length === 0) return byRecord;

		const column = recordColumn(entity);

		const rows = await this.db.fieldValue.findMany({
			where: {
				[column]: { in: recordIds },
				fieldId: { in: definitions.map((definition) => definition.id) },
			},
		});

		const byId = new Map(definitions.map((entry) => [entry.id, entry]));

		for (const row of rows) {
			const recordId = row[column];
			if (!recordId) continue;

			const definition = byId.get(row.fieldId);
			if (!definition) continue;

			const current = byRecord.get(recordId) ?? {};
			current[definition.key] = tableValue(
				definition,
				readValue(definition, row),
			);
			byRecord.set(recordId, current);
		}

		return byRecord;
	}

	/**
	 * SELECT and USER fields are the only types with a fixed, small
	 * vocabulary a facet can count, but only the ones an admin turned on
	 * (`showOnFilter`) actually render — same opt-in as `showOnTable`, so the
	 * filter bar doesn't fill up with every field ever created.
	 */
	async filters(entity: FieldEntity): Promise<SerializedField[]> {
		const definitions = await this.filterableFieldsFor(entity);
		return definitions.map(serializeField);
	}

	async filterableFieldsFor(
		entity: FieldEntity,
	): Promise<FieldDefinitionWithOptions[]> {
		return this.db.fieldDefinition.findMany({
			where: {
				entity,
				archivedAt: null,
				showOnFilter: true,
				type: { in: [...FIELDS_CONFIG.filter.types] },
			},
			include: WITH_OPTIONS,
			orderBy: { position: "asc" },
		});
	}

	async filterFacetCounts(
		entity: FieldEntity,
		relationWhere:
			| Prisma.CompanyWhereInput
			| Prisma.ContactWhereInput
			| Prisma.DealWhereInput,
		definitions: FieldDefinitionWithOptions[],
	): Promise<Record<string, Record<string, number>>> {
		const facetCounts: Record<string, Record<string, number>> = {};
		if (definitions.length === 0) return facetCounts;

		const relation = RELATIONS[entity];
		const byId = new Map(
			definitions.map((definition) => [definition.id, definition]),
		);
		const selectIds = definitions
			.filter((definition) => definition.type === "SELECT")
			.map((definition) => definition.id);
		const userIds = definitions
			.filter((definition) => definition.type === "USER")
			.map((definition) => definition.id);
		const checkboxIds = definitions
			.filter((definition) => definition.type === "CHECKBOX")
			.map((definition) => definition.id);
		const textFields = definitions.filter((definition) =>
			(FIELDS_CONFIG.filter.textTypes as readonly string[]).includes(
				definition.type,
			),
		);
		const numberFields = definitions.filter(
			(definition) => definition.type === "NUMBER",
		);

		const [selectGroups, userGroups, checkboxGroups, textGroups, numberCounts] =
			await Promise.all([
				selectIds.length > 0
					? this.db.fieldValue.groupBy({
							by: ["fieldId", "optionId"],
							where: {
								fieldId: { in: selectIds },
								optionId: { not: null },
								[relation]: relationWhere,
							} as Prisma.FieldValueWhereInput,
							_count: { _all: true },
						})
					: [],
				userIds.length > 0
					? this.db.fieldValue.groupBy({
							by: ["fieldId", "userId"],
							where: {
								fieldId: { in: userIds },
								userId: { not: null },
								[relation]: relationWhere,
							} as Prisma.FieldValueWhereInput,
							_count: { _all: true },
						})
					: [],
				checkboxIds.length > 0
					? this.db.fieldValue.groupBy({
							by: ["fieldId", "bool"],
							where: {
								fieldId: { in: checkboxIds },
								bool: { not: null },
								[relation]: relationWhere,
							} as Prisma.FieldValueWhereInput,
							_count: { _all: true },
						})
					: [],
				textFields.length > 0
					? Promise.all(
							textFields.map(async (field) => {
								const groups = await this.db.fieldValue.groupBy({
									by: ["text"],
									where: {
										fieldId: field.id,
										text: { not: null },
										[relation]: relationWhere,
									} as Prisma.FieldValueWhereInput,
									_count: { text: true },
									orderBy: { _count: { text: "desc" } },
									take: FIELDS_CONFIG.filter.textMaxOptions,
								});
								return { key: field.key, groups };
							}),
						)
					: [],
				numberFields.length > 0
					? Promise.all(
							numberFields.map(async (field) => {
								const results: Array<{
									key: string;
									id: string;
									count: number;
								}> = [];
								for (const bucket of FIELDS_CONFIG.filter.numberBuckets) {
									const count = await this.db.fieldValue.count({
										where: {
											fieldId: field.id,
											number: numberWhereForBucket(bucket),
											[relation]: relationWhere,
										} as Prisma.FieldValueWhereInput,
									});
									results.push({ key: field.key, id: bucket.id, count });
								}
								return results;
							}),
						).then((nested) => nested.flat())
					: [],
			]);

		for (const group of selectGroups) {
			const definition = byId.get(group.fieldId);
			if (!definition || !group.optionId) continue;
			const bucket = facetCounts[definition.key] ?? {};
			facetCounts[definition.key] = bucket;
			bucket[group.optionId] =
				(bucket[group.optionId] ?? 0) + group._count._all;
		}

		for (const group of userGroups) {
			const definition = byId.get(group.fieldId);
			if (!definition || !group.userId) continue;
			const bucket = facetCounts[definition.key] ?? {};
			facetCounts[definition.key] = bucket;
			bucket[group.userId] = (bucket[group.userId] ?? 0) + group._count._all;
		}

		for (const group of checkboxGroups) {
			const definition = byId.get(group.fieldId);
			if (!definition || group.bool === null) continue;
			const bucket = facetCounts[definition.key] ?? {};
			facetCounts[definition.key] = bucket;
			const key = group.bool ? "true" : "false";
			bucket[key] = (bucket[key] ?? 0) + group._count._all;
		}

		for (const { key, groups } of textGroups) {
			const bucket: Record<string, number> = {};
			for (const group of groups) {
				if (!group.text || group.text.trim() === "") continue;
				bucket[group.text] = group._count.text;
			}
			facetCounts[key] = bucket;
		}

		for (const item of numberCounts) {
			if (item.count > 0) {
				const bucket = facetCounts[item.key] ?? {};
				facetCounts[item.key] = bucket;
				bucket[item.id] = item.count;
			}
		}

		return facetCounts;
	}

	fieldFilters(
		definitions: FieldDefinitionWithOptions[],
		selected: Record<string, string[]>,
	): Array<{ fieldValues: { some: Prisma.FieldValueWhereInput } }> {
		const byKey = new Map(
			definitions.map((definition) => [definition.key, definition]),
		);

		return Object.entries(selected)
			.filter(([, values]) => values.length > 0)
			.flatMap(
				([key, values]): Array<{
					fieldValues: { some: Prisma.FieldValueWhereInput };
				}> => {
					const definition = byKey.get(key);
					if (!definition) return [];

					if (definition.type === "USER") {
						const clean = values.filter(
							(v) => typeof v === "string" && v.length > 0,
						);
						if (clean.length === 0) return [];
						return [
							{
								fieldValues: {
									some: { fieldId: definition.id, userId: { in: clean } },
								},
							},
						];
					}

					if (definition.type === "SELECT") {
						const validOptionIds = new Set(definition.options.map((o) => o.id));
						const clean = values.filter((v) => validOptionIds.has(v));
						if (clean.length === 0) return [];
						return [
							{
								fieldValues: {
									some: { fieldId: definition.id, optionId: { in: clean } },
								},
							},
						];
					}

					if (definition.type === "CHECKBOX") {
						const hasTrue = values.includes("true");
						const hasFalse = values.includes("false");
						if (!hasTrue && !hasFalse) return [];
						const boolCondition = hasTrue && hasFalse ? { not: null } : hasTrue;
						return [
							{
								fieldValues: {
									some: { fieldId: definition.id, bool: boolCondition },
								},
							},
						];
					}

					if (definition.type === "NUMBER") {
						const bucketMap = new Map<
							string,
							(typeof FIELDS_CONFIG.filter.numberBuckets)[number]
						>(FIELDS_CONFIG.filter.numberBuckets.map((b) => [b.id, b]));
						const validBuckets = values
							.map((v) => bucketMap.get(v))
							.filter(
								(b): b is (typeof FIELDS_CONFIG.filter.numberBuckets)[number] =>
									b !== undefined,
							);
						if (validBuckets.length === 0) return [];

						const orConditions = validBuckets.map((bucket) => ({
							number: numberWhereForBucket(bucket),
						}));

						return [
							{
								fieldValues: {
									some: {
										fieldId: definition.id,
										OR: orConditions,
									},
								},
							},
						];
					}

					if (
						(FIELDS_CONFIG.filter.textTypes as readonly string[]).includes(
							definition.type,
						)
					) {
						const clean = values.filter(
							(v) => typeof v === "string" && v.length > 0,
						);
						if (clean.length === 0) return [];
						return [
							{
								fieldValues: {
									some: { fieldId: definition.id, text: { in: clean } },
								},
							},
						];
					}

					return [];
				},
			);
	}

	async applyValues(
		tx: Prisma.TransactionClient,
		entity: FieldEntity,
		recordId: string,
		values: Record<string, unknown>,
	): Promise<void> {
		if (Object.keys(values).length === 0) return;

		const definitions = await this.definitionsFor(entity, tx);

		try {
			await writeValues(tx, entity, recordId, definitions, values);
		} catch (error) {
			if (error instanceof FieldValueError) {
				throw new BadRequestException(error.message);
			}

			throw error;
		}
	}

	private translate(cause: unknown): never {
		if (
			cause instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			cause.code === "P2025"
		) {
			throw new NotFoundException("That field does not exist.");
		}

		throw cause;
	}
}

function tableValue(
	definition: FieldDefinitionWithOptions,
	value: FieldValueJson,
): FieldValueJson {
	if (definition.type !== "SELECT" || typeof value !== "string") return value;

	return (
		definition.options.find((option) => option.id === value)?.label ?? null
	);
}

function numberWhereForBucket(
	bucket: (typeof FIELDS_CONFIG.filter.numberBuckets)[number],
): Prisma.DecimalNullableFilter {
	if ("gte" in bucket && "lt" in bucket) {
		return { gte: bucket.gte, lt: bucket.lt };
	}
	if ("lt" in bucket) {
		return { lt: bucket.lt };
	}
	return { gte: bucket.gte };
}
