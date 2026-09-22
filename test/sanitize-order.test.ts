import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeOrder } from "../src/sanitize-order";

const rawOrder = {
  id: 7248208003225,
  name: "#1001",
  created_at: "2026-09-22T10:00:00Z",
  email: "customer@example.com",
  phone: "+44123456789",
  currency: "GBP",
  total_price: "100.00",
  customer: {
    id: 999,
    email: "customer@example.com",
    first_name: "Ada",
    phone: "+44123456789",
  },
  shipping_address: {
    address1: "123 Test Street",
    city: "London",
  },
  billing_address: {
    address1: "123 Test Street",
  },
  client_details: {
    browser_ip: "1.2.3.4",
    user_agent: "Mozilla",
  },
  line_items: [
    {
      product_id: 456,
      variant_id: 789,
      sku: "ABC-123",
      title: "Test Product",
      quantity: 2,
      price: "50.00",
      properties: [{ name: "Gift message", value: "Happy birthday Ada" }],
    },
  ],
};

describe("sanitizeOrder", () => {
  it("keeps operational fields and customer id only", () => {
    const sanitized = sanitizeOrder(rawOrder);

    assert.equal(sanitized?.orderId, 7248208003225);
    assert.equal(sanitized?.orderNumber, "#1001");
    assert.equal(sanitized?.totalPrice, "100.00");
    assert.equal(sanitized?.customerId, 999);
    assert.deepEqual(sanitized?.lineItems, [
      {
        productId: 456,
        variantId: 789,
        sku: "ABC-123",
        title: "Test Product",
        quantity: 2,
        price: "50.00",
      },
    ]);
  });

  it("drops email, phone, customer PII, addresses, IP, and line-item properties", () => {
    const sanitized = sanitizeOrder(rawOrder);
    const serialized = JSON.stringify(sanitized);

    assert.equal(serialized.includes("customer@example.com"), false);
    assert.equal(serialized.includes("+44123456789"), false);
    assert.equal(serialized.includes("123 Test Street"), false);
    assert.equal(serialized.includes("1.2.3.4"), false);
    assert.equal(serialized.includes("Happy birthday Ada"), false);
    assert.equal(serialized.includes("first_name"), false);
  });

  it("returns null for invalid payloads", () => {
    assert.equal(sanitizeOrder(null), null);
    assert.equal(sanitizeOrder(undefined), null);
    assert.equal(sanitizeOrder("order"), null);
    assert.equal(sanitizeOrder([]), null);
  });
});
