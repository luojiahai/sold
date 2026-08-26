import { asc } from "drizzle-orm";
import { db } from "@/db";
import { keywords } from "@/db/schema";
import { addKeywords, deleteKeyword, toggleKeyword } from "./actions";
import { termYield, verifiedByTerm } from "./queries";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const all = db.select().from(keywords).orderBy(asc(keywords.kind), asc(keywords.term)).all();
  const yields = new Map(termYield().map((y) => [y.term, y]));
  const verified = verifiedByTerm();

  return (
    <>
      <h1>Seed terms</h1>
      <p className="lede">
        Recall lives and dies by this list. Hashtags go through the recency surface and
        can honour a date cutoff; keywords go through ranked search and are best-effort.
        Yield columns fill in as runs complete, so terms that cost requests without
        returning listings become visible and prunable.
      </p>

      <form action={addKeywords} className="card" style={{ marginBottom: 24 }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 400px" }}>
            <label htmlFor="terms">Add terms (one per line or comma-separated)</label>
            <textarea id="terms" name="terms" rows={2} placeholder="offmarket, presale, coomingsoon" />
          </div>
          <div style={{ flex: "0 0 150px" }}>
            <label htmlFor="kind">Kind</label>
            <select id="kind" name="kind" defaultValue="hashtag">
              <option value="hashtag">Hashtag</option>
              <option value="keyword">Keyword</option>
            </select>
          </div>
          <button className="primary" type="submit">
            Add
          </button>
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Term</th>
              <th>Kind</th>
              <th>Enabled</th>
              <th>Runs</th>
              <th>Seen</th>
              <th>In range</th>
              <th>New</th>
              <th>Verified</th>
              <th>Truncated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {all.map((keyword) => {
              const stats = yields.get(keyword.term);
              const wins = verified.get(keyword.term) ?? 0;
              return (
                <tr key={keyword.id}>
                  <td>
                    <b>{keyword.kind === "hashtag" ? `#${keyword.term}` : keyword.term}</b>
                  </td>
                  <td className="small muted">{keyword.kind}</td>
                  <td>
                    <form action={toggleKeyword}>
                      <input type="hidden" name="id" value={keyword.id} />
                      <button className="small" type="submit">
                        {keyword.enabled ? "on" : "off"}
                      </button>
                    </form>
                  </td>
                  <td>{stats?.runs ?? 0}</td>
                  <td>{stats?.postsSeen ?? 0}</td>
                  <td>{stats?.postsInRange ?? 0}</td>
                  <td>{stats?.postsNew ?? 0}</td>
                  <td>
                    {wins > 0 ? <span className="tag ok">{wins}</span> : <span className="muted">0</span>}
                  </td>
                  <td>
                    {stats && stats.truncated > 0 ? (
                      <span className="tag warn">{stats.truncated}×</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <form action={deleteKeyword}>
                      <input type="hidden" name="id" value={keyword.id} />
                      <button className="small" type="submit">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
