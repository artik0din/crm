import type { Db } from "./client";
import {
	DEFAULT_REPORTING_CURRENCY,
	isCurrencyCode,
	normalizeCurrency,
} from "./currency";

export const SETTINGS_ID = "app";

export const DEFAULT_AGENT_MODEL = {
	id: "zai/glm-5.2-fast",
	contextWindowTokens: 1_000_000,
} as const;

export const DEFAULT_OPENROUTER_MODEL = {
	id: "z-ai/glm-5.3-flash",
	contextWindowTokens: 128_000,
} as const;

export type AiProvider = "openrouter" | "gateway";

export function getActiveAiProvider(
	env: Record<string, string | undefined> = process.env,
): AiProvider {
	const key = env.OPENROUTER_API_KEY?.trim();
	return key ? "openrouter" : "gateway";
}

export function getDefaultModelForProvider(
	provider: AiProvider,
): { id: string; contextWindowTokens: number } {
	return provider === "openrouter"
		? DEFAULT_OPENROUTER_MODEL
		: DEFAULT_AGENT_MODEL;
}

export interface AgentModelSetting {
	id: string;
	contextWindowTokens: number;
	isDefault: boolean;
}

export interface EffectiveModelSetting {
	id: string;
	contextWindowTokens: number;
	isDefault: boolean;
	unavailableOnCurrentProvider: boolean;
}

export function resolveModelForProvider(
	savedId: string | null | undefined,
	savedTokens: number | null | undefined,
	provider: AiProvider,
	validModelIds?: string[] | null,
): EffectiveModelSetting {
	const defaultModel = getDefaultModelForProvider(provider);
	if (!savedId) {
		return {
			...defaultModel,
			isDefault: true,
			unavailableOnCurrentProvider: false,
		};
	}

	if (provider === "openrouter") {
		if (savedId === DEFAULT_AGENT_MODEL.id || savedId.startsWith("zai/")) {
			return {
				...defaultModel,
				isDefault: false,
				unavailableOnCurrentProvider: true,
			};
		}
	} else {
		if (
			savedId === DEFAULT_OPENROUTER_MODEL.id ||
			savedId.startsWith("z-ai/")
		) {
			return {
				...defaultModel,
				isDefault: false,
				unavailableOnCurrentProvider: true,
			};
		}
	}

	if (
		validModelIds &&
		validModelIds.length > 0 &&
		!validModelIds.includes(savedId)
	) {
		return {
			...defaultModel,
			isDefault: false,
			unavailableOnCurrentProvider: true,
		};
	}

	return {
		id: savedId,
		contextWindowTokens: savedTokens ?? defaultModel.contextWindowTokens,
		isDefault: false,
		unavailableOnCurrentProvider: false,
	};
}

export async function resolveAgentModel(
	db: Db,
	options?: {
		provider?: AiProvider;
		validModelIds?: string[] | null;
		env?: Record<string, string | undefined>;
	},
): Promise<EffectiveModelSetting> {
	const env = options?.env ?? process.env;
	const provider = options?.provider ?? getActiveAiProvider(env);
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { agentModelId: true, agentModelContextWindow: true },
	});

	return resolveModelForProvider(
		row?.agentModelId,
		row?.agentModelContextWindow,
		provider,
		options?.validModelIds,
	);
}

export async function readAgentModel(
	db: Db,
	env: Record<string, string | undefined> = process.env,
): Promise<AgentModelSetting> {
	const resolved = await resolveAgentModel(db, { env });
	return {
		id: resolved.id,
		contextWindowTokens: resolved.contextWindowTokens,
		isDefault: resolved.isDefault,
	};
}

export async function writeAgentModel(
	db: Db,
	model: { id: string; contextWindowTokens: number } | null,
): Promise<void> {
	const fields = {
		agentModelId: model?.id ?? null,
		agentModelContextWindow: model?.contextWindowTokens ?? null,
	};

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ...fields },
		update: fields,
	});
}

export const CONTEXT_DEV_SIGNUP_URL = "https://link.context.dev/crm";

export const CONTEXT_DEV_DISCOUNT_CODE = "CRM";

export async function readContextDevKey(db: Db): Promise<string | null> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { contextDevApiKey: true },
	});

	return row?.contextDevApiKey?.trim() || null;
}

export async function writeContextDevKey(db: Db, key: string): Promise<void> {
	const contextDevApiKey = key.trim();

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: {
			id: SETTINGS_ID,
			contextDevApiKey,
			contextDevSkipped: false,
		},
		update: { contextDevApiKey, contextDevSkipped: false },
	});
}

export async function readContextDevSkipped(db: Db): Promise<boolean> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { contextDevSkipped: true },
	});

	return row?.contextDevSkipped === true;
}

export async function skipContextDev(db: Db): Promise<void> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, contextDevSkipped: true },
		update: { contextDevSkipped: true },
	});
}

export async function readReportingCurrency(db: Db): Promise<string> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { reportingCurrency: true },
	});

	const stored = normalizeCurrency(row?.reportingCurrency);

	return isCurrencyCode(stored) ? stored : DEFAULT_REPORTING_CURRENCY;
}

export async function writeReportingCurrency(
	db: Db,
	code: string,
): Promise<string> {
	const reportingCurrency = normalizeCurrency(code);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, reportingCurrency },
		update: { reportingCurrency },
	});

	return reportingCurrency;
}

export async function readRatesRefreshedAt(db: Db): Promise<Date | null> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { ratesRefreshedAt: true },
	});

	return row?.ratesRefreshedAt ?? null;
}

export async function writeRatesRefreshedAt(
	db: Db,
	ratesRefreshedAt: Date,
): Promise<void> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ratesRefreshedAt },
		update: { ratesRefreshedAt },
	});
}

export const DEFAULT_ARCHIVE_RETENTION_DAYS = 180;

export const MIN_ARCHIVE_RETENTION_DAYS = 1;

export const MAX_ARCHIVE_RETENTION_DAYS = 3650;

export async function readArchiveRetentionDays(db: Db): Promise<number> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { archiveRetentionDays: true },
	});

	return row?.archiveRetentionDays ?? DEFAULT_ARCHIVE_RETENTION_DAYS;
}

export async function writeArchiveRetentionDays(
	db: Db,
	days: number,
): Promise<number> {
	const archiveRetentionDays = Math.min(
		Math.max(Math.round(days), MIN_ARCHIVE_RETENTION_DAYS),
		MAX_ARCHIVE_RETENTION_DAYS,
	);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, archiveRetentionDays },
		update: { archiveRetentionDays },
	});

	return archiveRetentionDays;
}

export function maskKey(key: string): string {
	const trimmed = key.trim();
	return trimmed.length > 4 ? `••••${trimmed.slice(-4)}` : "••••";
}
