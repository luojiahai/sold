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
      <div className="page-head">
        <h1>Seed terms</h1>
        <p className="lede">
          Recall lives and dies by this list. Hashtags go through the recency surface and
          can honour a date cutoff; keywords go through ranked search and are best-effort.
          Yield columns fill in as runs complete, so terms that cost requests without
          returning listings become visible and prunable.
        </p>
      </div>

      <form action={addKeywords} className="filters">
        <div className="field grow">
          <label htmlFor="terms">Add terms — one per line or comma-separated</label>
          <textarea id="terms" name="terms" rows={2} placeholder="offmarket, presale, comingsoon" />
        </div>
        <div className="field fixed">
          <label htmlFor="kind">Kind</label>
          <select id="kind" name="kind" defaultValue="hashtag">
            <option value="hashtag">Hashtag</option>
            <option value="keyword">Keyword</option>
          </select>
        </div>
        <button className="primary" type="submit">
          Add
        </button>
      </form>

      {all.length === 0 ? (
        <div className="empty">
          <b>No seed terms.</b>
          Nothing will be collected until at least one term is enabled.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Term</th>
                <th>Kind</th>
                <th>Enabled</th>
                <th className="num">Runs</th>
                <th className="num">Seen</th>
                <th className="num">In range</th>
                <th className="num">New</th>
                <th className="num">Verified</th>
                <th className="num">Truncated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {all.map((keyword) => {
                const stats = yields.get(keyword.term);
                const wins = verified.get(keyword.term) ?? 0;
                return (
                  <tr key={keyword.id}>
                    <td className="nowrap">
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
                    <td className="num">{stats?.runs ?? 0}</td>
                    <td className="num">{stats?.postsSeen ?? 0}</td>
                    <td className="num">{stats?.postsInRange ?? 0}</td>
                    <td className="num">{stats?.postsNew ?? 0}</td>
                    <td className="num">
                      {wins > 0 ? <span className="tag ok">{wins}</span> : <span className="muted">0</span>}
                    </td>
                    <td className="num">
                      {stats && stats.truncated > 0 ? (
                        <span className="tag warn">{stats.truncated}×</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <form action={deleteKeyword} className="actions">
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
      )}
    </>
  );
}
