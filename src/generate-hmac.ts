import fs from "node:fs";
import { createShopifyHmac } from "./verify-hmac";
import { readDevVars } from "../scripts/read-dev-vars";

const secret = readDevVars().SHOPIFY_CLIENT_SECRET;

if (!secret) {
  throw new Error("Missing SHOPIFY_CLIENT_SECRET in .dev.vars");
}

const body = new Uint8Array(fs.readFileSync("test-order.json"));

console.log("HMAC:");
console.log(await createShopifyHmac(body, secret));
