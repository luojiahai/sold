import Link from "next/link";
import { detectorSpend, distinctValues, feedPosts, feedStats, verifiedByDay } from "./queries";
import { LISTING_TYPE_LABELS, money, relativeTime } from "./format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * What to show as the post's place.
 *
 * The verbatim address when the post wrote one, the locality when it didn't.
 * Off-market teasers withhold the street on purpose, so a card with only a
 * suburb is a normal result rather than a gap.
 */
function placeLabel(post: {
  addressText: string | null;
  suburb: string | null;
  state: string | null;
}): string | null {
  if (post.addressText) return post.addressText;
  if (!post.suburb) return null;
  return post.state ? `${post.suburb}, ${post.state}` : post.suburb;
}

/** Layout is a link, not client state, so a chosen view survives a reload. */
function layoutHref(filters: Record<string, string>, layout: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  params.set("layout", layout);
  return `/?${params.toString()}`;
}

function VerdictTag({ post }: { post: { isListing: boolean; isAustralia: boolean; listingType: string | null } }) {
  const verified = post.isListing && post.isAustralia;
  return verified ? (
    <span className="tag ok">{LISTING_TYPE_LABELS[post.listingType ?? ""] ?? "Listing"}</span>
  ) : (
    <span className="tag bad">{post.isListing ? "Not AU" : "Not a listing"}</span>
  );
}

export default async function FeedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = one(params.view) || "verified";
  const layout = one(params.layout) === "rows" ? "rows" : "cards";
  const filters = {
    view,
    state: one(params.state),
    listingType: one(params.listingType),
    q: one(params.q),
    hasAddress: one(params.hasAddress),
  };

  const results = feedPosts(filters);
  const stats = feedStats();
  const { states, types } = distinctValues();
  const undetected = stats.total - stats.detected;
  const precision =
    stats.detected > 0 ? Math.round((stats.verified / stats.detected) * 100) : null;
  // Segment widths are shares of everything collected, so the bar and the
  // "Collected" tile describe the same whole.
  const share = (n: number) => (stats.total > 0 ? (n / stats.total) * 100 : 0);

  const days = verifiedByDay(7);
  const peak = Math.max(1, ...days.map((d) => d.count));
  const week = days.reduce((n, d) => n + d.count, 0);
  const today = days[days.length - 1].count;
  const { spend, verdicts } = detectorSpend();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Discovered listings</h1>
          <p className="lede">
            Australian property found on social media and confirmed by the detector. The
            rejected view is one click away — during validation, what the detector throws
            away is the more informative half.
          </p>
        </div>
        <Link href="/runs" className="btn primary">
          Start harvest
        </Link>
      </div>

      <div className="bento">
        <div className="tile span-5">
          <div className="label">Precision</div>
          <div className="value">
            {precision === null ? "—" : `${precision}%`}
            <small>
              {stats.verified.toLocaleString("en-AU")} of {stats.detected.toLocaleString("en-AU")}{" "}
              detected
            </small>
          </div>
          <div
            className="verdict-bar"
            role="img"
            aria-label={`${stats.verified} AU listings, ${stats.listingNotAu} not AU, ${stats.notListing} not a listing, ${undetected} undetected`}
          >
            {stats.verified > 0 && <i className="v-ok" style={{ width: `${share(stats.verified)}%` }} />}
            {stats.listingNotAu > 0 && <i className="v-notau" style={{ width: `${share(stats.listingNotAu)}%` }} />}
            {stats.notListing > 0 && <i className="v-notlisting" style={{ width: `${share(stats.notListing)}%` }} />}
            {undetected > 0 && <i className="v-undetected" style={{ width: `${share(undetected)}%` }} />}
          </div>
          <div className="legend" aria-hidden="true">
            <span><i className="v-ok" />AU listings {stats.verified.toLocaleString("en-AU")}</span>
            <span><i className="v-notau" />Not AU {stats.listingNotAu.toLocaleString("en-AU")}</span>
            <span><i className="v-notlisting" />Not a listing {stats.notListing.toLocaleString("en-AU")}</span>
            <span><i className="v-undetected" />Undetected {undetected.toLocaleString("en-AU")}</span>
          </div>
        </div>

        <div className="tile span-3">
          <div className="label">AU listings</div>
          <div className="value">
            {stats.verified.toLocaleString("en-AU")}
            <small>{today > 0 ? `+${today} today` : `${week} in the last 7 days`}</small>
          </div>
          <div
            className="spark"
            role="img"
            aria-label={`${week} verified listings collected in the last 7 days`}
          >
            {days.map((d) => (
              <i
                key={d.day}
                title={`${d.day}: ${d.count}`}
                style={{ height: `${Math.max(6, (d.count / peak) * 100)}%` }}
              />
            ))}
          </div>
        </div>

        <div className="tile span-2">
          <div className="label">Collected</div>
          <div className="value">{stats.total.toLocaleString("en-AU")}</div>
          <div className="sub">
            {undetected === 0
              ? "every post has a verdict"
              : `${undetected.toLocaleString("en-AU")} awaiting a verdict`}
          </div>
        </div>

        <div className="tile span-2">
          <div className="label">Detector spend</div>
          <div className="value">{money(spend)}</div>
          <div className="sub">
            {verdicts === 0
              ? "no verdicts yet"
              : `${verdicts.toLocaleString("en-AU")} verdicts · ${money(spend / verdicts)} each`}
          </div>
        </div>
      </div>

      <form className="filters">
        <input type="hidden" name="layout" value={layout} />
        <div className="field grow">
          <label htmlFor="q" className="sr">Search</label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={filters.q}
            placeholder="Address, suburb, postcode, agency, handle, caption…"
          />
        </div>
        <div className="field fixed">
          <label htmlFor="view" className="sr">View</label>
          <select id="view" name="view" defaultValue={view} data-on={view !== "verified"}>
            <option value="verified">Verified only</option>
            <option value="rejected">Rejected only</option>
            <option value="all">All detected</option>
          </select>
        </div>
        <div className="field fixed">
          <label htmlFor="state" className="sr">State</label>
          <select id="state" name="state" defaultValue={filters.state} data-on={!!filters.state}>
            <option value="">State · any</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field fixed">
          <label htmlFor="listingType" className="sr">Type</label>
          <select
            id="listingType"
            name="listingType"
            defaultValue={filters.listingType}
            data-on={!!filters.listingType}
          >
            <option value="">Type · any</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {LISTING_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <label className="pill-check">
          <input
            type="checkbox"
            name="hasAddress"
            value="1"
            defaultChecked={filters.hasAddress === "1"}
          />
          Street address only
        </label>
        <button className="primary small" type="submit">
          Apply
        </button>
        <div className="spacer" />
        <div className="segmented">
          <Link href={layoutHref(filters, "cards")} data-on={layout === "cards"}>
            Cards
          </Link>
          <Link href={layoutHref(filters, "rows")} data-on={layout === "rows"}>
            Rows
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
      ) : layout === "cards" ? (
        <div className="feed">
          {results.map((post) => {
            const verified = post.isListing && post.isAustralia;
            const place = placeLabel(post);
            // The price is the headline when the post wrote one; the place
            // stands in when it didn't. Nothing here is derived — a card with
            // no price and no address says so rather than showing a guess.
            const headline = post.priceText ?? place;
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
                  <div className={`headline${headline ? "" : " dim"}`} title={headline ?? undefined}>
                    {headline ?? (verified ? "No price or address written" : `@${post.authorHandle ?? "unknown"}`)}
                  </div>
                  {verified ? (
                    // The place goes under a price headline. A missing price
                    // is the norm, not a finding, so it isn't announced; a
                    // missing address under a price is worth a word.
                    post.priceText && (
                      <div className="sub" title={place ?? undefined}>
                        {place ?? "No address written"}
                      </div>
                    )
                  ) : (
                    <div className="sub reason" title={post.reason ?? undefined}>
                      {post.reason ?? "No reason recorded"}
                    </div>
                  )}
                  <div className="caption">{post.text || <em>No caption</em>}</div>
                  <div className="verdict-line">
                    <VerdictTag post={post} />
                    {(post.propertyCount ?? 1) > 1 && (
                      <span
                        className="tag warn"
                        title="This post advertises several properties; the address shown is the first."
                      >
                        +{post.propertyCount! - 1} more
                      </span>
                    )}
                    <span className="conf" title={`${post.confidence}% confidence`}>
                      <i style={{ "--w": `${post.confidence}%` } as React.CSSProperties} />
                      {post.confidence}%
                    </span>
                  </div>
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
            <span className="hide-sm">Address</span>
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
                <span className="place hide-sm" title={placeLabel(post) ?? undefined}>
                  {placeLabel(post) ?? "—"}
                </span>
                <span className="hide-sm">
                  <VerdictTag post={post} />
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
