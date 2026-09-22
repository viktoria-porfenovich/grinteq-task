# Shopify order webhook middleware

Receives Shopify `orders/create` webhooks, verifies the request, strips customer PII, and writes a sanitized payload back onto the order as a metafield.

This repo is a local Express stand-in for the production shape: a serverless function behind an HTTP gateway.

## Architecture

```
Shopify
  → webhook (orders/create)
  → function (Express locally; Lambda in production)
  → HMAC validation
  → PII sanitization
  → Shopify Admin API
  → order metafield (middleware.sanitized_payload)
```

Shopify signs the raw body with the app secret. The handler keeps that raw buffer (`express.json` `verify` hook) and compares `X-Shopify-Hmac-SHA256` with `crypto.timingSafeEqual`. Only after that does it sanitize the order and call Admin GraphQL `metafieldsSet` on `gid://shopify/Order/{id}`.

Auth uses the [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant): Client ID + Client secret are exchanged for a short-lived access token. That token is what goes in `X-Shopify-Access-Token`. Client ID/secret are never sent to GraphQL.

## Sensitive data

The sanitizer is an **allowlist** of operational fields (order id, number, totals, statuses, SKUs, quantities) plus `customer.id` as a non-identifying join key.

These are dropped:

| Field | Why |
|---|---|
| `email` / `contact_email` | Direct contact identifier |
| `phone` | Direct contact identifier |
| `customer` object | Name, email, phone, default address — a PII bundle. Only `customer.id` is kept. |
| `billing_address` / `shipping_address` | Home/work location, often with name and phone |
| `client_details` / `browser_ip` | Device and network identifiers, not needed to process the order |

Also stripped: notes, payment instruments, and line-item `properties` (custom checkout fields often hold gift messages or names).

An allowlist is used instead of deleting known fields because Shopify order payloads are nested and change over API versions. A denylist misses new keys (`contact_email`, `default_address`, `properties`). If a field is not explicitly required downstream, it is not kept.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

The server listens on `http://localhost:3000`.

Shopify Dev Dashboard (same organization as the store):

1. Create an app and a version.
2. **App URL:** `https://shopify.dev/apps/default-app-home` (this app has no Admin UI).
3. Scopes: `read_orders`, `write_orders`.
4. Release and install on the store. The store must appear under **Dev stores**.
5. Create an Order metafield definition: namespace `middleware`, key `sanitized_payload`, type JSON.

## Environment variables

| Variable | Role |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | Store hostname, e.g. `your-store.myshopify.com` |
| `SHOPIFY_CLIENT_SECRET` | App secret. Verifies webhook HMAC. Also used in the token exchange. |
| `SHOPIFY_CLIENT_ID` | App client id. Used with the secret to obtain an access token. |
| `SHOPIFY_ACCESS_TOKEN` | Not stored. Fetched at runtime via client credentials and cached until shortly before expiry. A static `shpat_` token would work for a legacy custom app; Dev Dashboard apps do not expose one. |
| `SHOPIFY_API_VERSION` | Optional. Defaults to `2026-07`. |

## Testing

```bash
npm test
```

HMAC is over the **exact bytes** of `test-order.json`, not a re-serialized object. The file `id` must be a real order id on the store.

1. Start the server: `npm run dev`
2. Sign the fixture:

```bash
npm run hmac
```

3. POST the same file (new terminal):

```bash
curl -i http://localhost:3000/webhooks/orders-create \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-SHA256: PASTE_HMAC_HERE" \
  --data-binary @test-order.json
```

Use `--data-binary`. If you edit the JSON, regenerate the HMAC.

**Pass:** `200`, response body has no email/phone/address, and the order in Admin shows `middleware.sanitized_payload`.

**Fail:** `401` means HMAC or secret mismatch. `500` with `Access denied for metafieldsSet` means scopes were not granted on the installed app version. A token request that returns HTML usually means the store is not in the Dev Dashboard org.

Live Shopify webhooks cannot hit `localhost`. Tunnel the server and subscribe `orders/create` to `https://<tunnel>/webhooks/orders-create`. App URL stays the default home URL above.

## Production considerations

This local Express process would not be the production runtime.

- **AWS Lambda + API Gateway** instead of a long-running Express server. Gateway terminates TLS and forwards `POST /webhooks/orders-create`.
- **Secrets Manager** for `SHOPIFY_CLIENT_SECRET` / client id, not a `.env` file on disk.
- **Webhook idempotency** keyed on `X-Shopify-Webhook-Id`. Shopify retries; metafield writes should be safe to repeat, but duplicate work and duplicate logs should not be.
- **Retries** belong after a fast `200` to Shopify. The handler today awaits Admin API inside the request and returns `500` on failure. Production would ACK the webhook, then retry independently (Lambda destination, DLQ).
- **Logging / monitoring** on verify failures vs Admin API errors, with order id only. **Do not log raw customer/order payloads** — not `req.body`, not the webhook fixture, not HTML error pages that might contain tokens.
- **SQS** (or similar) if the sanitized order is destined for a third party, not only a Shopify metafield. The webhook function enqueues; a worker calls the destination with its own retry policy.
- **OAuth** (or token exchange) if more than one merchant store is supported. Client credentials only work for stores in *your* organization.
- Return an empty `200` to Shopify. Do not echo the sanitized order in the webhook response.
