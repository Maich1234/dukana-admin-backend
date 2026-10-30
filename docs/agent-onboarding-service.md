# Agent training and onboarding

Optional one-time manual collection: KES 1,000, independent of subscriptions, commissions and payouts. Existing rows have no payment record and are not automatically considered in debt. This records money already received; it does not initiate M-Pesa or transfer funds.

Assigned agents can record training completion, attendee count, number of products entered, topics, notes and next follow-up. The product count is agent-reported, not a claim about live inventory. Owners can upload actual stock through the shop web application's spreadsheet import.

Payment amount/currency/collector come from the server. Conditional writes recheck the assigned agent and missing payment; identical retries return the existing record, differing submissions cannot overwrite it. Payment method and nonempty reference are uniquely indexed across onboarding records. Training uses updatedAt compare-and-set to reject stale edits/reassignment. Admins can read records. Records with training, payment or linked shops cannot be deleted by the ordinary lead deletion route.

Apply schema indexes using the project's existing index maintenance process before enabling collection recording. No live collection or payment migration was run.

Validation completed: application module load, Joi cash/reference/date/amount boundaries, web TypeScript and production build. Review only, not executed against MongoDB: simultaneous collections, unique-reference enforcement and training/reassignment races. Local MongoDB cannot start; source upload to Vercel QA sandbox was rejected by automatic approval review. Keep the PR draft until these checks and the signed-in agent browser walkthrough pass.
