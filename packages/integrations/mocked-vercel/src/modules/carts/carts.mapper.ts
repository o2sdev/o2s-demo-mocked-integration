import { getMockProviderById, getPaymentMethodDisplay } from '@o2s/integrations.mocked/modules/payments/mocks';

import { Carts, Models, Products } from '@o2s/framework/modules';

import { mapPaymentMethodFromMetadata, recalculateCartTotals } from './carts.helpers';
import { schema } from '@/db';

export type CartRow = typeof schema.carts.$inferSelect;
export type CartItemRow = typeof schema.cartItems.$inferSelect;
export type CartInsertValues = typeof schema.carts.$inferInsert;
export type CartItemInsertValues = typeof schema.cartItems.$inferInsert;

// Extended update type for internal use (shippingMethod/shippingTotal from resolved option)
export type UpdateCartData = Carts.Request.UpdateCartBody & {
    shippingMethod?: Carts.Model.Cart['shippingMethod'];
    shippingTotal?: Models.Price.Price;
};

// --- Row-level transforms ---

const mapCartItemRow = (item: CartItemRow): Carts.Model.CartItem => ({
    id: item.id,
    sku: item.sku,
    quantity: item.quantity,
    price: { value: Number(item.priceValue), currency: item.currency as Models.Price.Currency },
    subtotal: { value: Number(item.subtotalValue), currency: item.currency as Models.Price.Currency },
    discountTotal: { value: Number(item.discountTotalValue), currency: item.currency as Models.Price.Currency },
    total: { value: Number(item.totalValue), currency: item.currency as Models.Price.Currency },
    unit: (item.unit ?? 'PCS') as Carts.Model.CartItem['unit'],
    currency: item.currency as Models.Price.Currency,
    product: item.product as Products.Model.Product,
    metadata: (item.metadata as Record<string, unknown>) ?? {},
});

/** Assemble a Cart model from a DB cart row + item rows. */
export const assembleCart = (cartRow: CartRow, itemRows: CartItemRow[]): Carts.Model.Cart => {
    const currency = cartRow.currency as Models.Price.Currency;
    const items = itemRows.map(mapCartItemRow);

    return {
        id: cartRow.id,
        customerId: cartRow.customerId ?? undefined,
        name: cartRow.name ?? undefined,
        createdAt: cartRow.createdAt.toISOString(),
        updatedAt: cartRow.updatedAt.toISOString(),
        expiresAt: cartRow.expiresAt?.toISOString(),
        regionId: cartRow.regionId ?? undefined,
        currency,
        items: { data: items, total: items.length },
        subtotal: { value: Number(cartRow.subtotal), currency },
        discountTotal: { value: Number(cartRow.discountTotal), currency },
        taxTotal: { value: Number(cartRow.taxTotal), currency },
        shippingTotal: { value: Number(cartRow.shippingTotal), currency },
        total: { value: Number(cartRow.total), currency },
        shippingAddress: (cartRow.shippingAddress as Models.Address.Address) ?? undefined,
        billingAddress: (cartRow.billingAddress as Models.Address.Address) ?? undefined,
        shippingMethod: (cartRow.shippingMethod as Carts.Model.Cart['shippingMethod']) ?? undefined,
        paymentMethod: (cartRow.paymentMethod as Carts.Model.PaymentMethod) ?? undefined,
        promotions: (cartRow.promotions as Carts.Model.Promotion[]) ?? [],
        metadata: (cartRow.metadata as Record<string, unknown>) ?? {},
        notes: cartRow.notes ?? undefined,
        email: cartRow.email ?? undefined,
    };
};

// --- Request → DB insert/update values ---

/** Map CreateCartBody to DB insert values. */
export const mapCreateCartValues = (data: Carts.Request.CreateCartBody): CartInsertValues => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
        id: `CART-${crypto.randomUUID()}`,
        customerId: data.customerId ?? null,
        name: data.name ?? null,
        createdAt: now,
        updatedAt: now,
        expiresAt,
        regionId: data.regionId ?? null,
        currency: data.currency,
        metadata: data.metadata || {},
        promotions: [],
        subtotal: '0',
        discountTotal: '0',
        taxTotal: '0',
        shippingTotal: '0',
        total: '0',
    };
};

/** Map existing cart + update data to DB update set values. */
export const mapUpdateCartValues = (existing: Carts.Model.Cart, data: UpdateCartData): Record<string, unknown> => {
    // Merge metadata
    const mergedMetadata = {
        ...(existing.metadata || {}),
        ...(data.metadata || {}),
    };

    // Extract addresses from metadata if they exist
    const shippingAddressFromMetadata = mergedMetadata.shippingAddress as Models.Address.Address | undefined;
    const billingAddressFromMetadata = mergedMetadata.billingAddress as Models.Address.Address | undefined;

    // Validate metadata.paymentMethod against known providers
    if (mergedMetadata.paymentMethod && typeof mergedMetadata.paymentMethod === 'object') {
        const metaPm = mergedMetadata.paymentMethod as Record<string, unknown>;
        if (metaPm.id && !getMockProviderById(metaPm.id as string)) {
            delete mergedMetadata.paymentMethod;
        }
    }

    // Resolve payment method
    const paymentMethod = data.paymentMethodId
        ? (getPaymentMethodDisplay(data.paymentMethodId) as Carts.Model.PaymentMethod | undefined)
        : (mapPaymentMethodFromMetadata(mergedMetadata) ?? existing.paymentMethod);

    return {
        name: data.name ?? existing.name ?? null,
        regionId: data.regionId ?? existing.regionId ?? null,
        email: data.email ?? existing.email ?? null,
        notes: data.notes ?? existing.notes ?? null,
        metadata: mergedMetadata,
        shippingAddress: (shippingAddressFromMetadata ?? existing.shippingAddress) as unknown as Record<
            string,
            unknown
        > | null,
        billingAddress: (billingAddressFromMetadata ?? existing.billingAddress) as unknown as Record<
            string,
            unknown
        > | null,
        shippingMethod: (data.shippingMethod ?? existing.shippingMethod) as unknown as Record<string, unknown> | null,
        shippingTotal: String(data.shippingTotal?.value ?? existing.shippingTotal?.value ?? 0),
        paymentMethod: (paymentMethod ?? existing.paymentMethod) as unknown as Record<string, unknown> | null,
        updatedAt: new Date(),
    };
};

/** Map a CartItem model to DB insert values for the cart_items table. */
export const mapCartItemInsertValues = (item: Carts.Model.CartItem, cartId: string): CartItemInsertValues => ({
    id: item.id,
    cartId,
    sku: item.sku,
    quantity: item.quantity,
    priceValue: String(item.price.value),
    subtotalValue: String(item.subtotal?.value ?? 0),
    discountTotalValue: String(item.discountTotal?.value ?? 0),
    totalValue: String(item.total.value),
    unit: (item.unit as string) ?? null,
    currency: item.currency,
    product: item.product as unknown as Record<string, unknown>,
    metadata: (item.metadata ?? {}) as Record<string, unknown>,
});

/** Recalculate totals on a Cart model and return the DB update values for the carts table. */
export const mapCartTotalsValues = (
    cart: Carts.Model.Cart,
): { subtotal: string; discountTotal: string; taxTotal: string; shippingTotal: string; total: string } => {
    recalculateCartTotals(cart);
    return {
        subtotal: String(cart.subtotal?.value ?? 0),
        discountTotal: String(cart.discountTotal?.value ?? 0),
        taxTotal: String(cart.taxTotal?.value ?? 0),
        shippingTotal: String(cart.shippingTotal?.value ?? 0),
        total: String(cart.total.value),
    };
};

// --- List helpers ---

/** Sort cart rows in memory (matching mocked behavior). */
export const sortCartRows = (cartRows: CartRow[], sort: string | undefined): CartRow[] => {
    if (!sort) return cartRows;

    const [field, order] = sort.split('_');
    const isAscending = order === 'ASC';

    return [...cartRows].sort((a, b) => {
        if (field === 'createdAt' || field === 'updatedAt') {
            const aDate = a[field].getTime();
            const bDate = b[field].getTime();
            return isAscending ? aDate - bDate : bDate - aDate;
        } else if (field === 'total') {
            return isAscending ? Number(a.total) - Number(b.total) : Number(b.total) - Number(a.total);
        }
        return 0;
    });
};

/** Paginate cart rows. */
export const paginateCartRows = (cartRows: CartRow[], offset: number, limit: number): CartRow[] => {
    return cartRows.slice(Number(offset), Number(offset) + Number(limit));
};
