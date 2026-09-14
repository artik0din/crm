import { CALENDAR_SCOPE, GMAIL_SCOPE } from "@crm/auth";

export const GOOGLE_SYNC_SOURCES = ["calendar", "gmail"] as const;
export type GoogleSyncSource = (typeof GOOGLE_SYNC_SOURCES)[number];

export const SCOPE_FOR_SOURCE = {
	calendar: CALENDAR_SCOPE,
	gmail: GMAIL_SCOPE,
} satisfies Record<GoogleSyncSource, string>;
