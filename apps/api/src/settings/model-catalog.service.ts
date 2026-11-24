import { getActiveAiProvider } from "@crm/db/settings";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { z } from "zod";

const GATEWAY_CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models";
const OPENROUTER_CATALOG_URL = "https://openrouter.ai/api/v1/models";

const CATALOG_TTL_MS = 30 * 60_000;
const CATALOG_KEY = "settings:model-catalog";
const CATALOG_TIMEOUT_MS = 5_000;

export interface CatalogModel {
	id: string;
	name: string;
	provider: string;
	contextWindowTokens: number;
	pricing: { input: number; output: number } | null;
}

const gatewayRate = z
	.union([z.number(), z.string()])
	.transform((value) => Number(value))
	.refine((value) => Number.isFinite(value))
	.nullable()
	.catch(null);

const gatewayModel = z.object({
	id: z.string(),
	name: z.string().catch(""),
	owned_by: z.string().catch(""),
	type: z.string().catch(""),
	tags: z.array(z.json()).catch([]),
	context_window: z.number(),
	pricing: z
		.object({ input: gatewayRate, output: gatewayRate })
		.nullable()
		.catch(null),
});

type GatewayModel = z.infer<typeof gatewayModel>;

const gatewayCatalog = z
	.object({ data: z.array(z.json()).catch([]) })
	.catch({ data: [] });

function usable(model: GatewayModel): boolean {
	return model.type === "language" && model.tags.includes("tool-use");
}

function toCatalogModel(model: GatewayModel): CatalogModel {
	const input = model.pricing?.input ?? null;
	const output = model.pricing?.output ?? null;

	return {
		id: model.id,
		name: model.name || model.id,
		provider: model.owned_by || (model.id.split("/")[0] ?? model.id),
		contextWindowTokens: model.context_window,
		pricing: input !== null && output !== null ? { input, output } : null,
	};
}

const openrouterRate = z
	.union([z.number(), z.string()])
	.transform((value) => Number(value))
	.refine((value) => Number.isFinite(value))
	.nullable()
	.catch(null);

const openrouterModel = z.object({
	id: z.string(),
	name: z.string().catch(""),
	context_length: z.number().catch(128_000),
	pricing: z
		.object({ prompt: openrouterRate, completion: openrouterRate })
		.nullable()
		.catch(null),
	supported_parameters: z.array(z.string()).catch([]),
});

type OpenRouterModel = z.infer<typeof openrouterModel>;

const openrouterCatalog = z
	.object({ data: z.array(z.json()).catch([]) })
	.catch({ data: [] });

function usableOpenRouter(model: OpenRouterModel): boolean {
	return model.supported_parameters.includes("tools");
}

function toCatalogModelFromOpenRouter(model: OpenRouterModel): CatalogModel {
	const input = model.pricing?.prompt ?? null;
	const output = model.pricing?.completion ?? null;

	return {
		id: model.id,
		name: model.name || model.id,
		provider: model.id.split("/")[0] ?? model.id,
		contextWindowTokens: model.context_length,
		pricing: input !== null && output !== null ? { input, output } : null,
	};
}

@Injectable()
export class ModelCatalogService {
	private readonly logger = new Logger(ModelCatalogService.name);

	constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

	async models(): Promise<CatalogModel[] | null> {
		const isOpenRouter = getActiveAiProvider() === "openrouter";
		const cacheKey = isOpenRouter
			? `${CATALOG_KEY}:openrouter`
			: `${CATALOG_KEY}:gateway`;

		const cached = await this.cache.get<CatalogModel[]>(cacheKey);
		if (cached) return cached;

		const models = await this.fetchCatalog(isOpenRouter);
		if (!models) return null;

		await this.cache.set(cacheKey, models, CATALOG_TTL_MS);
		return models;
	}

	async find(id: string): Promise<CatalogModel | null> {
		const models = await this.models();
		return models?.find((model) => model.id === id) ?? null;
	}

	private async fetchCatalog(
		isOpenRouter: boolean,
	): Promise<CatalogModel[] | null> {
		try {
			if (isOpenRouter) {
				return await this.fetchOpenRouterCatalog();
			}
			return await this.fetchGatewayCatalog();
		} catch (error) {
			this.logger.warn({
				message: "Model catalog unavailable",
				reason: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	private async fetchGatewayCatalog(): Promise<CatalogModel[] | null> {
		const response = await fetch(GATEWAY_CATALOG_URL, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
		});

		if (!response.ok) {
			this.logger.warn({
				message: "Model catalog request failed",
				status: response.status,
			});
			return null;
		}

		const body = gatewayCatalog.parse(await response.json());

		const models = body.data.flatMap((entry) => {
			const parsed = gatewayModel.safeParse(entry);
			return parsed.success && usable(parsed.data)
				? [toCatalogModel(parsed.data)]
				: [];
		});

		models.sort(
			(a, b) =>
				a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
		);

		this.logger.log({
			message: "Model catalog loaded",
			models: models.length,
		});

		return models;
	}

	private async fetchOpenRouterCatalog(): Promise<CatalogModel[] | null> {
		const apiKey = process.env.OPENROUTER_API_KEY?.trim();
		const headers: Record<string, string> = apiKey
			? { accept: "application/json", authorization: `Bearer ${apiKey}` }
			: { accept: "application/json" };

		const response = await fetch(OPENROUTER_CATALOG_URL, {
			headers,
			signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
		});

		if (!response.ok) {
			this.logger.warn({
				message: "OpenRouter model catalog request failed",
				status: response.status,
			});
			return null;
		}

		const body = openrouterCatalog.parse(await response.json());

		const models = body.data.flatMap((entry) => {
			const parsed = openrouterModel.safeParse(entry);
			return parsed.success && usableOpenRouter(parsed.data)
				? [toCatalogModelFromOpenRouter(parsed.data)]
				: [];
		});

		models.sort(
			(a, b) =>
				a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
		);

		this.logger.log({
			message: "OpenRouter model catalog loaded",
			models: models.length,
		});

		return models;
	}
}
