process.env.API_URL = "https://crm.example.test";

import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { APIError } from "better-auth/api";
import { WORKSPACE_ID } from "../src/organization";

const { auth } = await import("../src/auth");

const suffix = process.env.TEST_RUN_ID ?? "session-allow-list-spec";
const originalAllowedSignIn = process.env.ALLOWED_SIGN_IN;

const emailOf = (label: string, domain = "example.test") =>
	`${label}.${suffix}@${domain}`;

let allowedUserId: string;

const seedUser = async (
	label: string,
	domain = "example.test",
): Promise<string> => {
	const user = await db.user.create({
		data: {
			id: `${suffix}-${label}`,
			name: label,
			email: emailOf(label, domain),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		select: { id: true },
	});

	return user.id;
};

const clear = async () => {
	await db.session.deleteMany({
		where: { userId: { startsWith: `${suffix}-` } },
	});
	await db.member.deleteMany({
		where: { userId: { startsWith: `${suffix}-` } },
	});
	await db.user.deleteMany({
		where: { id: { startsWith: `${suffix}-` } },
	});
};

beforeEach(async () => {
	await clear();
	process.env.ALLOWED_SIGN_IN = "example.test";
	allowedUserId = await seedUser("member", "example.test");
});

afterAll(async () => {
	process.env.ALLOWED_SIGN_IN = originalAllowedSignIn;
	await clear();
});

describe("session.create.before", () => {
	it("rejects with FORBIDDEN when user email is no longer on the allow-list", async () => {
		process.env.ALLOWED_SIGN_IN = "other.test";

		const sessionHook = auth.options.databaseHooks?.session?.create?.before;
		if (!sessionHook) throw new Error("sessionHook not found");

		const session = {
			id: `${suffix}-session-1`,
			userId: allowedUserId,
			token: `${suffix}-token-1`,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		try {
			await sessionHook(session as never, {} as never);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			expect((error as APIError).status).toBe("FORBIDDEN");
			expect((error as APIError).body?.code).toBe("SIGN_IN_NOT_ALLOWED");
		}
	});

	it("returns activeOrganizationId for an allowed user", async () => {
		process.env.ALLOWED_SIGN_IN = "example.test";

		const sessionHook = auth.options.databaseHooks?.session?.create?.before;
		if (!sessionHook) throw new Error("sessionHook not found");

		const session = {
			id: `${suffix}-session-2`,
			userId: allowedUserId,
			token: `${suffix}-token-2`,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const result = await sessionHook(session as never, {} as never);
		expect(result).toBeDefined();
		expect(
			result && "data" in result ? result.data?.activeOrganizationId : null,
		).toBe(WORKSPACE_ID);
	});

	it("rejects with FORBIDDEN when there is no allow-list configured", async () => {
		process.env.ALLOWED_SIGN_IN = "";

		const sessionHook = auth.options.databaseHooks?.session?.create?.before;
		if (!sessionHook) throw new Error("sessionHook not found");

		const session = {
			id: `${suffix}-session-3`,
			userId: allowedUserId,
			token: `${suffix}-token-3`,
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		try {
			await sessionHook(session as never, {} as never);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			expect((error as APIError).status).toBe("FORBIDDEN");
			expect((error as APIError).body?.code).toBe("SIGN_IN_NOT_ALLOWED");
		}
	});
});
