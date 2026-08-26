import Link from "next/link";
import { distinctValues, feedPosts, feedStats } from "./queries";
import { LISTING_TYPE_LABELS, relativeTime } from "./format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function FeedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = one(params.view) || "verified";
  const filters = {
    view,
    state: one(params.state),
    listingType: one(params.listingType),
    q: one(params.q),
  };

  const results = feedPosts(filters);
  const stats = feedStats();
  const { states, types } = distinctValues();

  return (
    <>
      <h1>Discovered listings</h1>
      <p className="lede">
        Australian property listings found on social media and confirmed by the detector.
        The rejected view is deliberately one click away — during validation, what the
        detector throws away is the more informative half.
      </p>

      <div className="stats" style={{ marginBottom: 24 }}>
        <div className="stat">
          <b>{stats.total}</b>
          <span>Posts collected</span>
        </div>
        <div className="stat">
          <b>{stats.verified}</b>
          <span>AU listings</span>
        </div>
        <div className="stat">
          <b>{stats.listingNotAu}</b>
          <span>Listing, not AU</span>
        </div>
        <div className="stat">
          <b>{stats.notListing}</b>
          <span>Not a listing</span>
        </div>
        <div className="stat">
          <b>
            {stats.detected > 0
              ? `${Math.round((stats.verified / stats.detected) * 100)}%`
              : "—"}
          </b>
          <span>Precision</span>
        </div>
      </div>

      <form className="card" style={{ marginBottom: 20 }}>
        <div className="row">
          <div style={{ flex: "2 1 220px" }}>
            <label htmlFor="q">Search</label>
            <input
              id="q"
              type="text"
              name="q"
              defaultValue={filters.q}
              placeholder="Suburb, agency, handle, caption text…"
            />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label htmlFor="view">View</label>
            <select id="view" name="view" defaultValue={view}>
              <option value="verified">Verified only</option>
              <option value="rejected">Rejected only</option>
              <option value="all">All detected</option>
            </select>
          </div>
          <div style={{ flex: "1 1 110px" }}>
            <label htmlFor="state">State</label>
            <select id="state" name="state" defaultValue={filters.state}>
              <option value="">Any</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label htmlFor="listingType">Type</label>
            <select id="listingType" name="listingType" defaultValue={filters.listingType}>
              <option value="">Any</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {LISTING_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <button className="primary" type="submit">
              Apply
            </button>
          </div>
        </div>
      </form>

      {results.length === 0 ? (
        <div className="empty">
          <p style={{ margin: "0 0 6px" }}>
            <b>No posts match.</b>
          </p>
          <p className="small" style={{ margin: 0 }}>
            {stats.total === 0 ? (
              <>
                Nothing has been collected yet. <Link href="/runs">Start a harvest run</Link>.
              </>
            ) : (
              "Try widening the filters, or switch the view to “All detected”."
            )}
          </p>
        </div>
      ) : (
        <div className="feed">
          {results.map((post) => {
            const verified = post.isListing && post.isAustralia;
            return (
              <Link key={post.id} href={`/posts/${post.id}`} className="post-card">
                {post.thumbnailPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="thumb"
                    src={`/api/media/${post.thumbnailPath}`}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <div className="no-thumb">no thumbnail cached</div>
                )}
                <div className="body">
                  <div className="row" style={{ gap: 6 }}>
                    {verified ? (
                      <span className="tag ok">
                        {LISTING_TYPE_LABELS[post.listingType ?? ""] ?? "Listing"}
                      </span>
                    ) : (
                      <span className="tag bad">
                        {post.isListing ? "Not AU" : "Not a listing"}
                      </span>
                    )}
                    {post.suburb && (
                      <span className="tag">
                        {post.suburb}
                        {post.state ? `, ${post.state}` : ""}
                      </span>
                    )}
                    <span className="tag">{post.confidence}%</span>
                  </div>

                  {post.priceText && (
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{post.priceText}</div>
                  )}

                  <div className="caption">{post.text || <em>No caption</em>}</div>

                  <div
                    className="row small muted"
                    style={{ marginTop: "auto", justifyContent: "space-between", gap: 6 }}
                  >
                    <span>@{post.authorHandle ?? "unknown"}</span>
                    <span>{relativeTime(post.postedAt)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
