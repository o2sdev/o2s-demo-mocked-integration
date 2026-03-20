import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { getShippingOptionById } from '@o2s/integrations.mocked/modules/checkout/mapper';
import { mapProductBySku, mapProductByVariantId } from '@o2s/integrations.mocked/modules/products/mapper';
import { eq } from 'drizzle-orm';
import { Observable, forkJoin, from, of, switchMap, throwError } from 'rxjs';

import { Auth, Carts, Customers, Products } from '@o2s/framework/modules';

import { PROMOTIONS, buildCartItemFromProduct } from './carts.helpers';
import {
    UpdateCartData,
    assembleCart,
    mapCartItemInsertValues,
    mapCartTotalsValues,
    mapCreateCartValues,
    mapUpdateCartValues,
    paginateCartRows,
    sortCartRows,
} from './carts.mapper';
import { db, schema } from '@/db';

@Injectable()
export class CartsService extends Carts.Service {
    constructor(
        private readonly authService: Auth.Service,
        private readonly customersService: Customers.Service,
    ) {
        super();
    }

    // --- Private DB helpers ---

    private async fetchCart(id: string): Promise<Carts.Model.Cart | undefined> {
        const cartRows = await db.select().from(schema.carts).where(eq(schema.carts.id, id));
        const cartRow = cartRows[0];
        if (!cartRow) return undefined;

        const itemRows = await db.select().from(schema.cartItems).where(eq(schema.cartItems.cartId, id));
        return assembleCart(cartRow, itemRows);
    }

    private async fetchCartByCustomerId(customerId: string): Promise<Carts.Model.Cart | undefined> {
        const cartRows = await db.select().from(schema.carts).where(eq(schema.carts.customerId, customerId)).limit(1);
        const cartRow = cartRows[0];
        if (!cartRow) return undefined;

        const itemRows = await db.select().from(schema.cartItems).where(eq(schema.cartItems.cartId, cartRow.id));
        return assembleCart(cartRow, itemRows);
    }

    private async insertCart(data: Carts.Request.CreateCartBody): Promise<Carts.Model.Cart> {
        const values = mapCreateCartValues(data);
        const [cartRow] = await db.insert(schema.carts).values(values).returning();
        return assembleCart(cartRow!, []);
    }

    private async persistCartUpdate(id: string, data: UpdateCartData): Promise<Carts.Model.Cart | undefined> {
        const existing = await this.fetchCart(id);
        if (!existing) return undefined;

        const updateValues = mapUpdateCartValues(existing, data);
        await db.update(schema.carts).set(updateValues).where(eq(schema.carts.id, id));

        // Recalculate totals
        const updated = await this.fetchCart(id);
        if (updated) {
            const totals = mapCartTotalsValues(updated);
            await db.update(schema.carts).set(totals).where(eq(schema.carts.id, id));
        }

        return this.fetchCart(id);
    }

    private async persistDeleteCart(id: string): Promise<boolean> {
        const result = await db.delete(schema.carts).where(eq(schema.carts.id, id)).returning();
        return result.length > 0;
    }

    private async persistAddCartItem(
        cartId: string,
        data: Carts.Request.AddCartItemBody,
        locale?: string,
    ): Promise<Carts.Model.Cart | undefined> {
        const cart = await this.fetchCart(cartId);
        if (!cart) return undefined;

        let product: Products.Model.Product;
        try {
            if (data.variantId) {
                const found = mapProductByVariantId(data.variantId, locale);
                if (!found) return undefined;
                product = found;
            } else {
                product = mapProductBySku(data.sku, locale);
            }
        } catch {
            return undefined;
        }

        const existingItem = cart.items.data.find((item) => item.sku === product.sku);

        if (existingItem) {
            const newQuantity = existingItem.quantity + data.quantity;
            const newSubtotal = existingItem.price.value * newQuantity;
            const mergedMetadata =
                data.metadata && Object.keys(data.metadata).length > 0
                    ? { ...(existingItem.metadata || {}), ...data.metadata }
                    : existingItem.metadata;

            await db
                .update(schema.cartItems)
                .set({
                    quantity: newQuantity,
                    subtotalValue: String(newSubtotal),
                    totalValue: String(newSubtotal),
                    metadata: (mergedMetadata ?? {}) as Record<string, unknown>,
                })
                .where(eq(schema.cartItems.id, existingItem.id));
        } else {
            const newItem = buildCartItemFromProduct(product, data.quantity, cart.currency, data.metadata || {});
            const insertValues = mapCartItemInsertValues(newItem, cartId);
            await db.insert(schema.cartItems).values(insertValues);
        }

        return this.recalculateAndFetch(cartId);
    }

    private async persistUpdateCartItem(
        params: Carts.Request.UpdateCartItemParams,
        data: Carts.Request.UpdateCartItemBody,
    ): Promise<Carts.Model.Cart | undefined> {
        const cart = await this.fetchCart(params.cartId);
        if (!cart) return undefined;

        const item = cart.items.data.find((i) => i.id === params.itemId);
        if (!item) return undefined;

        if (data.quantity !== undefined) {
            if (data.quantity <= 0) {
                await db.delete(schema.cartItems).where(eq(schema.cartItems.id, params.itemId));
            } else {
                const newSubtotal = item.price.value * data.quantity;
                await db
                    .update(schema.cartItems)
                    .set({
                        quantity: data.quantity,
                        subtotalValue: String(newSubtotal),
                        totalValue: String(newSubtotal),
                    })
                    .where(eq(schema.cartItems.id, params.itemId));
            }
        }

        if (data.metadata !== undefined) {
            await db
                .update(schema.cartItems)
                .set({ metadata: data.metadata as Record<string, unknown> })
                .where(eq(schema.cartItems.id, params.itemId));
        }

        return this.recalculateAndFetch(params.cartId);
    }

    private async persistRemoveCartItem(
        params: Carts.Request.RemoveCartItemParams,
    ): Promise<Carts.Model.Cart | undefined> {
        const cart = await this.fetchCart(params.cartId);
        if (!cart) return undefined;

        const item = cart.items.data.find((i) => i.id === params.itemId);
        if (!item) return undefined;

        await db.delete(schema.cartItems).where(eq(schema.cartItems.id, params.itemId));

        return this.recalculateAndFetch(params.cartId);
    }

    private async persistApplyPromotion(
        params: Carts.Request.ApplyPromotionParams,
        data: Carts.Request.ApplyPromotionBody,
    ): Promise<Carts.Model.Cart | undefined> {
        const cart = await this.fetchCart(params.cartId);
        if (!cart) return undefined;

        const promotion = PROMOTIONS.find((p) => p.code === data.code);
        if (!promotion) return undefined;

        const promotions = cart.promotions ?? [];
        if (promotions.some((p) => p.id === promotion.id)) {
            return cart;
        }

        promotions.push(promotion);
        cart.promotions = promotions;

        const totals = mapCartTotalsValues(cart);
        await db
            .update(schema.carts)
            .set({
                promotions: promotions as unknown[],
                ...totals,
                updatedAt: new Date(),
            })
            .where(eq(schema.carts.id, params.cartId));

        return this.fetchCart(params.cartId);
    }

    private async persistRemovePromotion(
        params: Carts.Request.RemovePromotionParams,
    ): Promise<Carts.Model.Cart | undefined> {
        const cart = await this.fetchCart(params.cartId);
        if (!cart) return undefined;

        const promotions = cart.promotions ?? [];
        const promoIndex = promotions.findIndex((p) => p.code === params.code);
        if (promoIndex === -1) return cart;

        promotions.splice(promoIndex, 1);
        cart.promotions = promotions;

        const totals = mapCartTotalsValues(cart);
        await db
            .update(schema.carts)
            .set({
                promotions: promotions as unknown[],
                ...totals,
                updatedAt: new Date(),
            })
            .where(eq(schema.carts.id, params.cartId));

        return this.fetchCart(params.cartId);
    }

    /** Recalculate totals for a cart and persist, then return fresh cart. */
    private async recalculateAndFetch(cartId: string): Promise<Carts.Model.Cart | undefined> {
        const cart = await this.fetchCart(cartId);
        if (!cart) return undefined;

        const totals = mapCartTotalsValues(cart);
        await db
            .update(schema.carts)
            .set({ ...totals, updatedAt: new Date() })
            .where(eq(schema.carts.id, cartId));

        return this.fetchCart(cartId);
    }

    // --- Auth helper ---

    private assertCartAccess(cart: Carts.Model.Cart, authorization: string | undefined, action: string): void {
        if (cart.customerId) {
            if (!authorization) {
                throw new UnauthorizedException(`Authentication required to ${action} this cart`);
            }
            const customerId = this.authService.getCustomerId(authorization);
            if (cart.customerId !== customerId) {
                throw new UnauthorizedException(`Unauthorized to ${action} this cart`);
            }
        }
    }

    // --- Public service methods ---

    getCart(
        params: Carts.Request.GetCartParams,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart | undefined> {
        return from(this.fetchCart(params.id)).pipe(
            switchMap((cart) => {
                if (!cart) {
                    throw new NotFoundException('Cart not found');
                }
                this.assertCartAccess(cart, authorization, 'access');
                return of(cart);
            }),
        );
    }

    getCartList(
        query: Carts.Request.GetCartListQuery,
        authorization: string | undefined,
    ): Observable<Carts.Model.Carts> {
        if (!authorization) {
            return of({ data: [], total: 0 });
        }

        const customerId = this.authService.getCustomerId(authorization);
        if (!customerId) {
            return of({ data: [], total: 0 });
        }

        return from(
            (async () => {
                let cartRows = await db.select().from(schema.carts).where(eq(schema.carts.customerId, customerId));

                cartRows = sortCartRows(cartRows, query.sort);
                const total = cartRows.length;
                const paginatedRows = paginateCartRows(cartRows, query.offset ?? 0, query.limit ?? 10);

                const carts = await Promise.all(
                    paginatedRows.map(async (cartRow) => {
                        const itemRows = await db
                            .select()
                            .from(schema.cartItems)
                            .where(eq(schema.cartItems.cartId, cartRow.id));
                        return assembleCart(cartRow, itemRows);
                    }),
                );

                return { data: carts, total };
            })(),
        );
    }

    createCart(data: Carts.Request.CreateCartBody, authorization: string | undefined): Observable<Carts.Model.Cart> {
        if (!data.customerId && authorization) {
            const customerId = this.authService.getCustomerId(authorization);
            if (customerId) {
                data = { ...data, customerId };
            }
        }

        return from(this.insertCart(data));
    }

    updateCart(
        params: Carts.Request.UpdateCartParams,
        data: Carts.Request.UpdateCartBody,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return from(this.fetchCart(params.id)).pipe(
            switchMap((existingCart) => {
                if (!existingCart) {
                    throw new NotFoundException('Cart not found');
                }
                this.assertCartAccess(existingCart, authorization, 'update');
                return from(this.persistCartUpdate(params.id, data));
            }),
            switchMap((cart) => {
                if (!cart) {
                    throw new NotFoundException('Cart not found');
                }
                return of(cart);
            }),
        );
    }

    deleteCart(params: Carts.Request.DeleteCartParams, authorization: string | undefined): Observable<void> {
        return from(this.fetchCart(params.id)).pipe(
            switchMap((existingCart) => {
                if (!existingCart) {
                    throw new NotFoundException('Cart not found');
                }
                this.assertCartAccess(existingCart, authorization, 'delete');
                return from(this.persistDeleteCart(params.id));
            }),
            switchMap((deleted) => {
                if (!deleted) {
                    throw new NotFoundException('Cart not found');
                }
                return of(void 0);
            }),
        );
    }

    addCartItem(data: Carts.Request.AddCartItemBody, authorization: string | undefined): Observable<Carts.Model.Cart> {
        let customerId: string | undefined;

        if (authorization) {
            customerId = this.authService.getCustomerId(authorization);
        }

        if (data.cartId) {
            return from(this.fetchCart(data.cartId)).pipe(
                switchMap((existingCart) => {
                    if (!existingCart) {
                        throw new NotFoundException('Cart not found');
                    }
                    this.assertCartAccess(existingCart, authorization, 'modify');
                    return from(this.persistAddCartItem(data.cartId!, data, data.locale));
                }),
                switchMap((updatedCart) => {
                    if (!updatedCart) {
                        throw new NotFoundException('Cart or product not found');
                    }
                    return of(updatedCart);
                }),
            );
        }

        // No cartId provided — always create a new cart per session
        // (avoids sharing carts when multiple people use the same demo account)
        if (!data.currency) {
            throw new BadRequestException('Currency is required when creating a new cart');
        }
        const findOrCreate$ = from(
            this.insertCart({
                customerId,
                currency: data.currency,
                regionId: data.regionId,
            }),
        );

        return findOrCreate$.pipe(
            switchMap((cart) => from(this.persistAddCartItem(cart.id, data, data.locale))),
            switchMap((updatedCart) => {
                if (!updatedCart) {
                    throw new NotFoundException('Cart or product not found');
                }
                return of(updatedCart);
            }),
        );
    }

    updateCartItem(
        params: Carts.Request.UpdateCartItemParams,
        data: Carts.Request.UpdateCartItemBody,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return from(this.fetchCart(params.cartId)).pipe(
            switchMap((existingCart) => {
                if (!existingCart) {
                    throw new NotFoundException('Cart not found');
                }
                this.assertCartAccess(existingCart, authorization, 'modify');
                return from(this.persistUpdateCartItem(params, data));
            }),
            switchMap((cart) => {
                if (!cart) {
                    throw new NotFoundException('Cart or item not found');
                }
                return of(cart);
            }),
        );
    }

    removeCartItem(
        params: Carts.Request.RemoveCartItemParams,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return from(this.fetchCart(params.cartId)).pipe(
            switchMap((existingCart) => {
                if (!existingCart) {
                    throw new NotFoundException('Cart not found');
                }
                this.assertCartAccess(existingCart, authorization, 'modify');
                return from(this.persistRemoveCartItem(params));
            }),
            switchMap((cart) => {
                if (!cart) {
                    throw new NotFoundException('Cart or item not found');
                }
                return of(cart);
            }),
        );
    }

    applyPromotion(
        params: Carts.Request.ApplyPromotionParams,
        data: Carts.Request.ApplyPromotionBody,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return from(this.fetchCart(params.cartId)).pipe(
            switchMap((existingCart) => {
                if (!existingCart) {
                    throw new NotFoundException('Cart not found');
                }
                this.assertCartAccess(existingCart, authorization, 'modify');
                return from(this.persistApplyPromotion(params, data));
            }),
            switchMap((cart) => {
                if (!cart) {
                    throw new NotFoundException('Cart not found or invalid promotion code');
                }
                return of(cart);
            }),
        );
    }

    removePromotion(
        params: Carts.Request.RemovePromotionParams,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return from(this.fetchCart(params.cartId)).pipe(
            switchMap((existingCart) => {
                if (!existingCart) {
                    throw new NotFoundException('Cart not found');
                }
                this.assertCartAccess(existingCart, authorization, 'modify');
                return from(this.persistRemovePromotion(params));
            }),
            switchMap((cart) => {
                if (!cart) {
                    throw new NotFoundException('Cart not found');
                }
                return of(cart);
            }),
        );
    }

    getCurrentCart(_authorization: string | undefined): Observable<Carts.Model.Cart | undefined> {
        // Always return undefined — cart identity is managed client-side via localStorage
        // to avoid sharing carts when multiple people use the same demo account
        return of(undefined);
    }

    prepareCheckout(
        params: Carts.Request.PrepareCheckoutParams,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return from(this.fetchCart(params.cartId)).pipe(
            switchMap((cart) => {
                if (!cart) {
                    throw new NotFoundException(`Cart with ID ${params.cartId} not found`);
                }
                this.assertCartAccess(cart, authorization, 'prepare checkout for');

                if (!cart.items || cart.items.data.length === 0) {
                    throw new BadRequestException('Cart must have items before preparing checkout');
                }

                return of(cart);
            }),
        );
    }

    updateCartAddresses(
        params: Carts.Request.UpdateCartAddressesParams,
        data: Carts.Request.UpdateCartAddressesBody,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return from(this.fetchCart(params.cartId)).pipe(
            switchMap((existingCart) => {
                if (!existingCart) {
                    return throwError(() => new NotFoundException('Cart not found'));
                }

                if (existingCart.customerId) {
                    if (!authorization) {
                        return throwError(
                            () => new UnauthorizedException('Authentication required to update this cart'),
                        );
                    }
                    const customerId = this.authService.getCustomerId(authorization);
                    if (existingCart.customerId !== customerId) {
                        return throwError(() => new UnauthorizedException('Unauthorized to update this cart'));
                    }
                }

                const isGuest = !authorization;
                const hasAddressIdsOnly =
                    (data.shippingAddressId && !data.shippingAddress) ||
                    (data.billingAddressId && !data.billingAddress);
                if (isGuest && hasAddressIdsOnly) {
                    return throwError(() => new BadRequestException('Inline addresses required for guest checkout'));
                }

                const resolveAddresses$ = (): Observable<{
                    shippingAddress?: Carts.Model.Cart['shippingAddress'];
                    billingAddress?: Carts.Model.Cart['billingAddress'];
                }> => {
                    if (!authorization) {
                        return of({
                            shippingAddress: data.shippingAddress,
                            billingAddress: data.billingAddress,
                        });
                    }

                    const resolveAddress = (addr: Customers.Model.CustomerAddress | undefined, id: string) =>
                        addr ? of(addr.address) : throwError(() => new NotFoundException(`Address ${id} not found`));

                    const shipping$ =
                        data.shippingAddressId && !data.shippingAddress
                            ? this.customersService
                                  .getAddress({ id: data.shippingAddressId }, authorization)
                                  .pipe(switchMap((addr) => resolveAddress(addr, data.shippingAddressId!)))
                            : of(data.shippingAddress);

                    const billing$ =
                        data.billingAddressId && !data.billingAddress
                            ? this.customersService
                                  .getAddress({ id: data.billingAddressId }, authorization)
                                  .pipe(switchMap((addr) => resolveAddress(addr, data.billingAddressId!)))
                            : of(data.billingAddress);

                    return forkJoin([shipping$, billing$]).pipe(
                        switchMap(([shippingAddress, billingAddress]) =>
                            of({
                                shippingAddress: shippingAddress ?? existingCart.shippingAddress,
                                billingAddress: billingAddress ?? existingCart.billingAddress,
                            }),
                        ),
                    );
                };

                return resolveAddresses$().pipe(
                    switchMap(({ shippingAddress, billingAddress }) => {
                        const resolvedShippingAddress =
                            data.sameAsBillingAddress === true ? existingCart.billingAddress : shippingAddress;

                        const updateData: Carts.Request.UpdateCartBody = {
                            notes: data.notes,
                            email: data.email,
                            metadata: {
                                ...existingCart.metadata,
                                sameAsBillingAddress: data.sameAsBillingAddress ?? false,
                                ...(resolvedShippingAddress && { shippingAddress: resolvedShippingAddress }),
                                ...(billingAddress && { billingAddress }),
                            },
                        };

                        return from(this.persistCartUpdate(params.cartId, updateData)).pipe(
                            switchMap((cart) => {
                                if (!cart) {
                                    return throwError(() => new NotFoundException('Cart not found'));
                                }
                                return of(cart);
                            }),
                        );
                    }),
                );
            }),
        );
    }

    addShippingMethod(
        params: Carts.Request.AddShippingMethodParams,
        data: Carts.Request.AddShippingMethodBody,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return from(this.fetchCart(params.cartId)).pipe(
            switchMap((existingCart) => {
                if (!existingCart) {
                    throw new NotFoundException('Cart not found');
                }
                this.assertCartAccess(existingCart, authorization, 'modify');

                if (!existingCart.items || existingCart.items.data.length === 0) {
                    throw new BadRequestException('Cart must have items before adding shipping method');
                }

                const option = getShippingOptionById(data.shippingOptionId);
                if (!option) {
                    throw new BadRequestException(`Shipping option ${data.shippingOptionId} not found`);
                }

                return from(
                    this.persistCartUpdate(params.cartId, {
                        shippingMethod: {
                            id: option.id,
                            name: option.name,
                            description: option.description,
                            total: option.total,
                        },
                        shippingTotal: option.total,
                    }),
                );
            }),
            switchMap((cart) => {
                if (!cart) {
                    throw new NotFoundException('Cart not found');
                }
                return of(cart);
            }),
        );
    }
}
