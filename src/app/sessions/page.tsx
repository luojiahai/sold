import { desc } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { relativeTime } from "../format";
import { activateSession, addSession, deleteSession, testSession } from "./actions";

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
      <h1>Platform sessions</h1>
      <p className="lede">
        The cookie collector authenticates as a burner Instagram account. Session death
        is the most common way a run fails, so test before you crawl rather than
        discovering it twenty minutes in.
      </p>

      {!hasActive && (
        <div className="banner warn">
          No active session. The Instagram collector cannot run until one is added and
          tested.
        </div>
      )}

      <div className="banner bad">
        <b>Terms of Use.</b> Collecting via burner-account cookies breaches Instagram&apos;s
        Terms of Use and risks account termination. Use throwaway accounts, keep the
        request pacing conservative, and treat the vendor-API collector as the path to
        anything beyond prototype validation.
      </div>

      <form action={addSession} className="card" style={{ marginBottom: 24 }}>
        <div className="grid" style={{ gap: 12 }}>
          <div style={{ maxWidth: 280 }}>
            <label htmlFor="label">Label</label>
            <input id="label" type="text" name="label" placeholder="burner-01" />
          </div>
          <div>
            <label htmlFor="cookies">
              Cookies — paste a raw <code>Cookie:</code> header or cookies.txt contents
            </label>
            <textarea
              id="cookies"
              name="cookies"
              rows={5}
              placeholder="sessionid=…; csrftoken=…; ds_user_id=…; mid=…; ig_did=…"
            />
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              In a logged-in Instagram tab: DevTools → Network → any request → Request
              Headers → copy the whole <code>Cookie</code> value. Either format is parsed;
              only <code>sessionid</code> is strictly required.
            </p>
          </div>
          <div>
            <button className="primary" type="submit">
              Add session
            </button>
          </div>
        </div>
      </form>

      {all.length === 0 ? (
        <div className="empty">No sessions configured.</div>
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
                    <div className="small muted mono">
                      sessionid …{session.sessionId.slice(-6)}
                    </div>
                  </td>
                  <td>
                    <span className={`tag ${STATUS_TONE[session.status] ?? ""}`}>
                      {session.status}
                    </span>
                  </td>
                  <td className="small muted">{session.statusDetail ?? "—"}</td>
                  <td className="small muted">
                    {session.lastCheckedAt ? relativeTime(session.lastCheckedAt) : "never"}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <form action={testSession}>
                        <input type="hidden" name="id" value={session.id} />
                        <button className="small" type="submit">
                          Test
                        </button>
                      </form>
                      {session.status !== "active" && (
                        <form action={activateSession}>
                          <input type="hidden" name="id" value={session.id} />
                          <button className="small" type="submit">
                            Activate
                          </button>
                        </form>
                      )}
                      <form action={deleteSession}>
                        <input type="hidden" name="id" value={session.id} />
                        <button className="small" type="submit">
                          Delete
                        </button>
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
