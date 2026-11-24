import { z } from "zod";
import { RESEARCH_CONFIG, RESEARCH_MODEL } from "./research-config";

export type Answer = {
	text: string;
	citations: string[];
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export function webResearchEnabled(): boolean {
	return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export type AskOptions = {
	model?: string;
	domains?: string[];
	system?: string;
};

const chatResponseSchema = z.object({
	choices: z
		.array(
			z.object({
				message: z
					.object({
						content: z.string().catch(""),
						annotations: z
							.array(z.object({ url: z.string().catch("") }))
							.catch([]),
					})
					.catch({ content: "", annotations: [] }),
			}),
		)
		.catch([]),
	citations: z.array(z.string()).catch([]),
	search_results: z.array(z.object({ url: z.string().catch("") })).catch([]),
});

type ChatRequestBody = {
	model: string;
	messages: { role: string; content: string }[];
	search_domain_filter?: string[];
};

export async function ask(
	question: string,
	options: AskOptions = {},
): Promise<Outcome<Answer>> {
	const apiKey = process.env.OPENROUTER_API_KEY?.trim();
	if (!apiKey) return { ok: false, reason: "No OPENROUTER_API_KEY." };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), RESEARCH_CONFIG.timeoutMs);

	try {
		const requestBody: ChatRequestBody = {
			model: options.model ?? RESEARCH_MODEL,
			messages: [
				...(options.system
					? [{ role: "system", content: options.system }]
					: []),
				{ role: "user", content: question },
			],
		};
		if (options.domains) {
			requestBody.search_domain_filter = options.domains;
		}

		const response = await fetch(RESEARCH_CONFIG.endpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			signal: controller.signal,
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const parsed = chatResponseSchema.safeParse(await response.json());
		if (!parsed.success) {
			return { ok: false, reason: "Invalid response from OpenRouter." };
		}

		const body = parsed.data;
		const text = body.choices[0]?.message.content.trim() ?? "";
		if (!text) return { ok: false, reason: "Empty answer." };

		const citations: string[] = [];
		for (const url of body.citations) {
			if (url && !citations.includes(url)) citations.push(url);
		}
		for (const annotation of body.choices[0]?.message.annotations ?? []) {
			if (annotation.url && !citations.includes(annotation.url)) {
				citations.push(annotation.url);
			}
		}
		for (const result of body.search_results) {
			if (result.url && !citations.includes(result.url)) {
				citations.push(result.url);
			}
		}

		return { ok: true, data: { text, citations } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${RESEARCH_CONFIG.timeoutMs}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

export async function findProfileUrls(
	terms: string[],
	companyName: string,
): Promise<string[]> {
	const slugs: string[] = [];

	for (const term of terms) {
		const answer = await ask(
			`Find the LinkedIn profile of the person called "${term}" who works at ${companyName}. Reply with their profile URL only.`,
			{ domains: ["linkedin.com"] },
		);

		if (!answer.ok) continue;

		const haystack = [answer.data.text, ...answer.data.citations].join(" ");
		for (const match of haystack.matchAll(
			/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/g,
		)) {
			const slug = match[1];
			if (slug && !slugs.includes(slug)) slugs.push(slug);
		}

		if (slugs.length > 0) break;
	}

	return slugs;
}
