import { Carts, Models, Products } from '@o2s/framework/modules';

// Read payment method stored in metadata by setPayment
export const mapPaymentMethodFromMetadata = (
    metadata: Record<string, unknown>,
): Carts.Model.PaymentMethod | undefined => {
    const stored = metadata?.paymentMethod as Record<string, unknown> | undefined;
    if (!stored || typeof stored !== 'object') return undefined;

    return {
        id: stored.id as string,
        name: stored.name as string,
        description: (stored.description as string) ?? undefined,
    };
};

// Promotions
export const PROMOTIONS: Carts.Model.Promotion[] = [
    {
        id: 'PROMO-001',
        code: 'SAVE10',
        name: '10% Off',
        description: 'Get 10% off your order',
        type: 'PERCENTAGE',
        value: '10',
    },
    {
        id: 'PROMO-002',
        code: 'FREESHIP',
        name: 'Free Shipping',
        description: 'Free standard shipping',
        type: 'FREE_SHIPPING',
        value: '0',
    },
];

export const formatDate = (date: Date): string => {
    return date.toISOString();
};

// Build cart item from product (shared by addCartItem and generateCartItem)
export const buildCartItemFromProduct = (
    product: Products.Model.Product,
    quantity: number,
    currency: Models.Price.Currency,
    metadata: Record<string, unknown> = {},
): Carts.Model.CartItem => {
    const price = product.price?.value ?? 0;
    const subtotal = price * quantity;

    return {
        id: `ITEM-${crypto.randomUUID()}`,
        sku: product.sku ?? '',
        quantity,
        price: { value: price, currency },
        subtotal: { value: subtotal, currency },
        discountTotal: { value: 0, currency },
        total: { value: subtotal, currency },
        unit: 'PCS',
        currency,
        product: {
            id: product.id,
            sku: product.sku ?? '',
            name: product.name,
            description: product.description,
            shortDescription: product.shortDescription,
            image: product.image,
            price: product.price ?? { value: price, currency },
            link: product.link ?? '',
            type: product.type,
            category: product.category ?? '',
            tags: product.tags ?? [],
        },
        metadata,
    };
};

// Helper function to recalculate cart totals
export const recalculateCartTotals = (cart: Carts.Model.Cart): void => {
    let subtotal = 0;
    for (const item of cart.items.data) {
        subtotal += item.total.value;
    }

    let discountTotal = 0;
    if (cart.promotions) {
        for (const promo of cart.promotions) {
            if (promo.type === 'PERCENTAGE') {
                discountTotal += (subtotal * Number(promo.value)) / 100;
            } else if (promo.type === 'FIXED_AMOUNT') {
                discountTotal += Number(promo.value);
            }
        }
    }

    discountTotal = Math.min(discountTotal, subtotal);

    const shippingTotal = cart.shippingMethod?.total?.value || 0;
    const hasFreeShipping = cart.promotions?.some((p) => p.type === 'FREE_SHIPPING');
    const actualShippingTotal = hasFreeShipping ? 0 : shippingTotal;

    const taxTotal = Math.round((subtotal - discountTotal) * 0.23 * 100) / 100;
    const total = subtotal - discountTotal + actualShippingTotal + taxTotal;

    cart.subtotal = { value: subtotal, currency: cart.currency };
    cart.discountTotal = { value: Math.round(discountTotal * 100) / 100, currency: cart.currency };
    cart.shippingTotal = { value: actualShippingTotal, currency: cart.currency };
    cart.taxTotal = { value: taxTotal, currency: cart.currency };
    cart.total = { value: Math.round(total * 100) / 100, currency: cart.currency };
};
