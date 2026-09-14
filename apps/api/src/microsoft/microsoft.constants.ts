import { OUTLOOK_MAIL_SCOPE } from "@crm/auth";

export const MICROSOFT_SYNC_SOURCES = ["outlook"] as const;
export type MicrosoftSyncSource = (typeof MICROSOFT_SYNC_SOURCES)[number];

export const SCOPE_FOR_SOURCE = {
	outlook: OUTLOOK_MAIL_SCOPE,
} satisfies Record<MicrosoftSyncSource, string>;
