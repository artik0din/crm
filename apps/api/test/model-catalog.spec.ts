import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Cache } from "cache-manager";
import { ModelCatalogService } from "../src/settings/model-catalog.service";

describe("ModelCatalogService", () => {
	const originalEnv = { ...process.env };
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		delete process.env.OPENROUTER_API_KEY;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		globalThis.fetch = originalFetch;
	});

	it("fetches and parses Gateway catalog when OpenRouter is unset", async () => {
		const mockCache = {
			get: async () => null,
			set: async () => {},
		} as unknown as Cache;

		let fetchedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			fetchedUrl = String(input);
			return new Response(
				JSON.stringify({
					data: [
						{
							id: "zai/glm-5.2-fast",
							name: "GLM 5.2 Fast",
							owned_by: "zai",
							type: "language",
							tags: ["tool-use"],
							context_window: 1_000_000,
							pricing: { input: "0.1", output: "0.2" },
						},
						{
							id: "other/not-tool",
							name: "Not Tool",
							owned_by: "other",
							type: "language",
							tags: [],
							context_window: 4096,
							pricing: null,
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		const service = new ModelCatalogService(mockCache);
		const models = await service.models();

		expect(fetchedUrl).toContain("ai-gateway.vercel.sh");
		expect(models).toHaveLength(1);
		expect(models?.[0]?.id).toBe("zai/glm-5.2-fast");
		expect(models?.[0]?.contextWindowTokens).toBe(1_000_000);
	});

	it("fetches and parses OpenRouter catalog when OPENROUTER_API_KEY is set", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey";

		const mockCache = {
			get: async () => null,
			set: async () => {},
		} as unknown as Cache;

		let fetchedUrl = "";
		let authHeader = "";
		globalThis.fetch = (async (
			input: string | URL | Request,
			init?: RequestInit,
		) => {
			fetchedUrl = String(input);
			authHeader =
				(init?.headers as Record<string, string>)?.authorization ?? "";
			return new Response(
				JSON.stringify({
					data: [
						{
							id: "z-ai/glm-5.3-flash",
							name: "GLM 5.3 Flash",
							context_length: 128000,
							pricing: { prompt: "0.000001", completion: "0.000002" },
							supported_parameters: ["tools", "temperature"],
						},
						{
							id: "no-tools/model",
							name: "No Tools Model",
							context_length: 32000,
							pricing: null,
							supported_parameters: ["temperature"],
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		const service = new ModelCatalogService(mockCache);
		const models = await service.models();

		expect(fetchedUrl).toContain("openrouter.ai");
		expect(authHeader).toBe("Bearer sk-or-v1-testkey");
		expect(models).toHaveLength(1);
		expect(models?.[0]?.id).toBe("z-ai/glm-5.3-flash");
		expect(models?.[0]?.contextWindowTokens).toBe(128000);
		expect(models?.[0]?.pricing?.input).toBe(0.000001);
		expect(models?.[0]?.pricing?.output).toBe(0.000002);
	});

	it("returns null when catalog request fails", async () => {
		const mockCache = {
			get: async () => null,
			set: async () => {},
		} as unknown as Cache;

		globalThis.fetch = (async () => {
			return new Response("Server error", { status: 500 });
		}) as unknown as typeof fetch;

		const service = new ModelCatalogService(mockCache);
		const models = await service.models();

		expect(models).toBeNull();
	});
});
