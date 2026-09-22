# Shopify order webhook middleware

Cloudflare Worker that receives Shopify `orders/create` webhooks, verifies they came from Shopify, strips customer PII, and writes the sanitized payload back onto the order as a metafield.

## Architecture

```
Shopify
  → webhook (orders/create)
  → Cloudflare Worker
  → HMAC validation (Client secret)
  → PII sanitization (allowlist)
  → Shopify Admin API (client credentials token)
  → order metafield (middleware.sanitized_payload)
```

Shopify signs the raw body with the app **Client secret** and sends `X-Shopify-Hmac-SHA256`. The Worker reads `request.arrayBuffer()` once, verifies that HMAC, then sanitizes. It is not a separate “webhook token”; the Admin access token is fetched later and only used for GraphQL.

Auth uses the [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant). Client ID and Client secret are exchanged for a short-lived access token (`X-Shopify-Access-Token`). They are never sent to GraphQL.

## Sensitive data

The sanitizer is an **allowlist** of operational fields (order id, number, totals, statuses, SKUs, quantities) plus `customer.id` as a non-identifying join key.

| Dropped | Why |
|---|---|
| `email` / `contact_email` | Direct contact identifier |
| `phone` | Direct contact identifier |
| `customer` object | Name, email, phone, default address. Only `customer.id` is kept. |
| `billing_address` / `shipping_address` | Physical location, often with name and phone |
| `client_details` / `browser_ip` | Device and network identifiers |

Also omitted: notes, payment instruments, and line-item `properties` (custom checkout fields often hold names or gift messages).

An allowlist is used instead of deleting known fields because Shopify payloads are nested and change across API versions. A denylist misses new keys. If a field is not required downstream, it is not kept.

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Wrangler serves `http://127.0.0.1:8787`. Secrets come from `.dev.vars`. Store domain and API version come from `wrangler.toml` `[vars]`.

Shopify Dev Dashboard (app and store in the **same organization**):

1. Create an app and a version.
2. **App URL:** `https://shopify.dev/apps/default-app-home` (no Admin UI). Do not use the Worker host here.
3. Scopes: `read_orders`, `write_orders` (and `write_order_metafields` if the dashboard lists it).
4. Release and install on the store. The store must appear under **Dev stores**.
5. Order metafield definition: namespace `middleware`, key `sanitized_payload`, type JSON.

**App URL** is a GET page when someone opens the app. **Webhook URL** is a POST when an order is created. They are not the same.

## Environment variables

| Variable | Where | Role |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | `wrangler.toml` `[vars]` | Store hostname, e.g. `your-store.myshopify.com` |
| `SHOPIFY_API_VERSION` | `wrangler.toml` `[vars]` | Admin API version (`2026-07`) |
| `SHOPIFY_CLIENT_ID` | `.dev.vars` / Wrangler secret | App client id for the token exchange |
| `SHOPIFY_CLIENT_SECRET` | `.dev.vars` / Wrangler secret | HMAC verification **and** token exchange |
| `SHOPIFY_WEBHOOK_URL` | `wrangler.toml` `[vars]` | Public Worker URL used by `npm run register-webhook` |

There is no stored `SHOPIFY_ACCESS_TOKEN`. The Worker fetches one per metafield write. There is no separate webhook secret; HMAC uses `SHOPIFY_CLIENT_SECRET`.

Production:

```bash
npx wrangler secret put SHOPIFY_CLIENT_ID
npx wrangler secret put SHOPIFY_CLIENT_SECRET
```

## Testing

```bash
npm test
```

### Local curl

HMAC is over the exact bytes of `test-order.json`. The `id` must exist on the store.

```bash
npm run hmac
npm run dev
```

```bash
curl -i http://127.0.0.1:8787/webhooks/orders-create \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-SHA256: PASTE_HMAC_HERE" \
  --data-binary @test-order.json
```

Use `--data-binary`. If you edit the JSON, regenerate the HMAC.

### Live Shopify order

```bash
npx wrangler deploy
npm run register-webhook
npx wrangler tail shopify-order-middleware
```

Webhook URL (not App URL):

```
https://shopify-order-middleware.<account>.workers.dev/webhooks/orders-create
```

Create a real order in Admin. Tail should show `path: "/webhooks/orders-create"`, `hasHmac: true`, `status: 200`. The order metafield `middleware.sanitized_payload` should contain the sanitized JSON.

`POST /` with `404` means something hit the Worker root (often App URL). That is not `orders/create`.

## Production considerations

- **Secrets** stay in Wrangler secrets, not `[vars]` or git.
- **Idempotency** keyed on `X-Shopify-Webhook-Id`. Shopify retries.
- **ACK then work:** this Worker awaits Admin API inside the request. A queue (Cloudflare Queues / SQS) would return `200` faster and retry independently.
- **Do not log raw payloads.** Logs here are path, topic, shop, HMAC present, order id, status.
- **OAuth / token exchange** if more than one merchant store. Client credentials only work for stores in *your* organization.
- Return an empty `200` to Shopify in production; the JSON body is for debugging.
- AWS Lambda + API Gateway is an alternative serverless host with the same HMAC → sanitize → metafield contract.
