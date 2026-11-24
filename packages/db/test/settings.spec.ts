import { describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import {
	DEFAULT_AGENT_MODEL,
	DEFAULT_OPENROUTER_MODEL,
	readAgentModel,
	readContextDevKey,
	readContextDevSkipped,
	resolveAgentModel,
	resolveModelForProvider,
	skipContextDev,
	writeContextDevKey,
} from "../src/settings";

type Row = {
	contextDevApiKey: string | null;
	contextDevSkipped: boolean;
	agentModelId?: string | null;
	agentModelContextWindow?: number | null;
};

function fakeDb(initial?: Partial<Row>) {
	let row: Row | null = initial
		? {
				contextDevApiKey: initial.contextDevApiKey ?? null,
				contextDevSkipped: initial.contextDevSkipped ?? false,
				agentModelId: initial.agentModelId ?? null,
				agentModelContextWindow: initial.agentModelContextWindow ?? null,
			}
		: null;

	const db = {
		appSetting: {
			findUnique: async () => row,
			upsert: async ({
				create,
				update,
			}: {
				create: Row & { id: string };
				update: Partial<Row>;
			}) => {
				row = row
					? {
							contextDevApiKey: update.contextDevApiKey ?? row.contextDevApiKey,
							contextDevSkipped:
								update.contextDevSkipped ?? row.contextDevSkipped,
							agentModelId: update.agentModelId ?? row.agentModelId,
							agentModelContextWindow:
								update.agentModelContextWindow ?? row.agentModelContextWindow,
						}
					: {
							contextDevApiKey: create.contextDevApiKey ?? null,
							contextDevSkipped: create.contextDevSkipped ?? false,
							agentModelId: create.agentModelId ?? null,
							agentModelContextWindow: create.agentModelContextWindow ?? null,
						};

				return row;
			},
		},
	} as unknown as Db;

	return { db, current: () => row };
}

describe("readContextDevSkipped", () => {
	it("is false when nobody has answered", async () => {
		const { db } = fakeDb();

		expect(await readContextDevSkipped(db)).toBe(false);
	});

	it("is true after the step is skipped", async () => {
		const { db } = fakeDb({ contextDevSkipped: true });

		expect(await readContextDevSkipped(db)).toBe(true);
	});
});

describe("skipContextDev", () => {
	it("records the skip on a missing row", async () => {
		const { db } = fakeDb();

		await skipContextDev(db);

		expect(await readContextDevSkipped(db)).toBe(true);
		expect(await readContextDevKey(db)).toBeNull();
	});
});

describe("writeContextDevKey", () => {
	it("clears a skip when a key is saved later", async () => {
		const { db } = fakeDb({ contextDevSkipped: true });

		await writeContextDevKey(db, " ctx_live_abcdefgh ");

		expect(await readContextDevKey(db)).toBe("ctx_live_abcdefgh");
		expect(await readContextDevSkipped(db)).toBe(false);
	});
});

describe("model provider resolution", () => {
	it("resolves the gateway default when no model is saved", () => {
		const resolved = resolveModelForProvider(null, null, "gateway");
		expect(resolved.id).toBe(DEFAULT_AGENT_MODEL.id);
		expect(resolved.contextWindowTokens).toBe(
			DEFAULT_AGENT_MODEL.contextWindowTokens,
		);
		expect(resolved.isDefault).toBe(true);
		expect(resolved.unavailableOnCurrentProvider).toBe(false);
	});

	it("resolves the openrouter default when no model is saved", () => {
		const resolved = resolveModelForProvider(null, null, "openrouter");
		expect(resolved.id).toBe(DEFAULT_OPENROUTER_MODEL.id);
		expect(resolved.contextWindowTokens).toBe(
			DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
		);
		expect(resolved.isDefault).toBe(true);
		expect(resolved.unavailableOnCurrentProvider).toBe(false);
	});

	it("resolves a saved gateway model to openrouter default and flags unavailable on openrouter", () => {
		const resolved = resolveModelForProvider(
			"zai/glm-5.2-fast",
			1_000_000,
			"openrouter",
		);
		expect(resolved.id).toBe(DEFAULT_OPENROUTER_MODEL.id);
		expect(resolved.contextWindowTokens).toBe(
			DEFAULT_OPENROUTER_MODEL.contextWindowTokens,
		);
		expect(resolved.isDefault).toBe(false);
		expect(resolved.unavailableOnCurrentProvider).toBe(true);
	});

	it("resolves a saved openrouter model to gateway default and flags unavailable on gateway", () => {
		const resolved = resolveModelForProvider(
			"z-ai/glm-5.3-flash",
			128_000,
			"gateway",
		);
		expect(resolved.id).toBe(DEFAULT_AGENT_MODEL.id);
		expect(resolved.contextWindowTokens).toBe(
			DEFAULT_AGENT_MODEL.contextWindowTokens,
		);
		expect(resolved.isDefault).toBe(false);
		expect(resolved.unavailableOnCurrentProvider).toBe(true);
	});

	it("flags unavailable when saved model is missing from validModelIds", () => {
		const resolved = resolveModelForProvider(
			"retired/model",
			50_000,
			"openrouter",
			["z-ai/glm-5.3-flash"],
		);
		expect(resolved.id).toBe(DEFAULT_OPENROUTER_MODEL.id);
		expect(resolved.unavailableOnCurrentProvider).toBe(true);
	});

	it("keeps saved model when present in validModelIds", () => {
		const resolved = resolveModelForProvider(
			"anthropic/claude-3.5-sonnet",
			200_000,
			"openrouter",
			["anthropic/claude-3.5-sonnet", "z-ai/glm-5.3-flash"],
		);
		expect(resolved.id).toBe("anthropic/claude-3.5-sonnet");
		expect(resolved.contextWindowTokens).toBe(200_000);
		expect(resolved.unavailableOnCurrentProvider).toBe(false);
	});

	it("resolves through resolveAgentModel reading database", async () => {
		const { db } = fakeDb({
			agentModelId: "zai/glm-5.2-fast",
			agentModelContextWindow: 1_000_000,
		});

		const gatewayRes = await resolveAgentModel(db, { provider: "gateway" });
		expect(gatewayRes.id).toBe("zai/glm-5.2-fast");
		expect(gatewayRes.unavailableOnCurrentProvider).toBe(false);

		const openrouterRes = await resolveAgentModel(db, {
			provider: "openrouter",
		});
		expect(openrouterRes.id).toBe(DEFAULT_OPENROUTER_MODEL.id);
		expect(openrouterRes.unavailableOnCurrentProvider).toBe(true);
	});

	it("readAgentModel respects active provider in env", async () => {
		const { db } = fakeDb();

		const modelGateway = await readAgentModel(db, {});
		expect(modelGateway.id).toBe(DEFAULT_AGENT_MODEL.id);

		const modelOpenRouter = await readAgentModel(db, {
			OPENROUTER_API_KEY: "sk-or-testkey",
		});
		expect(modelOpenRouter.id).toBe(DEFAULT_OPENROUTER_MODEL.id);
	});
});
