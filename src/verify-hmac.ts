import crypto from "crypto";

export function createShopifyHmac(rawBody: Buffer, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
}

export function verifyShopifyWebhook(
  rawBody: Buffer | undefined,
  hmac: string | undefined,
  secret: string | undefined
): boolean {
  if (!rawBody?.length || !hmac || !secret) {
    return false;
  }

  const digest = Buffer.from(createShopifyHmac(rawBody, secret));
  const received = Buffer.from(hmac);

  if (digest.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(digest, received);
}
