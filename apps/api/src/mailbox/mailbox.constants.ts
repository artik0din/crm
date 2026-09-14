import {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	type MailboxProviderId,
	MICROSOFT_PROVIDER_ID,
	OUTLOOK_MAIL_SCOPE,
} from "@crm/auth";

export const SYNC_SOURCES = ["calendar", "gmail", "outlook"] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];

export function isGoogleSyncSource(
	source: string,
): source is "calendar" | "gmail" {
	return source === "calendar" || source === "gmail";
}

export function isMicrosoftSyncSource(source: string): source is "outlook" {
	return source === "outlook";
}

export const SCOPE_FOR_SOURCE = {
	calendar: CALENDAR_SCOPE,
	gmail: GMAIL_SCOPE,
	outlook: OUTLOOK_MAIL_SCOPE,
} satisfies Record<SyncSource, string>;

export const PROVIDER_FOR_SOURCE = {
	calendar: GOOGLE_PROVIDER_ID,
	gmail: GOOGLE_PROVIDER_ID,
	outlook: MICROSOFT_PROVIDER_ID,
} satisfies Record<SyncSource, MailboxProviderId>;
