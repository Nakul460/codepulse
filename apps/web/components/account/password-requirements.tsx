"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { PASSWORD_REQUIREMENTS } from "@/lib/password-policy";

/**
 * The live password-policy checklist.
 *
 * It renders the exact `PASSWORD_REQUIREMENTS` array that `lib/password-policy.ts`
 * enforces server-side (and that `lib/auth.ts` installs into better-auth's
 * `password.hash` funnel), so the checklist cannot drift from the rule that
 * actually rejects the password. The form still submits whatever the user typed
 * and surfaces the server's message on failure: this is guidance, not a gate, and
 * treating it as a gate would make the UI the only thing deciding whether a
 * password is acceptable.
 */
export function PasswordRequirements({ password }: { password: string }) {
  // Nothing typed yet: show the rules unfilled rather than a wall of red X, which
  // reads as "you are already wrong" before the user has typed anything.
  const untouched = password.length === 0;

  return (
    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
      {PASSWORD_REQUIREMENTS.map((requirement) => {
        const met = requirement.test(password);

        return (
          <li key={requirement.id} className="flex items-center gap-1.5">
            {untouched ? null : met ? (
              <CheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <XIcon className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <span className={met && !untouched ? "text-foreground" : undefined}>
              {requirement.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
