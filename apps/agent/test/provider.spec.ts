import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	DEFAULT_AGENT_MODEL,
	DEFAULT_OPENROUTER_MODEL,
} from "@crm/db/settings";
import {
	defaultAgentFallbackModel,
	getProvider,
	selectedModel,
	selectedModelStep,
	selectedRunnerModel,
	selectedRunnerModelStep,
	validateOpenRouterKey,
	validateStartup,
} from "../agent/lib/model";

describe("provider selection", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		delete process.env.OPENROUTER_API_KEY;
		delete process.env.AI_GATEWAY_API_KEY;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	it("selects OpenRouter when OPENROUTER_API_KEY is set", () => {
		process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey123";
		expect(getProvider()).toBe("openrouter");
	});

	it("selects Gateway when only AI_GATEWAY_API_KEY is set", () => {
		delete process.env.OPENROUTER_API_KEY;
		process.env.AI_GATEWAY_API_KEY = "gw-test-key";
		expect(getProvider()).toBe("gateway");
	});

	it("selects neither when both keys are absent", () => {
		delete process.env.OPENROUTER_API_KEY;
		delete process.env.AI_GATEWAY_API_KEY;
		expect(getProvider()).toBe("none");
	});

	it("treats a blank OPENROUTER_API_KEY as unset", () => {
		process.env.OPENROUTER_API_KEY = "   ";
		expect(() => validateStartup()).not.toThrow();
		expect(getProvider()).toBe("none");
	});

	it("rejects an OPENROUTER_API_KEY missing the sk-or- prefix", () => {
		process.env.OPENROUTER_API_KEY = "sk-ant-invalid-prefix";
		expect(() => validateStartup()).toThrow();
		expect(() => getProvider()).toThrow();
	});

	it("accepts a valid sk-or- key", () => {
		process.env.OPENROUTER_API_KEY = "sk-or-v1-abcdef123456";
		expect(() => validateStartup()).not.toThrow();
		expect(() => validateOpenRouterKey("sk-or-v1-abcdef123456")).not.toThrow();
	});

	it("does not reject an absent OPENROUTER_API_KEY", () => {
		delete process.env.OPENROUTER_API_KEY;
		expect(() => validateStartup()).not.toThrow();
		expect(() => validateOpenRouterKey(undefined)).not.toThrow();
	});

	it("returns correct fallback model depending on active provider", () => {
		delete process.env.OPENROUTER_API_KEY;
		expect(defaultAgentFallbackModel()).toBe(DEFAULT_AGENT_MODEL.id);

		process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey123";
		expect(defaultAgentFallbackModel()).toBe(DEFAULT_OPENROUTER_MODEL.id);
	});

	it("returns OpenRouter model in selectedModel when OpenRouter is active", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey123";
		const model = await selectedModel();
		expect(model?.model).toBe(DEFAULT_OPENROUTER_MODEL.id);
		expect(model?.modelContextWindowTokens).toBe(
			DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
		);
	});

	it("returns OpenRouter chat step in selectedModelStep when OpenRouter is active", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey123";
		const step = await selectedModelStep();
		expect(step).not.toBeNull();
		expect(step?.modelContextWindowTokens).toBe(
			DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
		);
	});

	it("returns OpenRouter default model in selectedRunnerModel for nonexistent run in OpenRouter mode", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey123";
		const runnerModel = await selectedRunnerModel("non-existent-run-id");
		expect(runnerModel?.model).toBe(DEFAULT_OPENROUTER_MODEL.id);
		expect(runnerModel?.modelContextWindowTokens).toBe(
			DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
		);
	});

	it("returns OpenRouter default step in selectedRunnerModelStep for nonexistent run in OpenRouter mode", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey123";
		const runnerStep = await selectedRunnerModelStep("non-existent-run-id");
		expect(runnerStep).not.toBeNull();
		expect(runnerStep?.modelContextWindowTokens).toBe(
			DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
		);
	});
});
