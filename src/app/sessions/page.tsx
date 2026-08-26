import { desc } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { relativeTime } from "../format";
import { activateSession, deleteSession, testSession } from "./actions";
import { AddSessionForm, SubmitButton } from "./session-ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  active: "ok",
  expired: "bad",
  challenged: "bad",
  untested: "warn",
};

export default async function SessionsPage() {
  const all = db.select().from(sessions).orderBy(desc(sessions.createdAt)).all();
  const hasActive = all.some((s) => s.status === "active");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Platform sessions</h1>
          <p className="lede">
            The cookie collector authenticates as a burner Instagram account. Session
            death is the most common way a run fails, so test before you crawl rather than
            discovering it twenty minutes in.
          </p>
        </div>
        <span className={`tag ${hasActive ? "ok" : "warn"}`}>
          {hasActive ? "session active" : "no active session"}
        </span>
      </div>

      {!hasActive && (
        <div className="banner warn">
          <b>No active session.</b> The Instagram collector cannot run until one is added
          and tested.
        </div>
      )}

      <div className="banner bad">
        <b>Terms of Use.</b> Collecting via burner-account cookies breaches
        Instagram&apos;s Terms of Use and risks account termination. Use throwaway
        accounts, keep the request pacing conservative, and treat the vendor-API collector
        as the path to anything beyond prototype validation.
      </div>

      <AddSessionForm />

      {all.length === 0 ? (
        <div className="empty">
          <b>No sessions configured.</b>
          <p className="small" style={{ margin: 0 }}>
            Paste a logged-in Instagram <code>Cookie</code> header above to add one.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Status</th>
                <th>Detail</th>
                <th>Checked</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {all.map((session) => (
                <tr key={session.id}>
                  <td>
                    <b>{session.label}</b>
                    <div className="small faint mono">
                      sessionid …{session.sessionId.slice(-6)}
                    </div>
                  </td>
                  <td>
                    <span className={`tag ${STATUS_TONE[session.status] ?? ""}`}>
                      {session.status}
                    </span>
                  </td>
                  <td className="small muted">{session.statusDetail ?? "—"}</td>
                  <td className="small faint">
                    {session.lastCheckedAt ? relativeTime(session.lastCheckedAt) : "never"}
                  </td>
                  <td>
                    <div className="row row-tight">
                      <form action={testSession}>
                        <input type="hidden" name="id" value={session.id} />
                        <SubmitButton pendingLabel="Testing…">Test</SubmitButton>
                      </form>
                      {session.status !== "active" && (
                        <form action={activateSession}>
                          <input type="hidden" name="id" value={session.id} />
                          <SubmitButton pendingLabel="Activating…">Activate</SubmitButton>
                        </form>
                      )}
                      <form action={deleteSession}>
                        <input type="hidden" name="id" value={session.id} />
                        <SubmitButton className="small danger" pendingLabel="Deleting…">
                          Delete
                        </SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
