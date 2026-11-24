import { db } from "@crm/db";
import { DEFAULT_OPENROUTER_MODEL, readAgentModel } from "@crm/db/settings";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export type AiProvider = "openrouter" | "gateway" | "none";

export interface ModelSelection {
	model: string;
	modelContextWindowTokens: number;
}

export function validateOpenRouterKey(key?: string): void {
	if (!key) return;
	const trimmed = key.trim();
	if (!trimmed) return;
	if (!trimmed.startsWith("sk-or-")) {
		throw new Error(
			"OPENROUTER_API_KEY is malformed: it must start with 'sk-or-'.",
		);
	}
}

export function validateStartup(): void {
	validateOpenRouterKey(process.env.OPENROUTER_API_KEY);
}

export function getProvider(
	env: Record<string, string | undefined> = process.env,
): AiProvider {
	const openrouterKey = env.OPENROUTER_API_KEY?.trim();
	if (openrouterKey) {
		validateOpenRouterKey(openrouterKey);
		return "openrouter";
	}
	if (env.AI_GATEWAY_API_KEY?.trim()) {
		return "gateway";
	}
	return "none";
}

let cachedOpenRouterClient: ReturnType<typeof createOpenRouter> | null = null;
let cachedOpenRouterKey: string | null = null;

function getOpenRouterClient(apiKey: string) {
	if (cachedOpenRouterClient && cachedOpenRouterKey === apiKey) {
		return cachedOpenRouterClient;
	}
	cachedOpenRouterClient = createOpenRouter({ apiKey });
	cachedOpenRouterKey = apiKey;
	return cachedOpenRouterClient;
}

export async function selectedModel(): Promise<ModelSelection | null> {
	if (getProvider() === "openrouter") return null;

	try {
		const setting = await readAgentModel(db);

		if (setting.isDefault) return null;

		return {
			model: setting.id,
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}

export async function selectedModelStep(): Promise<{
	model: ReturnType<ReturnType<typeof createOpenRouter>["chat"]>;
	modelContextWindowTokens: number;
} | null> {
	if (getProvider() !== "openrouter") return null;

	const apiKey = process.env.OPENROUTER_API_KEY;
	validateOpenRouterKey(apiKey);
	if (!apiKey) return null;

	const openrouter = getOpenRouterClient(apiKey);

	try {
		const setting = await readAgentModel(db);
		const modelId = setting.isDefault
			? DEFAULT_OPENROUTER_MODEL.id
			: setting.id;
		const tokens = setting.isDefault
			? DEFAULT_OPENROUTER_MODEL.contextWindowTokens
			: setting.contextWindowTokens;

		return {
			model: openrouter.chat(modelId),
			modelContextWindowTokens: tokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured OpenRouter model, falling back to default: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return {
			model: openrouter.chat(DEFAULT_OPENROUTER_MODEL.id),
			modelContextWindowTokens: DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
		};
	}
}

export async function selectedRunnerModel(
	runId: string,
): Promise<ModelSelection | null> {
	if (getProvider() === "openrouter") return null;

	try {
		const run = await db.agentRun.findUnique({
			where: { id: runId },
			select: {
				version: {
					select: { modelId: true, modelContextWindowTokens: true },
				},
			},
		});

		return run
			? {
					model: run.version.modelId,
					modelContextWindowTokens: run.version.modelContextWindowTokens,
				}
			: null;
	} catch {
		return null;
	}
}

export async function selectedRunnerModelStep(runId: string): Promise<{
	model: ReturnType<ReturnType<typeof createOpenRouter>["chat"]>;
	modelContextWindowTokens: number;
} | null> {
	if (getProvider() !== "openrouter") return null;

	const apiKey = process.env.OPENROUTER_API_KEY;
	validateOpenRouterKey(apiKey);
	if (!apiKey) return null;

	try {
		const run = await db.agentRun.findUnique({
			where: { id: runId },
			select: {
				version: {
					select: { modelId: true, modelContextWindowTokens: true },
				},
			},
		});

		if (!run) return null;

		const openrouter = getOpenRouterClient(apiKey);
		return {
			model: openrouter.chat(run.version.modelId),
			modelContextWindowTokens: run.version.modelContextWindowTokens,
		};
	} catch {
		return null;
	}
}
