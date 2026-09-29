# S118 — production runbook (CC applies, under S118's authorisation)

One migration per section. Each: a dry run that must list **exactly one file**, the push, then
verification by object with every expected value stated. ⚠️ A mismatch is a **stop**.
Always last: relink to rebuild-test (`nmyphyhmfttxkdoposvf`) and read it back.

Method for expected `md5(prosrc)`: Postgres stores a function body exactly as written between its
dollar quotes, so each expected value below is `md5` of that text in the migration FILE
(`scratchpad/fnmd5.cjs`). Control: the same script reproduces all four R10 values already verified on
production (`cd98c2cc…`, `cde4b466…`, `675545c2…`, `03790772…`).

⚠️ rebuild-test holds EARLIER DRAFTS of two bodies (`get_sub_bid_request` `5b63188b…`,
`close_sub_bid_request` `881c81ac…`) that differ from the files only by `--` comment lines (diffed).
Production gets the files' bodies. `schema_fingerprint()` strips line comments before hashing, so the
final fingerprint must still equal the committed baseline.

## Item 4 — the stranded branches' four migrations

Branch tree: `feature/s118-acl-guard` (stacked on `feature/s118-bid-token-status`), rebased on main.

### Pre-check (production, read-only) — measured 2026-09-29
| value | expected | measured |
| --- | --- | --- |
| newest | `20262020000000` | `20262020000000` |
| ledger_total | `258` (= 262 files − these 4) | `258` |
| owed_present | `0` | `0` |
| md5 `get_sub_bid_request` | `c642b6e8b57864a67763f52e731b63fe` (the 20261240000000 body) | same |
| new functions (`bid_token_state`, `close_sub_bid_request`, `anon_execute_exposure`) | `0` | `0` |
| anon / authenticated EXECUTE `get_sub_bid_request` | false / true | false / true |
| fingerprint | policies 458 `4c627cb4…`, triggers 287 `4c7920f6…`, constraints 1017 `710ff1e9…` equal the baseline; functions **330** `a419e54a…` (baseline 333) | as stated |

Isolation: the push directory holds only the section's file among the four (the others moved out,
uncommitted, restored with `git checkout` after). `--include-all` because all four are older than
production's newest (`20262020000000`).

### §1 — `20261850000000_s112_bid_token_status`
Expected after: ledger row 1; md5 `get_sub_bid_request` = `58081a23e0965204635e2586403c8747`;
anon EXECUTE false, authenticated true (CREATE OR REPLACE keeps the lockdown's grants).

### §2 — `20261860000000_s112_bid_token_closure`
Expected after: ledger row 1; md5 `bid_token_state` = `2c549142bf0e64551801b9e11b4e52f7`;
`get_sub_bid_request` = `01e71e66f0edf01a01001147efc31514`; `close_sub_bid_request` =
`8584a71451343c110a0005d9dce38417`; `bid_token_state` SECURITY DEFINER, EXECUTE anon false /
authenticated false / service_role true; `close_sub_bid_request` INVOKER, anon false / authenticated
true.

### §3 — `20261890000000_s112_bid_winner_survives_conversion`
Expected after: ledger row 1; md5 `bid_token_state` = `4ad866c42c417ce764960834dc64d80a` (equals
rebuild-test's live value); grants unchanged from §2.

### §4 — `20261900000000_s112_anon_execute_guard`
Expected after: ledger row 1; md5 `anon_execute_exposure` = `79d76176b1f565f9e9d2d3868f74d9e2` (equals
rebuild-test); SECURITY DEFINER; EXECUTE anon false / authenticated false / service_role true;
`anon_execute_exposure()` returns exactly the 3 allowlisted functions.

### Final — the drift detector's view
`public.schema_fingerprint()` on production must equal the committed baseline
(`apps/web/lib/schema-fingerprint-baseline.json`, regenerated `aa015abd`): policies 458
`4c627cb4f3b361f4e9280067a2c154f2`, triggers 287 `4c7920f63724f4b0c054975e508c4e0a`, functions 333
`7497bfda26bce431bd9a2d7fdece1fe3`, constraints 1017 `710ff1e9e4ab072278e3eb671bddc26e`, latest
`20262020000000`; ledger_total 262.
