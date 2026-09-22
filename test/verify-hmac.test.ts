import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createShopifyHmac, verifyShopifyWebhook } from "../src/verify-hmac";

const secret = "test-client-secret";
const body = new TextEncoder().encode('{"id":1,"email":"hidden@example.com"}');

describe("verifyShopifyWebhook", () => {
  it("accepts a matching HMAC from Uint8Array or ArrayBuffer", async () => {
    const hmac = await createShopifyHmac(body, secret);

    assert.equal(await verifyShopifyWebhook(body, hmac, secret), true);
    assert.equal(
      await verifyShopifyWebhook(
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        hmac,
        secret
      ),
      true
    );
  });

  it("rejects a missing, wrong, or different-length HMAC", async () => {
    const hmac = await createShopifyHmac(body, secret);

    assert.equal(await verifyShopifyWebhook(body, undefined, secret), false);
    assert.equal(await verifyShopifyWebhook(undefined, hmac, secret), false);
    assert.equal(await verifyShopifyWebhook(body, hmac, undefined), false);
    assert.equal(await verifyShopifyWebhook(body, "not-the-hmac", secret), false);
    assert.equal(await verifyShopifyWebhook(body, "short", secret), false);
    assert.equal(
      await verifyShopifyWebhook(body, hmac, "other-secret"),
      false
    );
  });
});
