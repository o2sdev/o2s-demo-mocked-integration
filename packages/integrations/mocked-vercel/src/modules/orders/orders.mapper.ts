import { BadRequestException } from '@nestjs/common';

import { Carts, Models, Orders, Products } from '@o2s/framework/modules';

import { schema } from '@/db';

export type OrderRow = typeof schema.orders.$inferSelect;
export type OrderItemRow = typeof schema.orderItems.$inferSelect;
export type OrderInsertValues = typeof schema.orders.$inferInsert;
export type OrderItemInsertValues = typeof schema.orderItems.$inferInsert;

// --- Row-level transforms ---

const mapOrderItemRow = (item: OrderItemRow): Orders.Model.OrderItem => ({
    id: item.id,
    productId: item.productId,
    quantity: item.quantity,
    price: { value: Number(item.priceValue), currency: item.currency as Models.Price.Currency },
    subtotal: { value: Number(item.subtotalValue), currency: item.currency as Models.Price.Currency },
    discountTotal: { value: Number(item.discountTotalValue), currency: item.currency as Models.Price.Currency },
    total: { value: Number(item.totalValue), currency: item.currency as Models.Price.Currency },
    unit: (item.unit ?? 'PCS') as Orders.Model.OrderItem['unit'],
    currency: item.currency as Models.Price.Currency,
    product: item.product as Products.Model.Product,
});

/** Assemble an Order model from a DB order row + item rows. */
export const assembleOrder = (orderRow: OrderRow, itemRows: OrderItemRow[]): Orders.Model.Order => {
    const currency = orderRow.currency as Models.Price.Currency;
    const items = itemRows.map(mapOrderItemRow);

    return {
        id: orderRow.id,
        customerId: orderRow.customerId ?? undefined,
        createdAt: orderRow.createdAt.toISOString(),
        updatedAt: orderRow.updatedAt.toISOString(),
        paymentDueDate: orderRow.paymentDueDate?.toISOString(),
        total: { value: Number(orderRow.total), currency },
        subtotal: { value: Number(orderRow.subtotal), currency },
        shippingTotal: { value: Number(orderRow.shippingTotal), currency },
        shippingSubtotal: { value: Number(orderRow.shippingSubtotal), currency },
        discountTotal: { value: Number(orderRow.discountTotal), currency },
        tax: { value: Number(orderRow.tax), currency },
        currency,
        paymentStatus: orderRow.paymentStatus as Orders.Model.PaymentStatus,
        status: orderRow.status as Orders.Model.OrderStatus,
        items: { data: items, total: items.length },
        shippingAddress: (orderRow.shippingAddress as Models.Address.Address) ?? undefined,
        billingAddress: (orderRow.billingAddress as Models.Address.Address) ?? undefined,
        shippingMethods: (orderRow.shippingMethods as Orders.Model.ShippingMethod[]) ?? [],
        documents: (orderRow.documents as Orders.Model.Document[]) ?? [],
        customerComment: orderRow.customerComment ?? undefined,
        email: orderRow.email ?? undefined,
        purchaseOrderNumber: orderRow.purchaseOrderNumber ?? undefined,
    };
};

// --- Anonymization ---

const FAKE_FIRST_NAMES = ['Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Quinn', 'Avery', 'Blake', 'Drew'];
const FAKE_LAST_NAMES = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Wilson',
    'Moore',
];
const FAKE_STREETS = [
    'Oak Avenue',
    'Pine Street',
    'Maple Drive',
    'Cedar Lane',
    'Elm Boulevard',
    'Birch Road',
    'Walnut Way',
    'Cherry Court',
];
const FAKE_CITIES = [
    'Springfield',
    'Riverside',
    'Fairview',
    'Greenville',
    'Madison',
    'Georgetown',
    'Salem',
    'Franklin',
];
const FAKE_REGIONS = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA'];

function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomDigits(length: number): string {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

function anonymizeAddress(address: Models.Address.Address | undefined): Models.Address.Address | undefined {
    if (!address) return undefined;

    return {
        ...address,
        firstName: randomPick(FAKE_FIRST_NAMES),
        lastName: randomPick(FAKE_LAST_NAMES),
        companyName: address.companyName ? `Demo Corp ${randomDigits(3)}` : undefined,
        taxId: address.taxId ? `XX-${randomDigits(7)}` : undefined,
        streetName: randomPick(FAKE_STREETS),
        streetNumber: String(Math.floor(Math.random() * 999) + 1),
        apartment: address.apartment ? `${Math.floor(Math.random() * 50) + 1}` : undefined,
        city: randomPick(FAKE_CITIES),
        region: randomPick(FAKE_REGIONS),
        postalCode: randomDigits(5),
        email: `demo-${randomDigits(6)}@example.com`,
        phone: `555-${randomDigits(3)}-${randomDigits(4)}`,
    };
}

/** Replace personal data with random placeholders before storing in the database. */
export function anonymizeOrder(order: Orders.Model.Order): Orders.Model.Order {
    return {
        ...order,
        shippingAddress: anonymizeAddress(order.shippingAddress),
        billingAddress: anonymizeAddress(order.billingAddress),
        email: order.email ? `demo-${randomDigits(6)}@example.com` : undefined,
        customerComment: undefined,
    };
}

// --- Model → DB insert values ---

export const mapOrderInsertValues = (order: Orders.Model.Order): OrderInsertValues => ({
    id: order.id,
    customerId: order.customerId ?? null,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
    paymentDueDate: order.paymentDueDate ? new Date(order.paymentDueDate) : null,
    currency: order.currency,
    status: order.status,
    paymentStatus: order.paymentStatus,
    subtotal: String(order.subtotal?.value ?? 0),
    shippingTotal: String(order.shippingTotal?.value ?? 0),
    shippingSubtotal: String(order.shippingSubtotal?.value ?? 0),
    discountTotal: String(order.discountTotal?.value ?? 0),
    tax: String(order.tax?.value ?? 0),
    total: String(order.total.value),
    shippingAddress: (order.shippingAddress as unknown as Record<string, unknown>) ?? null,
    billingAddress: (order.billingAddress as unknown as Record<string, unknown>) ?? null,
    shippingMethods: order.shippingMethods as unknown[],
    documents: (order.documents as unknown[]) ?? [],
    customerComment: order.customerComment ?? null,
    email: order.email ?? null,
    purchaseOrderNumber: order.purchaseOrderNumber ?? null,
});

export const mapOrderItemInsertValues = (item: Orders.Model.OrderItem, orderId: string): OrderItemInsertValues => ({
    id: item.id,
    orderId,
    productId: item.productId,
    quantity: item.quantity,
    priceValue: String(item.price.value),
    subtotalValue: String(item.subtotal?.value ?? 0),
    discountTotalValue: String(item.discountTotal?.value ?? 0),
    totalValue: String(item.total?.value ?? 0),
    unit: (item.unit as string) ?? null,
    currency: item.currency,
    product: item.product as unknown as Record<string, unknown>,
});

// --- Cart → Order conversion ---

export function mapOrderFromCart(cart: Carts.Model.Cart, email?: string): Orders.Model.Order {
    const now = new Date();
    const orderId = `ORD-${Date.now()}`;

    const orderItems: Orders.Model.OrderItem[] = cart.items.data.map((item) => ({
        id: `ITEM-${crypto.randomUUID()}`,
        productId: item.product.id,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        subtotal: item.subtotal,
        discountTotal: item.discountTotal,
        unit: item.unit,
        currency: item.currency,
        product: item.product,
    }));

    if (!cart.shippingMethod) {
        throw new BadRequestException('Shipping method is required to create order from cart');
    }

    if (!cart.shippingTotal) {
        throw new BadRequestException('Shipping total is required to create order from cart');
    }

    return {
        id: orderId,
        customerId: cart.customerId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        paymentDueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        total: cart.total,
        subtotal: cart.subtotal,
        shippingTotal: cart.shippingTotal,
        shippingSubtotal: cart.shippingTotal,
        discountTotal: cart.discountTotal,
        tax: cart.taxTotal,
        currency: cart.currency,
        paymentStatus: 'PENDING',
        status: 'PENDING',
        items: { data: orderItems, total: orderItems.length },
        shippingAddress: cart.shippingAddress,
        billingAddress: cart.billingAddress,
        shippingMethods: [cart.shippingMethod],
        customerComment: cart.notes,
        email: email ?? cart.email,
    };
}
