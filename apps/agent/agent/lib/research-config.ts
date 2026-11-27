const SECOND_MS = 1_000;

export const RESEARCH_CONFIG = {
	model: "anthropic/claude-haiku-5.5:online",
	timeoutMs: 45 * SECOND_MS,
	endpoint: "https://openrouter.ai/api/v1/chat/completions",
} as const;

export const RESEARCH_MODEL = RESEARCH_CONFIG.model;
