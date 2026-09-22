import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createShopifyHmac, verifyShopifyWebhook } from "../src/verify-hmac";

const secret = "test-client-secret";
const body = Buffer.from('{"id":1,"email":"hidden@example.com"}');

describe("verifyShopifyWebhook", () => {
  it("accepts a matching HMAC", () => {
    const hmac = createShopifyHmac(body, secret);
    assert.equal(verifyShopifyWebhook(body, hmac, secret), true);
  });

  it("rejects a missing, wrong, or different-length HMAC", () => {
    const hmac = createShopifyHmac(body, secret);

    assert.equal(verifyShopifyWebhook(body, undefined, secret), false);
    assert.equal(verifyShopifyWebhook(undefined, hmac, secret), false);
    assert.equal(verifyShopifyWebhook(body, hmac, undefined), false);
    assert.equal(verifyShopifyWebhook(body, "not-the-hmac", secret), false);
    assert.equal(verifyShopifyWebhook(body, "short", secret), false);
    assert.equal(
      verifyShopifyWebhook(body, hmac, "other-secret"),
      false
    );
  });
});
