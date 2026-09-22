import { readDevVars } from "./read-dev-vars";

const secrets = readDevVars();
const shop = "intern-vp-test-store.myshopify.com";
const apiVersion = "2026-07";
const callbackUrl =
  "https://shopify-order-middleware.viktoria-porfenovich.workers.dev/webhooks/orders-create";

async function graphql(token: string, query: string, variables?: object) {
  const res = await fetch(
    `https://${shop}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  return res.json();
}

async function main() {
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: secrets.SHOPIFY_CLIENT_ID!,
      client_secret: secrets.SHOPIFY_CLIENT_SECRET!,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) {
    console.error("Token failed:", tokenJson);
    process.exit(1);
  }

  const existing = await graphql(
    tokenJson.access_token,
    `query {
      webhookSubscriptions(first: 50) {
        nodes { id topic uri }
      }
    }`
  );

  const nodes = existing.data?.webhookSubscriptions?.nodes ?? [];
  console.log("Existing webhooks:", JSON.stringify(nodes, null, 2));

  const already = nodes.find(
    (node: { topic: string; uri: string }) =>
      node.topic === "ORDERS_CREATE" && node.uri === callbackUrl
  );

  if (already) {
    console.log("ORDERS_CREATE already registered.");
    return;
  }

  const created = await graphql(
    tokenJson.access_token,
    `mutation CreateOrdersWebhook($topic: WebhookSubscriptionTopic!, $subscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $subscription) {
        webhookSubscription { id topic uri }
        userErrors { field message }
      }
    }`,
    {
      topic: "ORDERS_CREATE",
      subscription: {
        uri: callbackUrl,
        format: "JSON",
      },
    }
  );

  console.log("Create result:", JSON.stringify(created, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
