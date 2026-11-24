import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	getProvider,
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

	it("rejects a blank OPENROUTER_API_KEY", () => {
		process.env.OPENROUTER_API_KEY = "   ";
		expect(() => validateStartup()).toThrow();
		expect(() => getProvider()).toThrow();
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
});
