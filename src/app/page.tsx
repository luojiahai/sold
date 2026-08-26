import Link from "next/link";
import { distinctValues, feedPosts, feedStats } from "./queries";
import { LISTING_TYPE_LABELS, relativeTime } from "./format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Layout is a link, not client state, so a chosen view survives a reload. */
function layoutHref(filters: Record<string, string>, layout: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  params.set("layout", layout);
  return `/?${params.toString()}`;
}

export default async function FeedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = one(params.view) || "verified";
  const layout = one(params.layout) === "grid" ? "grid" : "rows";
  const filters = {
    view,
    state: one(params.state),
    listingType: one(params.listingType),
    q: one(params.q),
  };

  const results = feedPosts(filters);
  const stats = feedStats();
  const { states, types } = distinctValues();
  const undetected = stats.total - stats.detected;

  return (
    <>
      <div className="page-head">
        <h1>Discovered listings</h1>
        <p className="lede">
          Australian property found on social media and confirmed by the detector. The
          rejected view is deliberately one click away — during validation, what the
          detector throws away is the more informative half.
        </p>
      </div>

      <div className="stats">
        <div className="stat k-ok">
          <b>{stats.verified.toLocaleString("en-AU")}</b>
          <span>AU listings</span>
        </div>
        <div className="stat k-bad">
          <b>{stats.listingNotAu.toLocaleString("en-AU")}</b>
          <span>Not AU</span>
        </div>
        <div className="stat k-bad">
          <b>{stats.notListing.toLocaleString("en-AU")}</b>
          <span>Not a listing</span>
        </div>
        <div className="stat k-warn">
          <b>{undetected.toLocaleString("en-AU")}</b>
          <span>Undetected</span>
        </div>
        <div className="stat k-ok">
          <b>
            {stats.detected > 0
              ? `${Math.round((stats.verified / stats.detected) * 100)}%`
              : "—"}
          </b>
          <span>Precision</span>
        </div>
        <div className="stat">
          <b>{stats.total.toLocaleString("en-AU")}</b>
          <span>Collected</span>
        </div>
      </div>

      <form className="filters">
        <input type="hidden" name="layout" value={layout} />
        <div className="field grow">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={filters.q}
            placeholder="Suburb, agency, handle, caption text…"
          />
        </div>
        <div className="field fixed">
          <label htmlFor="view">View</label>
          <select id="view" name="view" defaultValue={view}>
            <option value="verified">Verified only</option>
            <option value="rejected">Rejected only</option>
            <option value="all">All detected</option>
          </select>
        </div>
        <div className="field fixed">
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
        <div className="field fixed">
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
        <div className="spacer" />
        <div className="segmented">
          <Link href={layoutHref(filters, "rows")} data-on={layout === "rows"}>
            Rows
          </Link>
          <Link href={layoutHref(filters, "grid")} data-on={layout === "grid"}>
            Grid
          </Link>
        </div>
      </form>

      {results.length === 0 ? (
        <div className="empty">
          <b>No posts match.</b>
          {stats.total === 0 ? (
            <>
              Nothing has been collected yet. <Link href="/runs">Start a harvest run</Link>.
            </>
          ) : (
            "Try widening the filters, or switch the view to “All detected”."
          )}
        </div>
      ) : layout === "grid" ? (
        <div className="feed">
          {results.map((post) => {
            const verified = post.isListing && post.isAustralia;
            return (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className={`post-card ${verified ? "k-ok" : "k-bad"}`}
              >
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
                  <div className="verdict-line">
                    {verified ? (
                      <span className="tag ok">
                        {LISTING_TYPE_LABELS[post.listingType ?? ""] ?? "Listing"}
                      </span>
                    ) : (
                      <span className="tag bad">
                        {post.isListing ? "Not AU" : "Not listing"}
                      </span>
                    )}
                    {post.suburb && (
                      <span className="tag place">
                        {post.suburb}
                        {post.state ? `, ${post.state}` : ""}
                      </span>
                    )}
                    <span className="tag mono conf">{post.confidence}%</span>
                  </div>

                  {post.priceText && <div className="price">{post.priceText}</div>}

                  <div className="caption">{post.text || <em>No caption</em>}</div>

                  <div className="meta">
                    <span>@{post.authorHandle ?? "unknown"}</span>
                    <span>{relativeTime(post.postedAt)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rows">
          <div className="head" aria-hidden="true">
            <span />
            <span>Caption</span>
            <span className="hide-sm">Suburb</span>
            <span className="hide-sm">Verdict</span>
            <span className="hide-sm">Price</span>
            <span className="num">Conf</span>
            <span className="num">Age</span>
          </div>
          {results.map((post) => {
            const verified = post.isListing && post.isAustralia;
            return (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className={`post-row ${verified ? "k-ok" : "k-bad"}`}
              >
                {post.thumbnailPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="thumb-xs"
                    src={`/api/media/${post.thumbnailPath}`}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="thumb-xs none">—</span>
                )}
                <span className="caption" title={post.text || undefined}>
                  {post.text || "No caption"}
                </span>
                <span className="place hide-sm">
                  {post.suburb
                    ? `${post.suburb}${post.state ? `, ${post.state}` : ""}`
                    : "—"}
                </span>
                <span className="hide-sm">
                  {verified ? (
                    <span className="tag ok">
                      {LISTING_TYPE_LABELS[post.listingType ?? ""] ?? "Listing"}
                    </span>
                  ) : (
                    <span className="tag bad">
                      {post.isListing ? "Not AU" : "Not listing"}
                    </span>
                  )}
                </span>
                <span className="price hide-sm">{post.priceText ?? "—"}</span>
                <span className="num">{post.confidence}%</span>
                <span className="num">{relativeTime(post.postedAt)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
