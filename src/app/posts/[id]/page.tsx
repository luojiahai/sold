import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { detections, posts, runPosts } from "@/db/schema";
import { LISTING_TYPE_LABELS, money, relativeTime } from "../../format";

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

  return (
    <>
      <div className="page-head">
        <div>
          <p className="crumb">
            <Link href="/">← Feed</Link>
          </p>
          <h1>
            <span className="mono" style={{ fontSize: "inherit" }}>
              @{post.authorHandle ?? "unknown"}
            </span>
          </h1>
          <p className="lede">
            {relativeTime(post.postedAt)} ·{" "}
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              View on Instagram ↗
            </a>
          </p>
        </div>
      </div>

      <div className="detail-grid">
        <div className="panel">
          {post.thumbnailPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media/${post.thumbnailPath}`}
              alt=""
              style={{ width: "100%", display: "block" }}
            />
          ) : (
            <div className="no-thumb" style={{ aspectRatio: 1 }}>
              no thumbnail cached
            </div>
          )}
          <div className="panel-body small muted grid" style={{ gap: 4 }}>
            <div className="mono faint">{post.mediaType}</div>
            <div className="num">
              {post.likeCount ?? "—"} likes · {post.commentCount ?? "—"} comments
            </div>
            {post.locationName && <div>{post.locationName}</div>}
          </div>
        </div>

        <div>
          {latest && (
            <div className="panel" style={{ marginBottom: "var(--s4)" }}>
              <div className="panel-head">Latest verdict</div>
              <div className="panel-body">
                <div className="row row-tight" style={{ marginBottom: "var(--s3)" }}>
                  <span className={`tag ${latest.isListing ? "ok" : "bad"}`}>
                    {latest.isListing ? "Is a listing" : "Not a listing"}
                  </span>
                  <span className={`tag ${latest.isAustralia ? "ok" : "bad"}`}>
                    {latest.isAustralia ? "In Australia" : "Not Australia"}
                  </span>
                  <span className="tag num">{latest.confidence}% confidence</span>
                  {latest.viaFallback && <span className="tag warn">per-post fallback</span>}
                </div>

                <p style={{ margin: "0 0 var(--s3)" }}>{latest.reason}</p>

                <div className="row row-tight">
                  {latest.listingType && (
                    <span className="tag accent">
                      {LISTING_TYPE_LABELS[latest.listingType] ?? latest.listingType}
                    </span>
                  )}
                  {latest.suburb && (
                    <span className="tag">
                      {latest.suburb}
                      {latest.state ? `, ${latest.state}` : ""}
                    </span>
                  )}
                  {latest.priceText && <span className="tag">{latest.priceText}</span>}
                  {latest.agency && <span className="tag">{latest.agency}</span>}
                </div>
              </div>
            </div>
          )}

          <h2 style={{ marginTop: 0 }}>Caption</h2>
          <div className="card" style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>
            {post.text || <em className="faint">No caption</em>}
          </div>

          {post.hashtags.length > 0 && (
            <div className="row row-tight" style={{ marginTop: "var(--s3)" }}>
              {post.hashtags.map((tag) => (
                <span key={tag} className="tag">
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
                    <td className="small nw">{relativeTime(verdict.createdAt)}</td>
                    <td className="small mono">{verdict.detectorId}</td>
                    <td className="small mono faint">{verdict.model ?? "—"}</td>
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
                    <td className="num small">{money(verdict.costUsd ?? 0)}</td>
                    <td className="small muted">{verdict.reason}</td>
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
                    <td className="small mono">
                      <Link href={`/runs/${sighting.runId}`}>
                        {sighting.runId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="small">{sighting.term}</td>
                    <td className="small mono faint">{sighting.strategy}</td>
                    <td className="small">{sighting.isNew ? "yes" : "no"}</td>
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
