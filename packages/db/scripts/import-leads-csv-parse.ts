export function stripBom(text: string): string {
	if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
	return text;
}

export function parseCsvRecords(text: string): string[][] {
	const input = stripBom(text);
	const records: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	for (let index = 0; index < input.length; index++) {
		const char = input[index];

		if (inQuotes) {
			if (char === '"') {
				if (input[index + 1] === '"') {
					field += '"';
					index++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			continue;
		}
		if (char === ",") {
			row.push(field);
			field = "";
			continue;
		}
		if (char === "\r") {
			if (input[index + 1] === "\n") index++;
			row.push(field);
			field = "";
			if (row.length > 1 || row[0] !== "" || records.length > 0) {
				records.push(row);
			}
			row = [];
			continue;
		}
		if (char === "\n") {
			row.push(field);
			field = "";
			if (row.length > 1 || row[0] !== "" || records.length > 0) {
				records.push(row);
			}
			row = [];
			continue;
		}

		field += char;
	}

	row.push(field);
	if (row.length > 1 || row[0] !== "" || records.length > 0) {
		records.push(row);
	}

	if (inQuotes) {
		throw new Error("CSV has an unclosed quoted field.");
	}

	return records;
}

export async function readTextFile(path: string): Promise<string> {
	return Bun.file(path).text();
}
