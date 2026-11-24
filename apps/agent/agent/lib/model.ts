import { db } from "@crm/db";
import {
	DEFAULT_AGENT_MODEL,
	DEFAULT_OPENROUTER_MODEL,
	readAgentModel,
	resolveAgentModel,
	resolveModelForProvider,
} from "@crm/db/settings";
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

export function defaultAgentFallbackModel(): string {
	return getProvider() === "openrouter"
		? DEFAULT_OPENROUTER_MODEL.id
		: DEFAULT_AGENT_MODEL.id;
}

export async function selectedModel(): Promise<ModelSelection | null> {
	if (getProvider() === "openrouter") {
		try {
			const setting = await resolveAgentModel(db, { provider: "openrouter" });
			return {
				model: setting.id,
				modelContextWindowTokens: setting.contextWindowTokens,
			};
		} catch (error) {
			console.error(
				`[agent] could not read the configured OpenRouter model for session: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return {
				model: DEFAULT_OPENROUTER_MODEL.id,
				modelContextWindowTokens: DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
			};
		}
	}

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
		const setting = await resolveAgentModel(db, { provider: "openrouter" });

		return {
			model: openrouter.chat(setting.id),
			modelContextWindowTokens: setting.contextWindowTokens,
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
	if (getProvider() === "openrouter") {
		try {
			const run = await db.agentRun.findUnique({
				where: { id: runId },
				select: {
					version: {
						select: { modelId: true, modelContextWindowTokens: true },
					},
				},
			});

			if (!run) {
				return {
					model: DEFAULT_OPENROUTER_MODEL.id,
					modelContextWindowTokens:
						DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
				};
			}

			const effective = resolveModelForProvider(
				run.version.modelId,
				run.version.modelContextWindowTokens,
				"openrouter",
			);

			return {
				model: effective.id,
				modelContextWindowTokens: effective.contextWindowTokens,
			};
		} catch (error) {
			console.error(
				`[agent] could not read the runner model for session: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return {
				model: DEFAULT_OPENROUTER_MODEL.id,
				modelContextWindowTokens: DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
			};
		}
	}

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

	const openrouter = getOpenRouterClient(apiKey);

	try {
		const run = await db.agentRun.findUnique({
			where: { id: runId },
			select: {
				version: {
					select: { modelId: true, modelContextWindowTokens: true },
				},
			},
		});

		if (!run) {
			console.error(
				`[agent] run ${runId} not found, falling back to default OpenRouter model`,
			);
			return {
				model: openrouter.chat(DEFAULT_OPENROUTER_MODEL.id),
				modelContextWindowTokens:
					DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
			};
		}

		const effective = resolveModelForProvider(
			run.version.modelId,
			run.version.modelContextWindowTokens,
			"openrouter",
		);

		return {
			model: openrouter.chat(effective.id),
			modelContextWindowTokens: effective.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the runner step model, falling back to default: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return {
			model: openrouter.chat(DEFAULT_OPENROUTER_MODEL.id),
			modelContextWindowTokens: DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
		};
	}
}
