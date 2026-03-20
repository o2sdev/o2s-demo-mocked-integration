import { integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const carts = pgTable('carts', {
    id: text('id').primaryKey(),
    customerId: text('customer_id'),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    regionId: text('region_id'),
    currency: text('currency').notNull(),
    email: text('email'),
    notes: text('notes'),
    shippingAddress: jsonb('shipping_address'),
    billingAddress: jsonb('billing_address'),
    shippingMethod: jsonb('shipping_method'),
    paymentMethod: jsonb('payment_method'),
    promotions: jsonb('promotions').notNull().default([]),
    metadata: jsonb('metadata').notNull().default({}),
    subtotal: numeric('subtotal').notNull().default('0'),
    discountTotal: numeric('discount_total').notNull().default('0'),
    taxTotal: numeric('tax_total').notNull().default('0'),
    shippingTotal: numeric('shipping_total').notNull().default('0'),
    total: numeric('total').notNull().default('0'),
});

export const cartItems = pgTable('cart_items', {
    id: text('id').primaryKey(),
    cartId: text('cart_id')
        .notNull()
        .references(() => carts.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    quantity: integer('quantity').notNull(),
    priceValue: numeric('price_value').notNull(),
    subtotalValue: numeric('subtotal_value').notNull(),
    discountTotalValue: numeric('discount_total_value').notNull().default('0'),
    totalValue: numeric('total_value').notNull(),
    unit: text('unit'),
    currency: text('currency').notNull(),
    product: jsonb('product').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
});
