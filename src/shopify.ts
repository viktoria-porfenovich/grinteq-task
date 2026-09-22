let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function getShopDomain(): string {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN
    ?.replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (storeDomain) {
    return storeDomain.includes(".")
      ? storeDomain
      : `${storeDomain}.myshopify.com`;
  }

  throw new Error("Missing SHOPIFY_STORE_DOMAIN");
}

async function readJson(response: Response, label: string) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "unknown";

  try {
    return JSON.parse(text);
  } catch {
    const location = response.headers.get("location");
    throw new Error(
      `${label} returned ${response.status} ${contentType}` +
        (location ? ` redirect=${location}` : "") +
        ` (not JSON): ${text.slice(0, 180)}`
    );
  }
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const shop = getShopDomain();
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env"
    );
  }

  const tokenUrl = `https://${shop}/admin/oauth/access_token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    redirect: "manual",
  });

  const result = await readJson(response, `Token request ${tokenUrl}`);

  if (!response.ok || !result.access_token) {
    throw new Error(`Token request failed: ${JSON.stringify(result)}`);
  }

  cachedToken = result.access_token;
  tokenExpiresAt = Date.now() + (result.expires_in ?? 86399) * 1000;
  return cachedToken;
}

export async function saveSanitizedOrder(
  orderId: number,
  payload: object
) {
  const shop = getShopDomain();
  const accessToken = await getAccessToken();
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-07";
  const apiUrl = `https://${shop}/admin/api/${apiVersion}/graphql.json`;

  const mutation = `
    mutation SetOrderMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        metafields: [
          {
            ownerId: `gid://shopify/Order/${orderId}`,
            namespace: "middleware",
            key: "sanitized_payload",
            type: "json",
            value: JSON.stringify(payload),
          },
        ],
      },
    }),
  });

  const result = await readJson(response, `Shopify API ${apiUrl}`);

  if (!response.ok) {
    throw new Error(
      `Shopify API request failed: ${JSON.stringify(result)}`
    );
  }

  if (result.errors?.length) {
    throw new Error(
      `Shopify GraphQL error: ${JSON.stringify(result.errors)}`
    );
  }

  const metafieldsSet = result.data?.metafieldsSet;
  const userErrors = metafieldsSet?.userErrors;

  if (userErrors?.length) {
    throw new Error(
      `Shopify metafield error: ${JSON.stringify(userErrors)}`
    );
  }

  if (!metafieldsSet?.metafields) {
    throw new Error(
      `Shopify metafield response missing data: ${JSON.stringify(result)}`
    );
  }

  return metafieldsSet.metafields;
}
