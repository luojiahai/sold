"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addSession, type AddSessionState } from "./actions";

/**
 * Submit button that reports progress.
 *
 * The session actions spawn a Python process and make a network round trip to
 * Instagram — 10-20 seconds is normal. Without a pending state the button looks
 * broken, which is exactly the wrong signal when the thing it is testing is
 * itself unreliable.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "small",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

const INITIAL: AddSessionState = { ok: null, message: "" };

export function AddSessionForm() {
  const [state, formAction] = useActionState(addSession, INITIAL);

  return (
    <form action={formAction} className="card" style={{ marginBottom: 16 }}>
      <div className="grid" style={{ gap: 12 }}>
        <div style={{ maxWidth: 260 }}>
          <label htmlFor="label">Label</label>
          <input id="label" type="text" name="label" placeholder="burner-01" />
        </div>
        <div>
          <label htmlFor="cookies">Cookies</label>
          <textarea
            id="cookies"
            name="cookies"
            rows={5}
            placeholder="sessionid=…; csrftoken=…; ds_user_id=…; mid=…; ig_did=…"
          />
          <p className="help">
            Paste a raw <code>Cookie:</code> header, a cookies.txt export, or just the{" "}
            <code>sessionid</code> value. In a logged-in Instagram tab: DevTools →
            Application → Cookies → instagram.com. The whole header beats{" "}
            <code>sessionid</code> alone — the extra cookies make the session look more
            like a real browser.
          </p>
        </div>

        {state.ok === false && (
          <div className="banner bad" style={{ margin: 0 }}>
            {state.message}
          </div>
        )}
        {state.ok === true && (
          <div className="banner ok" style={{ margin: 0 }}>
            {state.message}
          </div>
        )}

        <div>
          <SubmitButton className="primary" pendingLabel="Adding…">
            Add session
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
