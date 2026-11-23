# Aerie checkout and access

This Azure Functions app lets a player buy the **Support the Founder** digital-access pass for themselves and receive one one-use gift. Lake Winnipesaukee is public. An approved, disclosed social post or confirmation that the player shared Aerie with a friend grants Moosehead Lake, Horseshoe Bend, Lac Berté, Alaska and Acadia by default. Nothing here creates a Stripe product, charges a card, or configures production.

## Test the checkout

Run `npm ci` and `npm test` with Node.js 22 or later. The tests use the official Stripe SDK to verify synthetic webhook signatures. Payment responses, inbox, storage and downloads in the test suite are synthetic. To test Apple Pay and Google Pay specifically, run the Stripe sandbox checkout from physical iPhone and Android devices, verify the signed webhook and return link, then redeem the gift from a second email address. This device and external endpoint test needs actual sandbox and Azure configuration.

1. Create a one-time USD Price in a Stripe sandbox on a product named **Support the Founder — Aerie + one gift copy**. The ticket and gift copy cost $1.99 USD. Set the appropriate digital game tax category on the Product and tax behavior on the Price. The hosted checkout enables Stripe Tax and collects billing details. Configure Stripe Tax registrations for the production seller before activation. Set the live Price only after the owner confirms it.
2. Allow the eligible card and wallet methods in the Stripe Dashboard. Stripe Checkout handles Apple Pay and Google Pay presentation based on the device and payment settings. Use the Dashboard payment-method review with the actual currency, eligibility and tax setup.
3. Create a Stripe webhook endpoint for `https://<Aerie origin>/api/aerie/stripe/webhook`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.funds_withdrawn` and `charge.dispute.closed`. Store its signing secret in the function app. Use separate Azure and Stripe sandbox settings for test and live.
4. Publish `commerce/` as a standalone Azure Functions v4 app with managed identity. Keep `/api/aerie/` on the same browser origin as the flight app. Azure Static Web Apps Standard can [link the Functions app](https://learn.microsoft.com/en-us/azure/static-web-apps/functions-bring-your-own). Managed Functions on the Free tier do not support managed identity for this backend. An existing first-party HTTPS reverse proxy can also route the API. For a local sandbox, serve the frontend and proxy the API under one localhost origin.
5. Create the private Table Storage table, private paid asset container and sender. Assign the function identity Table Storage Data Contributor on the commerce table, permission to obtain a user-delegation key at storage-account scope and read access on the paid container, and Azure Communication Services permission to send email using the verified sender. Run `python3 tools/prepare_paid_worlds.py path/to/dist path/to/private-assets` against a generated Azure game build. It puts the paid flight entry files in `<private-assets>/<world>/<entry file>` and enables required access in the generated page. Upload the private tree before deploying that page. Configure Blob CORS for the game origin's reads and test the returned redirects from the actual origin. URLs contain a read-only token that expires after 15 minutes. Keep future paid entry files in private release storage. Previous public builds and repository assets remain accessible where they were published.

## Publish the commerce Function

After merging and signing in to Azure CLI, run `python3 commerce/tools/deploy_functions.py deploy <full-commit-sha> --mode test` from the repository. Select the mode already intended for the site. The command tests the merged source, packages Linux-readable files and directories, uploads to Aerie’s Flex Consumption app, and waits for both public hosts to serve that exact revision’s checkout offer and free-player access. It also verifies the indexed HTTP functions and receipt timer. A failed health check exits nonzero even after Azure accepts the ZIP. Check the deployment and trigger logs before retrying.

For a local package, run `python3 commerce/tools/deploy_functions.py package <full-commit-sha> /tmp/aerie-commerce.zip`. To check an existing release without uploading, use `verify <full-commit-sha> --mode test` in place of `deploy`. Both commands accept `--checkout-paused` to verify a release while sales are intentionally closed. This flag changes the expected health result only.

## Sell with a Stripe Dashboard Payment Link

The Function can fulfill a fixed $1.99 Payment Link without a Stripe API credential. Configure the live Aerie price with quantity one, automatic tax, and the post-payment redirect `https://playaerie.com/join/return/#session={CHECKOUT_SESSION_ID}`. Use the merchant's own-account snapshot webhook at `https://playaerie.com/api/aerie/stripe/webhook`. Subscribe it to the checkout and reversal events below plus `payment_link.updated` (and optionally `payment_link.created`).

Stage the Function with checkout paused. Set `AERIE_STRIPE_MODE=live`, `AERIE_TICKET_PRICE_CENTS=199`, the live `AERIE_STRIPE_PRICE_ID`, `AERIE_STRIPE_PAYMENT_LINK_ID`, `AERIE_STRIPE_PAYMENT_LINK_URL`, and the Aerie destination's own `AERIE_STRIPE_WEBHOOK_SECRET` Key Vault reference. Clear the sandbox API-key reference when switching to live.

Inspect the hosted buyer page for the ticket, amount and merchant branding. Check the live seller and expected tax registrations in the Dashboard. Save the verified link or resend its signed configuration event. Both public hosts should report `checkoutProvider: "payment_link"` and `checkoutLinkVerified: true` at `/api/aerie/config`. The latter confirms delivery of a matching signed link configuration. Stripe normally omits line items from this event, so verify the exact price on the saved link. Enable checkout and run the deployment health verifier for the merged revision. An actual paid event grants the purchaser's worlds and one gift. Signed refunds and disputes continue to apply when checkout is paused.

Set `AERIE_STRIPE_CHECKOUT_PROVIDER=api` to switch new buyers to API-created sessions with the merchant name **Aeria**. The game and ticket remain **Aerie**. Keep the existing Payment Link ID, URL, and signing secret so its earlier purchases, gifts, refunds, and disputes continue to work. Configure the live API key and confirm its access to the same seller, price and endpoint before enabling purchases. The public config's `checkoutProvider` identifies the route for new buyers, and `checkoutLinkVerified` refers to the configured Dashboard link.

## Check live payment readiness

From `commerce/`, run `npm ci`, sign in to Azure CLI with access to the Aerie Function configuration and Key Vault, and supply the intended Stripe merchant account ID.

```sh
npm run preflight -- --mode live --account "$AERIE_SELLER_ACCOUNT"
```

The command reads the selected mode’s Aerie API key and webhook secret from `kv-playaerie-prod`. It reads the running Function’s price settings and finds the matching Aerie product when preparing a different mode. If multiple prices match, add `--price price_…`. The report shows the effective $1.99 ticket, seller capabilities, webhook events and Stripe Tax setup. Confirm the expected active registration locations with `--registrations US-ME,CA-QC` (example) or `--registrations none` if the seller expects none. An omitted confirmation or unavailable check produces a nonzero exit status.

If the checkout key has limited permissions, `--audit` uses the optional `stripe-live-preflight-read-key` or `stripe-sandbox-preflight-read-key` in the same vault for account, product, price, webhook and tax reads. `configurationVerified` reports the read-only configuration checks. Verify the endpoint subscribes to the seven purchase and reversal events and `checkout.session.expired`.

The smoke creates one unopened $1.99 Checkout Session and expires it unpaid. Stripe sends an expiry event for that session. Use `--mode test --smoke` for a sandbox exercise. For live delivery checks, `--price`, if supplied, must equal the active Function’s `AERIE_STRIPE_PRICE_ID`. [Stripe session expiration](https://docs.stripe.com/payments/checkout/managing-limited-inventory?ui=full-page)

Only a signed, correct-mode expiry tagged by the probe creates a private receipt. The printed marker is a SHA-256 digest of the session ID. The Function derives the receipt’s private lookup key from that marker and the endpoint signing secret, including on a later recheck. The command polls the mode’s commerce table for up to a minute using the operator’s Azure Table data read permission. `signedDeliveryVerified: true` confirms delivery for that exact session and reports when it was received. If delivery is pending, replace `--smoke` with `--verify-delivery <printed digest>` to recheck the same receipt. This survives retries and telemetry sampling. Run a fresh probe after changing the endpoint, keys or receiver.

## Cut over to live sales

1. Deploy and verify the intended Functions revision while sandbox checkout is working. Keep the sandbox key, webhook and price references available for recovery. Pause creation of new sandbox sessions using `AERIE_CHECKOUT_ENABLED=false` in test mode. Existing hosted sandbox sessions stay payable in test mode until they expire. Allow in-progress testers to finish before switching. Stripe’s default expiry is 24 hours from creation. Sandbox paid tickets and gifts stay in the test partition. [Stripe Checkout expiration](https://docs.stripe.com/payments/checkout/managing-limited-inventory?ui=full-page)
2. On the Aerie Function, stage the live mode, live API and webhook secret references, confirmed live catalog Price ID and `AERIE_TICKET_PRICE_CENTS=199` together. Keep checkout disabled. Preserve the existing identity secret, restore, private assets and transactional email settings. Run `python3 commerce/tools/deploy_functions.py verify <deployed-commerce-commit-sha> --mode live --checkout-paused` to check the exact revision, live mode, closed store, restore, anonymous Winnipesaukee access and all triggers on both origins. The paused public config omits the price.
3. Run the live preflight with the owner-confirmed seller and registrations and `--smoke`. Wait for both `configurationVerified` and `signedDeliveryVerified`. Keep the offer settings stable during verification. Then set only `AERIE_CHECKOUT_ENABLED=true`. Run `python3 commerce/tools/deploy_functions.py verify <deployed-commerce-commit-sha> --mode live` to check the $1.99 offer, free access and triggers on both public hosts without starting a purchase.

### Pause or roll back

Before any live customer Checkout link has been issued, a failed cutover can stay closed while the settings are corrected. If the preview needs to reopen, restore the original sandbox mode, key references and price together with checkout disabled, then re-enable it after verifying test mode. A new full smoke is appropriate after changing the live receiver or signing secret.

Once a live customer link has been issued, pause new sales with **only** `AERIE_CHECKOUT_ENABLED=false`. Keep the live Stripe keys, mode, price and data partition active so already-issued links can complete and the receiver can process payments, refunds and disputes. Keep restore, gifts and confirmations running. For a corrective release or reviewed code revert during the pause, add `--checkout-paused` to the normal live deployment command.

- On both public origins, check that the config shows live mode, checkout disabled and restore enabled. A fresh player should still reach the free flight.
- If an existing authorized live buyer is available, open their signed-in landing page. Verify **Play now** opens a paid world and **My ticket** still shows their access. An eligible existing receipt or unused gift should still be available. This check uses the existing ticket and does not require another purchase. Record the coverage gap if there is no existing buyer to test.
- Re-enable only new checkout creation after the fix and confirm the live $1.99 offer on both origins again.

## Read Aerie traffic

Sign in to Azure CLI with Storage Table Data Reader scoped to `AerieTraffic`. From `commerce/`, run `npm ci` and `node tools/traffic-report.mjs`. The default report covers seven UTC dates through today. Use `--from YYYY-MM-DD --through YYYY-MM-DD --json` for an explicit range and machine-readable output. The range may include up to 90 dates.

Reports count consenting browsers and visits by source. The landing funnel counts visits in which a tracked landing view preceded the first flight start or the handoff to Stripe. Unknown or unavailable sources appear as direct. A browser may appear under more than one source, while the total deduplicates across every source. The report omits reserved QA traffic and exports only counts.

## Settings

| Function app setting | Purpose |
| --- | --- |
| `AERIE_SITE_URL` | Canonical first-party origin with both game and API routes, such as `https://playaerie.com`. |
| `AERIE_ALLOWED_ORIGINS` | Optional comma-separated exact origins for CORS. Checkout and restore links use the allowed origin that starts the request. Session cookies remain first-party to that hostname. |
| `AERIE_IDENTITY_SECRET` | Stable randomly generated server secret of at least 32 bytes for email/account lookup and gift codes. Store privately. Rotation requires migrating the stored identities and redeemed gift records. |
| `AERIE_TRAFFIC_ENABLED` | `true` enables first-party funnel collection. Create the private `AerieTraffic` table on the existing Table endpoint and grant the Function identity Storage Table Data Contributor scoped to that table. |
| `AERIE_TABLE_URL` | Azure Table service HTTPS endpoint. |
| `AERIE_TABLE_NAME` | Existing table. Default `AerieCommerce`. Each mode has a separate transaction partition. |
| `AERIE_EMAIL_ENDPOINT`, `AERIE_EMAIL_SENDER` | Azure Communication Services endpoint and verified email sender. |
| `AERIE_BLOB_URL`, `AERIE_PRIVATE_CONTAINER` | Azure Blob service endpoint and private paid container. |
| `AERIE_STRIPE_MODE`, `AERIE_STRIPE_SECRET_KEY` | Mode defaults to `test`. Use the matching Stripe key and keep it in Function settings or Key Vault. |
| `AERIE_TICKET_PRICE_CENTS` | Optional server-owned ticket amount, in USD cents. Use `199` for the current offer. If the configured catalog price has a different amount, Checkout generates a one-time price on the same Stripe product with the same tax behavior. Previously opened checkouts keep their recorded price. |
| `AERIE_STRIPE_PRICE_ID`, `AERIE_STRIPE_WEBHOOK_SECRET` | Mode-matched one-time USD Stripe Price and endpoint signing secret. |
| `AERIE_SIGNUP_ENABLED`, `AERIE_CHECKOUT_ENABLED`, `AERIE_SHARE_CLAIMS_ENABLED` | Set the individual feature's value to `true` after its backing services are configured. |
| `AERIE_REWARD_WORLDS` | Optional list of five distinct paid world IDs separated by commas. |
| `AERIE_PURCHASE_HELP_ENABLED` | Enable private purchase help after verifying owner alerting and Table Storage access. |
| `AERIE_MONITORING_ENABLED` | Enable sanitized startup, script, graphics and promise error intake from the game origins. |
| `AERIE_PURCHASE_EMAILS_ENABLED` | Enable confirmations for newly verified payments. Default off. Access and buyer receipt links work independently of email. |
| `AERIE_SANDBOX_PURCHASE_EMAIL_RECIPIENT` | One explicitly approved inbox for the authorized sandbox buyer's confirmation. Keep the address private in app settings. |
| `AERIE_SANDBOX_PURCHASE_TEST_PAYER` | Exact reserved buyer email to accept for sandbox delivery, using an `example.com`, `example.net`, or `example.org` address. Both sandbox settings are required. |

Azure Functions host settings such as `AzureWebJobsStorage` and `FUNCTIONS_WORKER_RUNTIME=node` are supplied separately by Azure. Use a low-cost Functions consumption plan and have an ingress rate-limit policy for email link requests before opening to the public. Set retention handling for old email-link, pending-checkout, session, and review records according to the business's data retention needs. Signups are stored as contact opt-ins; mailing campaigns are separate.

## Regional acoustic forecasts

`GET /api/aerie/air?region=winnipesaukee` accepts a world ID and returns the temperature, humidity, pressure and winds used for sound propagation. A successful response includes one hour of wind and temperature aloft. An empty 204 lets the game use its regional atmosphere. Each Function process shares one forecast per region for 30 minutes and can reuse an observation for up to two hours during an outage.

In test mode the default is the public Open-Meteo forecast API. For commercial forecasts, set `AERIE_OPEN_METEO_API_KEY` using a server-side secret reference. To use a trusted self-hosted Open-Meteo-compatible service, set `AERIE_OPEN_METEO_ENDPOINT` to its full HTTPS forecast URL. The commercial key is sent only to the official customer endpoint. Live mode with neither provider uses regional fallback. [Open-Meteo commercial API](https://open-meteo.com/en/pricing)

A prepared forecast can be served as one HTTPS JSON file using `AERIE_ACOUSTIC_SNAPSHOT_URL`. The document has `version: 1`, a UTC `generatedAt` and a `regions` object with the `current` and `hourly` payload for each of the 13 world IDs. This setting takes precedence over direct providers. Every Function process shares a read across regions, refreshes it after five minutes and keeps the last valid readings through a failed refresh until they reach two hours old. Publish a new file only after the underlying forecast generator has successfully read every location.

## Application flow

- Publish `/join/return/` and its `confirm.js` on each storefront host before deploying a backend that uses this return address. New Stripe sessions send the buyer there with an opaque order reference in the URL fragment. The page retries `POST /api/aerie/checkout/confirm` with the same browser cookie when the service is unavailable. Sessions opened before this release keep their original `GET /api/aerie/checkout/complete` return.
- Hosted Stripe Checkout uses the Aerie name, forest-and-gold palette, and logo from `/join/media/aerie-checkout-logo.png` on `AERIE_SITE_URL`. Publish that image before deploying this backend. Stripe separately displays the merchant's billing details and receipts.
- `GET /api/aerie/config` advertises real availability and the server-verified Stripe amount. `checkoutCollectsEmail: true` indicates that `POST /api/aerie/checkout` accepts an empty JSON object and lets Stripe collect the purchaser's email. An optional valid `email` pre-fills Stripe. When `googlePayCheckout` is true, `{"wallet":"google_pay"}` also collects the address Stripe Tax needs to offer Google Pay to eligible wallets. Aerie does not save this address. A completed purchase sends the original browser through the verified return endpoint and grants access to that purchase. Email verification restores prior purchases.
- A verified buyer's `GET /api/aerie/status` can include `receiptUrl`, the HTTPS Stripe receipt link for their latest purchase. Gift recipients receive their flight grant only. The buyer keeps the receipt link after a refund.
- With confirmations enabled, verified fulfillment queues one buyer message in the same transaction as the access grant. The timer uses the Azure Communication Services operation ID and repeatability window to reconcile uncertain sends. Attempts that remain ambiguous after that window are held for operator review. The email includes the Stripe total, applicable tax, a receipt link when available, and public restore and help instructions.
- `GET /api/aerie/status` returns the free, earned or paid world IDs and a relative unredeemed gift link where appropriate. Resolve it against the game origin before sharing. An emailed one-time link opens the join page, which confirms the token with `POST /api/aerie/restore/confirm`. The original browser can confirm directly. Another browser or device can confirm using the eight-digit code in the email, with five attempts. The optional `gift` field on `POST /api/aerie/restore` carries the gift into that confirmation flow.
- `POST /api/aerie/gift/redeem` accepts a verified recipient session and a gift code. The code is redeemed by just one inbox identity and can safely be retried by that recipient. A full refund or formal open/lost dispute suspends that purchase for the buyer and gift recipient. An inquiry leaves access available. Won, prevented and closed-inquiry outcomes restore access once every hold has cleared. For a historical payment marked disputed with no case IDs, review the payment’s dispute history in Stripe and reconcile its aggregate hold with the recorded cases before restoring access.
- `GET /api/aerie/asset?world=<id>&path=<game-relative-file>&redirect=1` checks the entitlement before redirecting to private Blob Storage. Without `redirect=1` it returns `{url}`. A production load test should measure the authorization requests across the paid world assets as well as Blob bandwidth.
- `POST /api/aerie/share-friends` accepts an explicit confirmation that the player shared Aerie, `{"sharedWithFriends":true}`. Earlier clients can still send `{"sharedWithFive":true}`. A signed browser cookie grants five additional worlds and remains valid until its expiry when Stripe changes modes. Verifying an email on that device saves the reward to the account. At launch, verifying the same email in live mode restores any sharing reward saved during preview. Only the reward flag is read across modes. Aerie does not collect friend addresses or require recipients to install the game.
- `POST /api/aerie/share-claim` queues a public post for review. With authorized Azure Table access, run `npm run review -- list` to see pending public links and `npm run review -- approve <id>` or `npm run review -- reject <id>`. Confirm the claimant authored the post, played Aerie and clearly disclosed the reward. Judge the disclosure and eligibility independently of sentiment, follower counts and engagement. Approving the claim grants five extra worlds. The order of the checks is documented in the [FTC endorsement guidance](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking).

## Monitoring

Connect the workspace-based Application Insights resource using `APPLICATIONINSIGHTS_CONNECTION_STRING`. The host targets 5 telemetry items per second per running instance with adaptive sampling. Browser reports have five bounded fields, are deduplicated per minute, and accept at most 30 distinct reports per minute per running instance. They do not carry raw URLs, user identity, email, or free-form browser exception text.

```kusto
AppTraces
| where TimeGenerated > ago(24h)
| where Message startswith "aerie_client_error "
| extend error = parse_json(substring(Message, strlen("aerie_client_error ")))
| summarize Reports = count() by tostring(error.kind), tostring(error.world), tostring(error.version), bin(TimeGenerated, 15m)
```

`rg-aerie-prod` uses two Azure Monitor scheduled query alerts. They evaluate every five minutes over a 15-minute window. `aerie-client-launch-and-webgl` fires at five reported startup or WebGL failures. `aerie-api-server-failures` fires when the combined count reaches three across API requests with HTTP 5xx responses and Functions host startup exceptions reporting access denied on `host.json`. Both use the `ag-playaerie-prod` action group, which sends to the owner address configured in Azure.

## Purchase help

`/join/help/` accepts a charge, access or gift question and returns an opaque `AER-…` case number after the case is saved. The endpoint accepts JSON from an allowed Aerie origin, validates fields and rate-limits new cases in Table Storage. Retries of the same submission return the same case number. The ticket and reply address stay in the mode’s existing private `AerieCommerce` partition. The form never sends email on a visitor’s behalf.

1. Publish the static `/join/help/` page and the Azure Functions code. Confirm the function identity has Table Storage Data Contributor on the private commerce table and its Application Insights workspace is connected. To prevent sampling of the receipt traces, set `AzureFunctionsJobHost__logging__applicationInsights__samplingSettings__excludedTypes=Exception;Trace` on the commerce Function App. This setting also excludes other app traces from sampling. [Azure Functions host settings](https://learn.microsoft.com/en-us/azure/azure-functions/functions-host-json#override-hostjson-values)
2. In the Aerie Application Insights workspace, create or verify the `aerie-purchase-help-arrivals` log alert. Count matching rows, trigger above zero, evaluate every five minutes over the last 15 minutes, and use the existing `ag-playaerie-prod` owner action group. The query and notification should contain only case references.

   ```kusto
   AppTraces
   | where Message matches regex @"^aerie_purchase_help AER-[A-Za-z0-9_-]{22}$"
   | project TimeGenerated, Case = extract(@"(AER-[A-Za-z0-9_-]{22})$", 1, Message)
   ```

3. Set `AERIE_PURCHASE_HELP_ENABLED=true`. Send a labeled synthetic request through the public page. Check the displayed receipt, its private table record, its trace and the actual action group notification. Close the synthetic case after the check.

An operator with Table Storage Data Reader can list open cases without printing reply addresses or messages. Use Data Contributor to close a case. Substitute the configured storage account and use `aerie-test` for sandbox cases, or `aerie-live` for live cases.

```bash
az storage entity query --auth-mode login --account-name "$AERIE_SUPPORT_STORAGE" \
  --table-name AerieCommerce --select RowKey issue submittedAt \
  --filter "PartitionKey eq '$AERIE_SUPPORT_PARTITION' and RowKey ge 'purchase-help:' and RowKey lt 'purchase-help;' and status eq 'open'"
```

Use the exact case reference with an authorized private console. This command displays the reply address and message. Keep that output out of logs, chat and screenshots. Match purchase questions against Stripe using the authorized operator account, then follow up from the monitored support channel. A submitted address or case number alone does not verify a buyer’s identity. [Azure Table tooling](https://learn.microsoft.com/en-us/cli/azure/storage/entity#az-storage-entity-show)

```bash
az storage entity show --auth-mode login --account-name "$AERIE_SUPPORT_STORAGE" \
  --table-name AerieCommerce --partition-key "$AERIE_SUPPORT_PARTITION" \
  --row-key "purchase-help:$AERIE_SUPPORT_CASE" --select issue email message status submittedAt
```

After resolving the case, mark it closed in the private table.

```bash
az storage entity merge --auth-mode login --account-name "$AERIE_SUPPORT_STORAGE" \
  --table-name AerieCommerce --entity "PartitionKey=$AERIE_SUPPORT_PARTITION" \
  "RowKey=purchase-help:$AERIE_SUPPORT_CASE" status=closed --output none
```
