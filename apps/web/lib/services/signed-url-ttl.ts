/**
 * How long a `project-files` signed URL stays valid. [M3-04, S157, ruled by Josh]
 *
 * ⚠️ WHY THIS IS A CONSTANT AND NOT A LITERAL. `3600` was written out at seven
 * separate call sites — two services, four pages and the signed-URL route. A
 * duration that appears seven times is a duration that will be changed in six
 * places. The audit finding is about how long a grant survives after it is
 * revoked, so the number itself is the security property; it belongs in one
 * place.
 *
 * THE FINDING (S155 M3-04, proven LIVE): a signed URL is a BEARER TOKEN and
 * Supabase cannot revoke one. `s155-m3-audit.live.ts` F2 minted a URL as an
 * assigned crew member, revoked the assignment, and found that minting was
 * refused while the already-minted URL still served the file.
 *
 * THE RULING: two hours, and accept the window. Explicitly NOT a re-check of
 * authorisation when the URL is used — that would be a round trip on every
 * photo thumbnail and every PDF open, a permanent efficiency cost paid to close
 * a narrow risk. With M3-01 shipped, the remaining exposure is exactly one
 * person: someone who HAD legitimate access, lost it, and still holds a URL
 * minted in the last two hours.
 *
 * ⚠️ SAFE TO LENGTHEN OR SHORTEN ONLY AFTER RE-RUNNING THE SWEEP. A signed URL
 * that is EMBEDDED somewhere longer-lived than its TTL — an email body, a
 * stored column, a generated PDF — breaks silently when the TTL passes. The
 * S157 sweep found NO such embed: every `project-files` signed URL in the repo
 * is minted and consumed inside the same interaction, and the PDF templates
 * embed image BYTES as data-URIs (`co-data.ts` -> `imageDataUri`), never a URL.
 * If you add a surface that stores or mails one, that surface needs its own
 * duration and its own comment saying why.
 */
export const SIGNED_URL_TTL_SECONDS = 7200;
