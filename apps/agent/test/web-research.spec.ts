import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { RESEARCH_MODEL } from "../agent/lib/research-config";
import { ask, findProfileUrls } from "../agent/lib/web-research";

type ChatBody = {
	model: string;
	messages: { role: string; content: string }[];
};

describe("web-research ask", () => {
	const originalEnv = { ...process.env };
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		delete process.env.OPENROUTER_API_KEY;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		globalThis.fetch = originalFetch;
	});

	it("returns unavailable outcome when OPENROUTER_API_KEY is not set", async () => {
		const result = await ask("What is Acme?");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("No OPENROUTER_API_KEY.");
		}
	});

	it("sends correct request shape with :online model and authorization header", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-testkey123";

		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};
		let capturedBody: ChatBody | null = null;

		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			capturedUrl = String(input);
			capturedHeaders = init?.headers as Record<string, string>;
			capturedBody = JSON.parse(init?.body as string) as ChatBody;

			return new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: "Acme makes anvils.",
								annotations: [
									{
										type: "url_citation",
										url_citation: { url: "https://example.com/annotated" },
									},
								],
							},
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		const result = await ask("Tell me about Acme", {
			system: "Be concise.",
		});

		expect(capturedUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
		expect(capturedHeaders.authorization).toBe("Bearer sk-or-testkey123");
		expect(capturedHeaders["content-type"]).toBe("application/json");

		expect(capturedBody?.model).toBe("anthropic/claude-haiku-5.5:online");
		expect(capturedBody?.model).toBe(RESEARCH_MODEL);
		expect(capturedBody?.messages).toEqual([
			{ role: "system", content: "Be concise." },
			{ role: "user", content: "Tell me about Acme" },
		]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.text).toBe("Acme makes anvils.");
			expect(result.data.citations).toEqual([
				"https://example.com/annotated",
			]);
		}
	});

	it("handles empty answers gracefully", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-testkey123";

		globalThis.fetch = (async () => {
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: "   " } }],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		const result = await ask("Tell me about Acme");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("Empty answer.");
		}
	});

	it("handles HTTP errors cleanly", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-testkey123";

		globalThis.fetch = (async () => {
			return new Response("Unauthorized", { status: 401 });
		}) as unknown as typeof fetch;

		const result = await ask("Tell me about Acme");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("HTTP 401");
		}
	});

	it("extracts LinkedIn slugs in findProfileUrls", async () => {
		process.env.OPENROUTER_API_KEY = "sk-or-testkey123";

		globalThis.fetch = (async () => {
			return new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: "Profile: https://linkedin.com/in/jane-doe-123",
							},
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		const slugs = await findProfileUrls(["Jane Doe"], "Acme");
		expect(slugs).toEqual(["jane-doe-123"]);
	});
});
