import { sanitizeOrder } from "./sanitize-order";
import { saveSanitizedOrder } from "./shopify";
import { verifyShopifyWebhook } from "./verify-hmac";
import type { Env } from "./env";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hmac = request.headers.get("X-Shopify-Hmac-SHA256");
    const requestMeta = {
      method: request.method,
      path: url.pathname,
      topic: request.headers.get("X-Shopify-Topic"),
      shop: request.headers.get("X-Shopify-Shop-Domain"),
      hasHmac: Boolean(hmac),
    };

    if (request.method !== "POST" || url.pathname !== "/webhooks/orders-create") {
      console.log("Webhook result", { status: 404, ...requestMeta });
      return new Response("Not found", { status: 404 });
    }

    const secret = env.SHOPIFY_CLIENT_SECRET;
    const rawBody = await request.arrayBuffer();

    if (!hmac) {
      console.log("Webhook result", { status: 401, message: "Missing HMAC", ...requestMeta });
      return new Response("Missing HMAC", { status: 401 });
    }

    if (!secret) {
      console.log("Webhook result", { status: 500, message: "Server misconfigured", ...requestMeta });
      return new Response("Server misconfigured", { status: 500 });
    }

    if (!(await verifyShopifyWebhook(rawBody, hmac, secret))) {
      console.log("Webhook result", { status: 401, message: "Invalid HMAC", ...requestMeta });
      return new Response("Invalid HMAC", { status: 401 });
    }

    let order: unknown;
    try {
      order = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      console.log("Webhook result", { status: 400, message: "Invalid JSON", ...requestMeta });
      return new Response("Invalid JSON", { status: 400 });
    }

    const sanitizedOrder = sanitizeOrder(order);

    if (!sanitizedOrder?.orderId) {
      console.log("Webhook result", { status: 400, message: "Invalid order payload", ...requestMeta });
      return new Response("Invalid order payload", { status: 400 });
    }

    try {
      await saveSanitizedOrder(sanitizedOrder.orderId, sanitizedOrder, env);
    } catch (error) {
      console.error("Failed to save sanitized order to Shopify:", error);
      console.log("Webhook result", {
        status: 500,
        message: "Failed to save order to Shopify",
        orderId: sanitizedOrder.orderId,
        ...requestMeta,
      });
      return new Response("Failed to save order to Shopify", { status: 500 });
    }

    console.log("Webhook result", {
      status: 200,
      orderId: sanitizedOrder.orderId,
      ...requestMeta,
    });

    return Response.json({
      success: true,
      order: sanitizedOrder,
    });
  },
};
