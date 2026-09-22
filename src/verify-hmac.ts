function toBytes(
  rawBody: ArrayBuffer | Uint8Array | undefined
): Uint8Array | undefined {
  if (!rawBody) {
    return undefined;
  }

  return rawBody instanceof Uint8Array ? rawBody : new Uint8Array(rawBody);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | undefined {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return undefined;
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export async function createShopifyHmac(
  rawBody: ArrayBuffer | Uint8Array,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, toBytes(rawBody)!);
  return bytesToBase64(new Uint8Array(signature));
}

export async function verifyShopifyWebhook(
  rawBody: ArrayBuffer | Uint8Array | undefined,
  hmac: string | undefined,
  secret: string | undefined
): Promise<boolean> {
  const body = toBytes(rawBody);

  if (!body?.length || !hmac || !secret) {
    return false;
  }

  const digest = base64ToBytes(await createShopifyHmac(body, secret));
  const received = base64ToBytes(hmac);

  if (!digest || !received) {
    return false;
  }

  return timingSafeEqual(digest, received);
}
