-- S109 #159 — `estimate_sub_bid_requests.sent_at` MEANS SENT.
-- [RULED Josh, 2026-09-23, ASK-159.A]
--
-- The column was `timestamptz DEFAULT now()` (20261230000000:41), so every row
-- was stamped at INSERT and read as "sent" before anything was mailed — the
-- bidding tab's `r.sent_at ? 'Resend' : 'Send'` could never reach 'Send'.
-- S107 B3b already made the send route stamp `sent_at` on a successful send
-- (`api/estimates/[id]/bid-requests/[requestId]/send/route.ts`); this is the
-- other half of that fix. Its siblings `viewed_at` and `submitted_at` are
-- already null-defaulted.
--
-- ⚠️ NO BACK-FILL, BY RULING. Production holds exactly one request and it was
-- really sent, so its stamp is true. Existing rows are left as they are.
--
-- ⚠️ `status DEFAULT 'sent'` IS LEFT ALONE, BY RULING (ASK-159.B). The UI shows
-- "not yet emailed" when `sent_at IS NULL` instead; `get_sub_bid_request`'s
-- sent → viewed transition depends on that status value.

ALTER TABLE estimate_sub_bid_requests ALTER COLUMN sent_at DROP DEFAULT;
