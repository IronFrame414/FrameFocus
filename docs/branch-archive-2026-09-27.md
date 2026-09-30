# Remote branch archive — 2026-09-27

Snapshot of every `origin/*` branch and its tip SHA, taken **before** the S180 branch-cleanup
deletion pass. Any deleted label can be restored with `git branch <name> <sha>` (or
`git push origin <sha>:refs/heads/<name>`). A branch contained in main has no unique commits;
deleting its label loses no work, only the pointer recorded here.

## ⚠️ Restorability caveat — reachable SHAs vs. reconstructed SHAs [Josh, S180]

The restore command above works **only while the recorded SHA is still reachable**. Two cases:

- **Contained-in-main branches (the 138 deleted in pass 1):** their commits live in main's history,
  so the archived SHAs stay reachable forever. Restore always works.
- **Reconstructed / not-contained branches:** their tip SHAs exist **nowhere in main's history**.
  Once the branch label is deleted, the objects become unreachable and GitHub will garbage-collect
  them; after that, `git branch <name> <sha>` **fails silently** and this archive entry is a dead
  restore command. This applies to `feature/s112-audit-rulings` (tip `07aa9b76`) and
  `feature/s112-amber-sweep` (tip `68bbb639`), which were **reconstructed** into wave2, not merged.
  **Before deleting either, their content was verified line-by-line to be fully present in main**
  (see "Pass 2 verification" below), so there is nothing unique left to restore — but the SHA-based
  restore command for these two will not work post-GC. Noted per Josh's instruction.

## Pass 2 verification — audit-rulings & amber-sweep (reconstructed into wave2)

Method per branch (not marker-sampling): `git diff origin/main...origin/feature/<b> --stat` gave the
full changed-file set; every added line was then checked for presence in main's version of that file.

| Branch | Files changed vs merge-base | Added lines absent from main | Verdict |
| --- | --- | --- | --- |
| `s112-audit-rulings` | 36 | 0 substantive (1 flagged: `{!canRead ? (` — present in main as `showsSummaries && !canRead ? null : !canRead ? (`, a superset from R5b) | fully subsumed → **deleted** |
| `s112-amber-sweep` | 42 | 0 substantive (same single flagged line, inherited from audit-rulings; all `#9d6506` amber sites matched) | fully subsumed → **deleted** |

The one flagged line in each is the `/m` CO office-notice gate (`data-testid="m-co-office-only"`,
`project.changes.officeOnly`), which main carries in an *extended* form that also handles R5b approved-CO
summaries. So nothing on either branch is absent from main; the flag was a textual artifact of main's
ternary dropping a leading brace.

**Counts (incl. `main`):** 161 refs — 141 contained in main, 20 not contained.
**Deletion pass targets:** 139 branches (contained in main, excluding `main` and the 4 protected).

Protected / kept (never deleted): `feature/s112-staletimes-hold`, `feature/s112-cdn-investigation`,
`feature/s112-catalog-importer`, `feature/s110-a-site-visit-access`, `feature/s180-merge-ruling`,
`feature/s180-branch-archive`, `main`.

| Branch | Tip SHA | Contained in main | Disposition |
| --- | --- | --- | --- |
| `backup/pre-email-deploy` | `cb2b6eefdae7` | yes | delete |
| `billing-into-settings-tip` | `8985b9896ec5` | yes | delete |
| `ci/shard-playwright` | `5c5756c6d7f1` | yes | delete |
| `codespace-effective-palm-tree-x5jv575j9gjj364j4` | `a885f762efa2` | yes | delete |
| `docs/context99` | `e90a5784360c` | yes | delete |
| `docs/latency-close-register` | `82a3d7544b2c` | yes | delete |
| `docs/m6m-hamburger-screens` | `4b01a112de05` | yes | delete |
| `docs/techdebt-157-chat-switcher-flake` | `2e3e9085585a` | yes | delete |
| `docs/tech-debt-s99` | `5d67ba8365a5` | yes | delete |
| `feat/chat` | `6081cb07248b` | yes | delete |
| `feat/ffnav-reindex` | `2619c598b0af` | yes | delete |
| `feat/module-5` | `494ecb2a496a` | yes | delete |
| `feat/module-6a-ui` | `6a3cd107a1f5` | yes | delete |
| `feat/module-6bcd-ui-specs` | `7d871cac2ee7` | yes | delete |
| `feat/module-6b-ui` | `305ffe466a43` | yes | delete |
| `feat/module-8-architecture` | `2cc49afb06b3` | yes | delete |
| `feat/notifications` | `2955d2112859` | yes | delete |
| `feat/notifications-architecture` | `2ab9d257f779` | yes | delete |
| `feat/roster-floor` | `7634ec6c6b1a` | yes | delete |
| `feat/signed-artifacts` | `22f139cdac71` | yes | delete |
| `feat/trial-screens-e2e` | `1057d363ae92` | yes | delete |
| `feat/ui-refresh` | `46869e3a7a7f` | yes | delete |
| `feature/113c-award-commitment-spec` | `ef08932989c8` | yes | delete |
| `feature/4d-revision` | `8e7da4f3d350` | yes | delete |
| `feature/7a-expenses-ui` | `798570bd873e` | yes | delete |
| `feature/7a-spec` | `512279fd6bb4` | yes | delete |
| `feature/7c-payables` | `12c73360e706` | yes | delete |
| `feature/7i-stage1-settings` | `f207a1af5493` | yes | delete |
| `feature/7i-stage2-m7-m9` | `f4c592872ce9` | yes | delete |
| `feature/auth-email-hook-headers` | `0d3ee172f85e` | yes | delete |
| `feature/billing-into-settings` | `1ec69aa04253` | yes | delete |
| `feature/card-at-signup` | `0bb53f2c6fd4` | yes | delete |
| `feature/company-email-required` | `527092b3e96d` | yes | delete |
| `feature/debt-runbook-s108` | `22b5fe042f09` | yes | delete |
| `feature/deletion-cron-live` | `80cadb4dc882` | yes | delete |
| `feature/desktop-redesign` | `726fca631922` | yes | delete |
| `feature/dry-run-warnings` | `adf3d02af859` | yes | delete |
| `feature/email-bounce-guard` | `0c45e97914dd` | yes | delete |
| `feature/estimating-4b-4c` | `0b48d5522af4` | yes | delete |
| `feature/full-audit` | `55c72c3d6bd4` | yes | delete |
| `feature/invitation-flow-four-defects` | `397430c9af68` | yes | delete |
| `feature/live-guard-key-verification` | `c8bf966b1a44` | yes | delete |
| `feature/live-suite-fixture-repair` | `229efcbc7158` | yes | delete |
| `feature/m6m-mobile` | `c47b3bc2153b` | yes | delete |
| `feature/m6m-mobile-pwa-spec` | `b20b5c538b04` | yes | delete |
| `feature/m7-compliance-profit-liens` | `d6de8b6c1cae` | yes | delete |
| `feature/module-4-estimates` | `88de2364eb36` | yes | delete |
| `feature/money-representation-spec` | `deb312318987` | yes | delete |
| `feature/m-visual-sweep` | `56f948d91799` | yes | delete |
| `feature/po-module` | `69f709ad4de7` | yes | delete |
| `feature/public-site-trial-conversion` | `16287ea1d911` | yes | delete |
| `feature/rebrand-ezcb` | `c604e07959cf` | yes | delete |
| `feature/register-backlog` | `28ac9ad056b8` | yes | delete |
| `feature/register-batch2` | `f7ef29474877` | yes | delete |
| `feature/register-closeout` | `680180d8df40` | yes | delete |
| `feature/s105b` | `2e3552f0f9e9` | yes | delete |
| `feature/s106` | `73c70139a2e0` | yes | delete |
| `feature/s107` | `09e6be8e54e8` | yes | delete |
| `feature/s108` | `35321af4ae78` | yes | delete |
| `feature/s108-a-site-visit` | `a36c89c95960` | yes | delete |
| `feature/s108-b-line-items` | `a6c4aa1da4a1` | yes | delete |
| `feature/s108-c-email-drift` | `a66bba7b1bc5` | yes | delete |
| `feature/s108-d-tooling` | `4dcc146b0be3` | yes | delete |
| `feature/s109-debt-159-163` | `a9a93f31bfd6` | yes | delete |
| `feature/s109-docs` | `9b4044521825` | yes | delete |
| `feature/s109-photo-regression` | `a2ba7d1e6401` | yes | delete |
| `feature/s110-a-site-visit-access` | `9e452c9cb007` | yes | PROTECTED — keep |
| `feature/s110-b-desktop-site-visits` | `de9094fc31c7` | yes | delete |
| `feature/s110-c-account-link` | `f6ec75f090f5` | yes | delete |
| `feature/s110-d-line-rows` | `423b9ab75712` | yes | delete |
| `feature/s110-docs` | `b4a5a11a32a2` | yes | delete |
| `feature/s110-e-carried-debt` | `8ebf5f742f36` | yes | delete |
| `feature/s110-f-route-guard` | `b624f58b0754` | yes | delete |
| `feature/s110-h-language` | `7a14fc28f111` | yes | delete |
| `feature/s110-site-visit-access` | `9df22efec9b5` | **no** | keep (not contained) |
| `feature/s111-docs` | `93556f7fe0ed` | yes | delete |
| `feature/s111-photos` | `d14db6629f3d` | yes | delete |
| `feature/s111-photos-harden` | `a4e038b53621` | yes | delete |
| `feature/s111-photo-thumbnails` | `d18c719b28d7` | yes | delete |
| `feature/s111-project-role` | `bd7982a282c0` | **no** | keep (not contained) |
| `feature/s112-amber-sweep` | `68bbb639c2ee` | **no** | keep (not contained) |
| `feature/s112-anon-lockdown` | `ad6cbddd3f46` | yes | delete |
| `feature/s112-audit-fixes` | `97a40dd8ce5a` | yes | delete |
| `feature/s112-audit-rulings` | `07aa9b76563b` | **no** | keep (not contained) |
| `feature/s112-bid-token-status` | `2313db6c69fd` | **no** | keep (not contained) |
| `feature/s112-catalog-importer` | `3ac6f7da793d` | **no** | PROTECTED — keep |
| `feature/s112-cdn-investigation` | `15f73548078c` | **no** | PROTECTED — keep |
| `feature/s112-claude-md-restructure` | `b999b7213dc9` | **no** | keep (not contained) |
| `feature/s112-co-summary` | `b781686876db` | **no** | keep (not contained) |
| `feature/s112-default-acl-guard` | `ff449cae6be8` | **no** | keep (not contained) |
| `feature/s112-display-size` | `0148071c73ee` | yes | delete |
| `feature/s112-files-and-upload` | `06482cc8b9ee` | **no** | keep (not contained) |
| `feature/s112-followup-docs` | `f580e695836d` | **no** | keep (not contained) |
| `feature/s112-heic-conversion` | `0f737cbfbfae` | **no** | keep (not contained) |
| `feature/s112-markup-local-display` | `a366d4e96352` | yes | delete |
| `feature/s112-m-audit` | `ca075f63785c` | yes | delete |
| `feature/s112-m-loading` | `72d603b3b5fb` | **no** | keep (not contained) |
| `feature/s112-overnight-2-report` | `6eda3f3f5bd0` | **no** | keep (not contained) |
| `feature/s112-overnight-report` | `7ffc0430ec4a` | yes | delete |
| `feature/s112-proposal-payload` | `2daf0d133ede` | **no** | keep (not contained) |
| `feature/s112-role-permission-maps` | `5fae38964156` | **no** | keep (not contained) |
| `feature/s112-router-staleness` | `e2e21cf99843` | yes | delete |
| `feature/s112-staletimes-hold` | `9b90115ad0ea` | **no** | PROTECTED — keep |
| `feature/s112-wave1-integration` | `6722cf47201e` | yes | delete |
| `feature/s112-wave2-integration` | `ac3a968096f6` | **no** | keep (not contained) |
| `feature/s136-email-and-debt` | `378b94e2ac44` | yes | delete |
| `feature/s143-void-guard-qb-reconcile` | `3bc425858190` | yes | delete |
| `feature/s145-7i-audit-subinbound` | `c7bb5e0e8f71` | yes | delete |
| `feature/s147b-company-leak-sweep` | `b9e9df382e3d` | yes | delete |
| `feature/s147-trial-screens-teardown` | `6b7bed77aad0` | yes | delete |
| `feature/s148-7g-quickbooks` | `bb94f9c067b7` | yes | delete |
| `feature/s149-7g-queue-webhooks` | `fe085fd27bce` | yes | delete |
| `feature/s150-audit-fixes` | `cc541be52a3f` | yes | delete |
| `feature/s151-retainage-m1-audit` | `cac4aff23113` | yes | delete |
| `feature/s152-m1-fixes` | `acc56cd6abe4` | yes | delete |
| `feature/s153-m2-audit` | `028e888e8015` | yes | delete |
| `feature/s154-m2-fixes` | `8cfbca6a2f9a` | yes | delete |
| `feature/s155-m3-m4-audit` | `d68ae67f8f66` | yes | delete |
| `feature/s157-m3-m4-fixes` | `c520f17e6545` | yes | delete |
| `feature/s159-subs-sheet-and-harness-fixes` | `8c88e2327f68` | yes | delete |
| `feature/s160-auth-email-hook` | `e3e4cd49a979` | yes | delete |
| `feature/s161-s162-m5-m6-audit` | `8f9652910aa6` | yes | delete |
| `feature/s163-m5-m6-fixes` | `833b9052b854` | yes | delete |
| `feature/s164-m9-client-portal` | `038314f9f26b` | yes | delete |
| `feature/s164-m9-slices-3-6` | `6fac4fd54788` | yes | delete |
| `feature/s165-ci-timeout` | `d6074e242dd0` | yes | delete |
| `feature/s165-limit1-sweep` | `fc10568c4500` | yes | delete |
| `feature/s165-m9-clicktest` | `33941a37fb47` | yes | delete |
| `feature/s166-battery-log` | `fa421fe02047` | yes | delete |
| `feature/s168-co-lifecycle-portal-split` | `85397dac845c` | yes | delete |
| `feature/s169-allowances-selections-spec` | `ef65f844d79a` | yes | delete |
| `feature/s170-allowance-row-type` | `9b44250e0691` | yes | delete |
| `feature/s171-selections-stages-2-4` | `96ed4dc3cba5` | yes | delete |
| `feature/s172-selections-amendments` | `6c4c986708c0` | yes | delete |
| `feature/s173-send-and-selections` | `65255209ab52` | yes | delete |
| `feature/s174-selections-email-and-markup` | `b12ddcea2526` | yes | delete |
| `feature/s175-clients-off-team` | `b38e9a8d0106` | yes | delete |
| `feature/s175-dialog-sweep` | `cd6bf38113e9` | yes | delete |
| `feature/s175-freeze-void-stage5` | `3bfd063fecc7` | yes | delete |
| `feature/s175-stage6-spec-sheet` | `8f85e79ea9be` | yes | delete |
| `feature/s180-merge-ruling` | `a4051c7911c4` | **no** | keep |
| `feature/self-name-edit` | `b0f0517100c8` | yes | delete |
| `feature/site-visit-finish-and-review` | `a57576762b43` | yes | delete |
| `feature/sub-visibility-ten-tables` | `9f64caf53324` | yes | delete |
| `feature/trial-lifecycle` | `06ed1de36d2e` | yes | delete |
| `feature/warming-quota-per-company` | `49fb52f158d0` | yes | delete |
| `fix/chat-mention-fixture-rename` | `1ec69aa04253` | yes | delete |
| `fix/ci-red` | `3227bced0b48` | yes | delete |
| `fix/client-contract-value-floor` | `6fc72ab7d976` | yes | delete |
| `fix/e2e-red-since-290` | `f35e1f5e90cb` | yes | delete |
| `fix/fixture-owner-name` | `e57486484b6c` | yes | delete |
| `fix/punch-gate-robustness` | `635241814a8d` | yes | delete |
| `fix/revert-shard-raise-cap` | `95cd84b0ff13` | yes | delete |
| `fix/s167-restore-m9-draft-co-fixture` | `29d70c4ba569` | yes | delete |
| `fix/signature-canvas-alpha` | `65d1088775ae` | yes | delete |
| `fix/v1-cwd-and-coverage` | `6a35be8f731b` | yes | delete |
| `main` | `80e15bad0900` | yes | keep |
| `merge-to-main` | `ce6efa883b28` | yes | delete |
| `origin` | `80e15bad0900` | yes | delete |
| `perf/shared-client-and-order` | `0b63de5d3ae8` | yes | delete |
| `spec/chat-s124` | `4b61b9dcfc42` | yes | delete |

## Pass 3 — S180 CI-wave cleanup (2026-09-27)

Branches whose work landed on main during the S180 CI wave, deleted after verification. Six are
true `--is-ancestor` of main (tips in main's history). Three (heic-conversion, proposal-payload,
role-permission-maps) were merged via rebased local copies, so their **origin tips are not
ancestors** — but each branch's contribution was verified **present in main and byte-identical**
(empty diff on its contribution files); the branch is *behind* main, not ahead. ⚠️ For those three,
the archived SHA becomes unreachable after deletion + GC (see the reachability caveat above); there
is nothing unique to restore since the content is in main.

| Branch | Tip SHA | Basis for deletion |
| --- | --- | --- |
| `feature/s112-claude-md-restructure` | `b999b721` | true ancestor of main |
| `feature/s112-files-and-upload` | `46c0f7b5` | true ancestor of main |
| `feature/s112-followup-docs` | `f580e695` | true ancestor of main |
| `feature/s112-overnight-2-report` | `6eda3f3f` | true ancestor of main |
| `feature/s112-wave2-integration` | `ac3a9680` | true ancestor of main |
| `feature/s180-merge-ruling` | `ab1af199` | true ancestor of main |
| `feature/s112-heic-conversion` | `3bde33d0` | content in main, byte-identical (tip not ancestor) |
| `feature/s112-proposal-payload` | `cbb054fd` | content in main, byte-identical (tip not ancestor) |
| `feature/s112-role-permission-maps` | `3d20737a` | content in main, byte-identical (tip not ancestor) |

## S121 (2026-09-30) — deleted, with proof

| Branch | Tip SHA | Basis for deletion |
| --- | --- | --- |
| `origin/feature/s112-bid-token-status` | `2313db6c` | FULLY SUPERSEDED: its 4 unique commits map 1:1 to main (`682a5c3b→67050a76`, `e2ee355f→83bce973`, `b99c41be→4e25f5ab`, `4078a08f→fcc40c37`; differences only S114's hotfix already on main); debt became #173/#174 (S121 report §7-C) |
| `origin/feature/s112-m-loading` | `72d603b3` | FULLY SUPERSEDED: shipped via `92c975ed` / merge `0de7b883`; `nav-pending.tsx` + its doc byte-identical to main (`git diff --quiet` exit 0); `loading.tsx` deliberately dropped on both |
| `origin/feature/s112-cdn-investigation` | `15f73548` | **Deleted by RULING [Josh, S121 ASK-36 — not CC's recommendation]:** a live harness (3 files, 627 lines — `apps/web/test/s112-cdn-probe.live.ts`, `s112-cdn-revocation.live.ts`, `s112-cdn-revocation-long.live.ts`) for a finding ruled "ACCEPTED RISK, CLOSED" (`docs/sessions/S180-report.md:243`, landed S121). **Recoverable from this SHA while it stays reachable** (see the reachability caveat above). |
| `origin/feature/s112-catalog-importer` | `3ac6f7da` | superseded by `scripts/import-cost-catalog.mjs` landed from `feature/s118-catalog-import` `f9dbfb5c` (S121 Part 6; range-diff `=`, same blobs) — deleted only once that is on main |

**Kept, and why:** `feature/s114-c5-multi-upload` (`6409738e`) — a STOP (S121 §1.6), left as reference
for `#181` (was `#1-s121lo`); `origin/feature/s112-staletimes-hold` (`9b90115a`) — assessed, not merged, Josh's call
(S121 §1.7); `feature/s118-catalog-import` (local `f9dbfb5c`, origin `cbd2c2c1`) — landed by cherry-pick,
deletable once Part 6 is on main.

