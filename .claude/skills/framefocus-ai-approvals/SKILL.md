---
name: framefocus-ai-approvals
description: Use when designing or implementing any AI-generated content (estimates, daily logs, weekly summaries, marketing copy, financial narratives, auto-tags). Codifies the "AI drafts, humans approve" rule and who can approve what.
---

# FrameFocus AI approval rules

## The rule

**AI drafts, humans approve.** Nothing client-facing or financially significant ships without human review. Build approval queues, not auto-publishing.

## Who approves what

| Content                                           | Required approver                  |
| ------------------------------------------------- | ---------------------------------- |
| Client-facing weekly project summaries            | **Owner only**                     |
| Marketing content (social posts, review emails)   | **Owner only**                     |
| AI-drafted financial narratives affecting billing | **Owner only**                     |
| AI line-item suggestions in estimates             | Owner or Admin                     |
| AI-drafted daily log summaries                    | Owner or Admin                     |
| AI punch-list proposals                           | Owner or Admin                     |
| AI anomaly flags                                  | Owner or Admin                     |
| AI photo auto-tags                                | **Auto-apply (no approval queue)** |

## Why auto-tags are the exception

Photo auto-tagging is internal organization, not client-facing. Tags are editable by any team member who can view the file. No approval queue needed.

## When building a new AI feature

Default: route through an approval queue. Before shipping auto-apply, confirm the output is:

1. Not visible to clients.
2. Not affecting billing, invoicing, payments, or financial records.
3. Easily edited or undone by any team member.

If all three are yes → auto-apply may be acceptable. Otherwise → approval queue, Owner-only or Admin-or-Owner per the table above.
