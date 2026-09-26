# S112 — `/bid/{token}`: status is read on every request

**Ruled [Josh, S112]:** the token proves who; the bid's CURRENT status decides whether. Cancelled or
withdrawn → refused at once. Submitted → still served. Expired → refused, as before.

## ⚠️ First: the app has NO way to cancel or decline a bid request

`estimate_sub_bid_requests.status` allows `sent, viewed, submitted, declined, expired, cancelled`,
and the `/bid` page has a "no longer open" card for `cancelled`/`declined`. **But no code path
writes either status.** `lib/services/sub-bid-requests-client.ts` has only create / list / send, and
the bidding tab's "Cancel" buttons close dialogs. So today a sub's invitation cannot be cancelled at
all: every token lives its full 14 days whatever Josh does. This fix makes status authoritative; a
**cancel action still has to be built** for it to reach a user (question for Josh).

There is no `withdrawn` status, and no `awarded` status on a request — an award is recorded per line
row in `estimate_award_bases` (question for Josh: what "until awarded" should key on).

## Production — read-only, for Josh to run first

```sql
-- Q1: live /bid tokens by status
SELECT r.status,
       count(*) AS tokens,
       count(*) FILTER (WHERE NOT r.is_deleted AND r.expires_at > now()) AS live_now,
       count(*) FILTER (WHERE NOT r.is_deleted AND r.expires_at > now()
         AND EXISTS (SELECT 1 FROM files f WHERE f.estimate_id = r.estimate_id AND f.company_id = r.company_id
                     AND NOT f.is_deleted AND f.created_by IS NOT NULL
                     AND NOT ('sub-bid-upload' = ANY (coalesce(f.tags, '{}'))))) AS live_with_scope_files,
       count(*) FILTER (WHERE NOT r.is_deleted AND r.expires_at > now()
         AND EXISTS (SELECT 1 FROM estimate_award_bases ab JOIN estimate_line_rows lr ON lr.id = ab.line_row_id
                     WHERE lr.line_item_id = r.line_item_id)) AS live_on_awarded_line,
       count(DISTINCT r.estimate_id) FILTER (WHERE NOT r.is_deleted AND r.expires_at > now()) AS estimates_reached
FROM estimate_sub_bid_requests r
GROUP BY r.status ORDER BY r.status;

-- Q2: what each live token reaches
SELECT r.status, c.name AS company, e.estimate_number, e.name AS estimate, e.status AS estimate_status,
       p.name AS project, count(*) AS live_tokens, max(r.expires_at) AS last_expiry,
       (SELECT count(*) FROM files f WHERE f.estimate_id = r.estimate_id AND NOT f.is_deleted
          AND f.created_by IS NOT NULL AND NOT ('sub-bid-upload' = ANY (coalesce(f.tags, '{}')))) AS scope_files
FROM estimate_sub_bid_requests r
JOIN estimates e ON e.id = r.estimate_id
JOIN companies c ON c.id = r.company_id
LEFT JOIN projects p ON p.source_estimate_id = e.id AND NOT p.is_deleted
WHERE NOT r.is_deleted AND r.expires_at > now()
GROUP BY r.status, c.name, e.estimate_number, e.name, e.status, p.name, r.estimate_id
ORDER BY (r.status IN ('sent','viewed')), c.name, e.estimate_number;
```

Both validated on rebuild-test (2 live tokens, both `sent`, EST-4311, 0 scope files). A cancelled or
declined row in Q1 with `live_now > 0` would be an active exposure — but see above: the app cannot
create one, so a non-zero number would mean a hand edit.

## Every endpoint behind the token — 4

| Endpoint | Before S112 | After |
| --- | --- | --- |
| `GET /api/bid/{token}/files` (scope documents, 300 s signed URLs) | deleted + expiry only | **+ status** (shared `resolveToken`) |
| `POST /api/bid/{token}/files` (sub upload) | deleted + expiry only | **+ status** (same resolver) |
| `get_sub_bid_request()` — the page's only read; `anon` may EXECUTE it directly | returned scope, message, **allowance**, estimate/line names and the sub's reply for ANY non-deleted token; the page hid them in a client component (payload still carried them) | closed or expired → only status, expiry, company |
| `submit_sub_bid_reply()` | refuses submitted / cancelled / declined / expired | unchanged |

## Proof — `apps/web/test/s112-bid-token-status.live.ts`, rebuild-test

| Case | BEFORE the fix | AFTER |
| --- | --- | --- |
| cancelled — GET files | 200, 1 file, URL fetched 200 | **403, 0 files, 0 fetched** |
| declined — GET files | 200, 1 file, URL fetched 200 | **403, 0 files, 0 fetched** |
| cancelled — POST upload | 200, 1 row written | **403, 0 rows** |
| cancelled — `get_sub_bid_request` as anon | scope text + allowance 12345 returned | **scope null, allowance null** |
| sent / viewed / submitted — GET (control) | 200, 1 file | 200, 1 file |
| sent — POST (control) | 200 | 200 |
| expired — GET | 410 | 410 |

4 red → 10/10 green. Older bid harnesses `s107-bid-upload-e2e` and `s109-bid-request-sent-at` still
pass (8/8). tsc 0; unit 120 files / 1,670 tests.

Migration `20261850000000_s112_bid_token_status.sql` applied to rebuild-test (SQL + history row,
CI idle). **Not on production.**
