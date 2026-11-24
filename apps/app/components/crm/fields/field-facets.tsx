"use client";

import type { DataTableFacet } from "@crm/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTRPC } from "@/lib/trpc/client";
import type { FieldEntity } from "./fields-entity";

const NUMBER_BUCKET_OPTIONS = [
	{ value: "lt:1000", label: "< 1k" },
	{ value: "1000:10000", label: "1k–10k" },
	{ value: "10000:50000", label: "10k–50k" },
	{ value: "50000:100000", label: "50k–100k" },
	{ value: "gte:100000", label: "100k+" },
] as const;

const CHECKBOX_OPTIONS = [
	{ value: "true", label: "Yes" },
	{ value: "false", label: "No" },
] as const;

const TEXT_FIELD_TYPES = new Set(["TEXT", "URL", "EMAIL", "PHONE"]);

export function useFieldFacets(
	entity: FieldEntity,
	facetCounts: Record<string, Record<string, number>> | undefined,
): DataTableFacet[] {
	const trpc = useTRPC();
	const fields = useQuery(trpc.fields.filters.queryOptions({ entity }));
	const users = useQuery(trpc.users.list.queryOptions());

	return useMemo(() => {
		if (!fields.data) return [];

		return fields.data.map((field) => {
			const counts = facetCounts?.[`field:${field.key}`];

			if (TEXT_FIELD_TYPES.has(field.type)) {
				const options = Object.entries(counts ?? {})
					.filter(([, count]) => count > 0)
					.sort(([, a], [, b]) => b - a)
					.map(([value]) => ({ value, label: value }));

				return {
					id: `field:${field.key}`,
					label: field.label,
					options,
					searchable: true,
				};
			}

			const options =
				field.type === "USER"
					? (users.data ?? []).map((user) => ({
							value: user.id,
							label: user.name,
						}))
					: field.type === "NUMBER"
						? [...NUMBER_BUCKET_OPTIONS]
						: field.type === "CHECKBOX"
							? [...CHECKBOX_OPTIONS]
							: field.options.map((option) => ({
									value: option.id,
									label: option.label,
								}));

			return {
				id: `field:${field.key}`,
				label: field.label,
				options: options.filter((option) => (counts?.[option.value] ?? 0) > 0),
			};
		});
	}, [fields.data, users.data, facetCounts]);
}
