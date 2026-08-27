import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { detections, posts, runPosts } from "@/db/schema";
import {
  LISTING_TYPE_LABELS,
  formatParsedPrice,
  money,
  relativeTime,
} from "../../format";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const post = db.select().from(posts).where(eq(posts.id, id)).get();
  if (!post) notFound();

  // Every verdict, newest first — a re-run under a different detector adds a row
  // rather than replacing one, so competing verdicts stay comparable.
  const verdicts = db
    .select()
    .from(detections)
    .where(eq(detections.postId, id))
    .orderBy(desc(detections.createdAt))
    .all();

  const sightings = db.select().from(runPosts).where(eq(runPosts.postId, id)).all();
  const latest = verdicts[0];
  const verified = latest?.isListing && latest?.isAustralia;

  /**
   * Every extracted field, nulls included.
   *
   * The empty rows are the informative ones: extraction is strictly verbatim,
   * so "Postcode —" next to a caption that never wrote a postcode is the
   * detector behaving correctly, and this table beside the caption is where
   * that can actually be checked.
   */
  const extracted: Array<[string, string | null]> = latest
    ? [
        ["Address (as written)", latest.addressText],
        ["Unit", latest.unit],
        ["Street number", latest.streetNumber],
        ["Street", latest.street],
        ["Suburb", latest.suburb],
        ["State", latest.state],
        ["Postcode", latest.postcode],
        ["Properties in post", latest.propertyCount?.toLocaleString("en-AU") ?? null],
        ["Price (as written)", latest.priceText],
        ["Price parsed", formatParsedPrice(latest)],
        ["Agency", latest.agency],
      ]
    : [];

  return (
    <>
      <p className="backlink">
        <Link href="/">← Feed</Link>
      </p>
      <div className="page-head">
        <h1>@{post.authorHandle ?? "unknown"}</h1>
        <p className="lede">
          {relativeTime(post.postedAt)} ·{" "}
          <a href={post.url} target="_blank" rel="noopener noreferrer">
            View on Instagram ↗
          </a>
        </p>
      </div>

      <div className="detail">
        <div className="media">
          {post.thumbnailPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${post.thumbnailPath}`} alt="" />
          ) : (
            <div className="no-thumb" style={{ aspectRatio: 1 }}>
              no thumbnail cached
            </div>
          )}
          <div className="facts">
            <div>{post.mediaType}</div>
            <div>
              {post.likeCount ?? "—"} likes · {post.commentCount ?? "—"} comments
            </div>
            {post.locationName && <div>Tagged {post.locationName}</div>}
          </div>
        </div>

        <div>
          {latest && (
            <div className={`verdict ${verified ? "k-ok" : "k-bad"}`}>
              <div className="row" style={{ gap: 4 }}>
                <span className={`tag ${latest.isListing ? "ok" : "bad"}`}>
                  {latest.isListing ? "Is a listing" : "Not a listing"}
                </span>
                <span className={`tag ${latest.isAustralia ? "ok" : "bad"}`}>
                  {latest.isAustralia ? "In Australia" : "Not Australia"}
                </span>
                <span className="tag mono">{latest.confidence}% confidence</span>
                {latest.viaFallback && <span className="tag warn">per-post fallback</span>}
                {latest.listingType && (
                  <span className="tag">
                    {LISTING_TYPE_LABELS[latest.listingType] ?? latest.listingType}
                  </span>
                )}
                {(latest.addressText || latest.suburb) && (
                  <span className="tag">
                    {latest.addressText ??
                      `${latest.suburb}${latest.state ? `, ${latest.state}` : ""}`}
                  </span>
                )}
                {(latest.propertyCount ?? 1) > 1 && (
                  <span className="tag warn">
                    {latest.propertyCount} properties — address is the first
                  </span>
                )}
                {latest.priceText && <span className="tag mono">{latest.priceText}</span>}
                {latest.agency && <span className="tag">{latest.agency}</span>}
              </div>
              <p>{latest.reason}</p>
            </div>
          )}

          <h2 style={{ marginTop: latest ? undefined : 0 }}>Caption</h2>
          <div className="caption-block">
            {post.text || <em className="muted">No caption</em>}
          </div>

          {latest && (
            <>
              <h2>Extracted</h2>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {extracted.map(([label, value]) => (
                      <tr key={label}>
                        <td className="nowrap">{label}</td>
                        <td className={value ? "mono" : "mono muted"}>{value ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {post.hashtags.length > 0 && (
            <div className="row" style={{ gap: 4, marginTop: 12 }}>
              {post.hashtags.map((tag) => (
                <span key={tag} className="tag mono">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <h2>Detection history</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Detector</th>
                  <th>Model</th>
                  <th>Prompt</th>
                  <th>Listing</th>
                  <th>AU</th>
                  <th className="num">Conf.</th>
                  <th className="num">Cost</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {verdicts.map((verdict) => (
                  <tr key={verdict.id}>
                    <td className="nowrap">{relativeTime(verdict.createdAt)}</td>
                    <td className="mono">{verdict.detectorId}</td>
                    <td className="mono">{verdict.model ?? "—"}</td>
                    <td className="mono">v{verdict.promptVersion}</td>
                    <td>
                      <span className={`tag ${verdict.isListing ? "ok" : "bad"}`}>
                        {verdict.isListing ? "yes" : "no"}
                      </span>
                    </td>
                    <td>
                      <span className={`tag ${verdict.isAustralia ? "ok" : "bad"}`}>
                        {verdict.isAustralia ? "yes" : "no"}
                      </span>
                    </td>
                    <td className="num">{verdict.confidence}%</td>
                    <td className="num">{money(verdict.costUsd ?? 0)}</td>
                    <td className="small">{verdict.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Provenance</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Term</th>
                  <th>Strategy</th>
                  <th>First sighting</th>
                </tr>
              </thead>
              <tbody>
                {sightings.map((sighting) => (
                  <tr key={`${sighting.runId}-${sighting.term}`}>
                    <td className="mono">
                      <Link href={`/runs/${sighting.runId}`}>{sighting.runId.slice(0, 8)}</Link>
                    </td>
                    <td>{sighting.term}</td>
                    <td className="mono">{sighting.strategy}</td>
                    <td>{sighting.isNew ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
