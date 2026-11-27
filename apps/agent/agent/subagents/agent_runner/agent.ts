import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import {
	defaultAgentFallbackModel,
	selectedRunnerModel,
	selectedRunnerModelStep,
} from "../../lib/model";
import { attribute, purposeOf } from "../../lib/session-purpose";

export default defineAgent({
	description:
		"Execute one immutable deployed CRM agent version and persist its result and every side effect.",
	model: defineDynamic({
		fallback: defaultAgentFallbackModel(),
		events: {
			"session.started": async (_event, ctx) => {
				if (purposeOf(ctx) !== "team-agent") return null;
				const runId = attribute(ctx, "runId");
				if (!runId) return null;
				return selectedRunnerModel(runId);
			},
			"step.started": async (_event, ctx) => {
				if (purposeOf(ctx) !== "team-agent") return null;
				const runId = attribute(ctx, "runId");
				if (!runId) return null;
				return selectedRunnerModelStep(runId);
			},
		},
	}),
	outputSchema: z.object({
		summary: z.string().min(1).max(1000),
		result: z.record(z.string(), z.unknown()).nullable(),
	}),
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 40_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});
