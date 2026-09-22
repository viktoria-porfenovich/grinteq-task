export function sanitizeOrder(order: any) {
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return null;
  }

  return {
    orderId: order.id,
    orderNumber: order.name,
    createdAt: order.created_at,
    currency: order.currency,
    subtotalPrice: order.subtotal_price,
    totalPrice: order.total_price,
    totalTax: order.total_tax,
    financialStatus: order.financial_status,
    fulfillmentStatus: order.fulfillment_status,
    sourceName: order.source_name,
    test: order.test,
    customerId: order.customer?.id ?? null,

    lineItems: (order.line_items ?? []).map((item: any) => ({
      productId: item.product_id,
      variantId: item.variant_id,
      sku: item.sku,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
    })),
  };
}
