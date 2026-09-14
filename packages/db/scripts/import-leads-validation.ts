export type StrictIntResult =
	| { ok: true; value: number }
	| { ok: false; reason: "empty" | "invalid" };

export function parseStrictSignedInteger(raw: string): StrictIntResult {
	const trimmed = raw.trim();
	if (!trimmed) return { ok: false, reason: "empty" };
	if (!/^-?\d+$/.test(trimmed)) return { ok: false, reason: "invalid" };
	const value = Number(trimmed);
	if (!Number.isSafeInteger(value)) return { ok: false, reason: "invalid" };
	return { ok: true, value };
}

export type CalendarDateResult =
	| { ok: true; value: string }
	| { ok: false; reason: "empty" | "invalid" };

export function parseCalendarDate(raw: string): CalendarDateResult {
	const trimmed = raw.trim();
	if (!trimmed) return { ok: false, reason: "empty" };
	const dateOnly = trimmed.slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
		return { ok: false, reason: "invalid" };
	}
	const year = Number(dateOnly.slice(0, 4));
	const month = Number(dateOnly.slice(5, 7));
	const day = Number(dateOnly.slice(8, 10));
	const probe = new Date(Date.UTC(year, month - 1, day));
	if (
		probe.getUTCFullYear() !== year ||
		probe.getUTCMonth() !== month - 1 ||
		probe.getUTCDate() !== day
	) {
		return { ok: false, reason: "invalid" };
	}
	return { ok: true, value: dateOnly };
}
