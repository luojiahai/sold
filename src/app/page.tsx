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
      <div className="page-head">
        <div>
          <h1>Discovered listings</h1>
          <p className="lede">
            Australian property listings found on social media and confirmed by the
            detector. The rejected view is deliberately one click away — during
            validation, what the detector throws away is the more informative half.
          </p>
        </div>
      </div>

      <div className="stats" style={{ marginBottom: "var(--s5)" }}>
        <div className="stat">
          <b className="num">{stats.total}</b>
          <span>Posts collected</span>
        </div>
        <div className="stat ok">
          <b className="num">{stats.verified}</b>
          <span>AU listings</span>
        </div>
        <div className="stat">
          <b className="num">{stats.listingNotAu}</b>
          <span>Listing, not AU</span>
        </div>
        <div className="stat">
          <b className="num">{stats.notListing}</b>
          <span>Not a listing</span>
        </div>
        <div className="stat accent">
          <b className="num">
            {stats.detected > 0
              ? `${Math.round((stats.verified / stats.detected) * 100)}%`
              : "—"}
          </b>
          <span>Precision</span>
        </div>
      </div>

      <form className="toolbar" style={{ marginBottom: "var(--s4)" }}>
        <div className="field" style={{ flex: "3 1 240px" }}>
          <label htmlFor="q">Search</label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={filters.q}
            placeholder="Suburb, agency, handle, caption text…"
          />
        </div>
        <div className="field" style={{ flex: "1 1 140px" }}>
          <label htmlFor="view">View</label>
          <select id="view" name="view" defaultValue={view}>
            <option value="verified">Verified only</option>
            <option value="rejected">Rejected only</option>
            <option value="all">All detected</option>
          </select>
        </div>
        <div className="field" style={{ flex: "1 1 110px" }}>
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
        <div className="field" style={{ flex: "1 1 130px" }}>
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
        <button className="primary" type="submit">
          Apply
        </button>
      </form>

      <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--s3)" }}>
        <span className="small faint">
          {results.length > 0 && (
            <>
              Showing {results.length} post{results.length === 1 ? "" : "s"}
              {results.length === 120 && " (capped)"}
            </>
          )}
        </span>
      </div>

      {results.length === 0 ? (
        <div className="empty">
          <b>No posts match.</b>
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
                <div className="post-media">
                  {post.thumbnailPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="thumb"
                      src={`/api/media/${post.thumbnailPath}`}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="no-thumb">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="9" cy="9" r="1.6" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      no thumbnail cached
                    </div>
                  )}

                  <span className={`tag verdict ${verified ? "ok" : "bad"}`}>
                    {verified
                      ? (LISTING_TYPE_LABELS[post.listingType ?? ""] ?? "Listing")
                      : post.isListing
                        ? "Not AU"
                        : "Not a listing"}
                  </span>
                  <span className="conf">{post.confidence}%</span>
                </div>

                <div className="body">
                  {post.priceText && <div className="price">{post.priceText}</div>}

                  {post.suburb && (
                    <div className="row row-tight">
                      <span className="tag">
                        {post.suburb}
                        {post.state ? `, ${post.state}` : ""}
                      </span>
                    </div>
                  )}

                  <div className="caption">{post.text || <em>No caption</em>}</div>

                  <div className="foot">
                    <span className="handle">@{post.authorHandle ?? "unknown"}</span>
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
