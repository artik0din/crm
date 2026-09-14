"use client";

import { CONTEXT_DEV_SIGNUP_URL } from "@crm/db/settings";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function ResearchForm() {
	const trpc = useTRPC();
	const router = useRouter();

	const keyId = useId();

	const leave = () => {
		router.refresh();
		router.replace("/");
	};

	const save = useMutation(
		trpc.settings.setResearchKey.mutationOptions({
			onSuccess: leave,
			onError: (error) => toast.error(error.message),
		}),
	);

	const skip = useMutation(
		trpc.settings.skipResearchKey.mutationOptions({
			onSuccess: leave,
			onError: (error) => toast.error(error.message),
		}),
	);

	const busy = save.isPending || skip.isPending;

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				save.mutate({ apiKey: String(form.get("apiKey") ?? "").trim() });
			}}
			className="flex flex-col gap-6"
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={keyId}>Context API key</FieldLabel>
					<Input
						id={keyId}
						name="apiKey"
						type="password"
						placeholder="Paste the key"
						autoComplete="off"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						autoFocus
						required
					/>
					<FieldDescription>
						Don't have a Context API key?{" "}
						<a
							href={CONTEXT_DEV_SIGNUP_URL}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-4 hover:text-foreground"
						>
							Sign up here
						</a>
					</FieldDescription>
				</Field>
			</FieldGroup>

			<div className="flex flex-col gap-3">
				<Button type="submit" disabled={busy}>
					{save.isPending ? <Spinner data-icon="inline-start" /> : null}
					Continue
				</Button>
				<Button
					type="button"
					variant="secondary"
					disabled={busy}
					onClick={() => skip.mutate()}
				>
					{skip.isPending ? <Spinner data-icon="inline-start" /> : null}
					Continue without Context
				</Button>
				<FieldDescription>
					Automatic research stays off. Add a key later in Settings → General.
				</FieldDescription>
			</div>
		</form>
	);
}
