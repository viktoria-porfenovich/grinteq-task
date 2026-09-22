import express from "express";
import dotenv from "dotenv";
import { sanitizeOrder } from "./sanitize-order";
import { saveSanitizedOrder } from "./shopify";
import { verifyShopifyWebhook } from "./verify-hmac";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);

app.post("/webhooks/orders-create", async (req, res) => {
  const hmac = req.get("X-Shopify-Hmac-SHA256");
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (!hmac) {
    return res.status(401).send("Missing HMAC");
  }

  if (!secret) {
    console.error("SHOPIFY_CLIENT_SECRET is not set");
    return res.status(500).send("Server misconfigured");
  }

  if (!verifyShopifyWebhook(rawBody, hmac, secret)) {
    return res.status(401).send("Invalid HMAC");
  }

  const sanitizedOrder = sanitizeOrder(req.body);

  if (!sanitizedOrder?.orderId) {
    return res.status(400).send("Invalid order payload");
  }

  try {
    await saveSanitizedOrder(sanitizedOrder.orderId, sanitizedOrder);
  } catch (error) {
    console.error("Failed to save sanitized order to Shopify:", error);
    return res.status(500).send("Failed to save order to Shopify");
  }

  console.log("Valid Shopify webhook", { orderId: sanitizedOrder.orderId });

  res.status(200).json({
    success: true,
    order: sanitizedOrder,
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
