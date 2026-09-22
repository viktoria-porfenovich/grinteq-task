import fs from "fs";
import dotenv from "dotenv";
import { createShopifyHmac } from "./verify-hmac";

dotenv.config();

const secret = process.env.SHOPIFY_CLIENT_SECRET;

if (!secret) {
  throw new Error("Missing SHOPIFY_CLIENT_SECRET in .env");
}

const body = fs.readFileSync("test-order.json");

console.log("HMAC:");
console.log(createShopifyHmac(body, secret));
