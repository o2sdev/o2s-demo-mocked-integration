import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { Carts, Checkout, Orders, Payments } from '@o2s/framework/modules';

import {
    anonymizeOrder,
    mapOrderFromCart,
    mapOrderInsertValues,
    mapOrderItemInsertValues,
} from '../orders/orders.mapper';

import { mapCheckoutSummary, mapPlaceOrderResponse, mapShippingOptions } from './checkout.mapper';
import { db, schema } from '@/db';

@Injectable()
export class CheckoutService extends Checkout.Service {
    constructor(
        private readonly cartsService: Carts.Service,
        private readonly paymentsService: Payments.Service,
    ) {
        super();
    }

    /** Persist an order to the database with personal data anonymized. */
    private async insertOrder(order: Orders.Model.Order): Promise<void> {
        const anonymized = anonymizeOrder(order);
        const orderValues = mapOrderInsertValues(anonymized);
        await db.insert(schema.orders).values(orderValues);

        if (anonymized.items.data.length > 0) {
            const itemValues = anonymized.items.data.map((item) => mapOrderItemInsertValues(item, anonymized.id));
            await db.insert(schema.orderItems).values(itemValues);
        }
    }

    setAddresses(
        params: Checkout.Request.SetAddressesParams,
        data: Checkout.Request.SetAddressesBody,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return this.cartsService.getCart({ id: params.cartId }, authorization).pipe(
            switchMap((cart) => {
                if (!cart) {
                    return throwError(() => new NotFoundException(`Cart with ID ${params.cartId} not found`));
                }

                if (!cart.items?.data?.length) {
                    return throwError(() => new BadRequestException('Cart must have items before checkout'));
                }

                return this.cartsService.updateCartAddresses({ cartId: params.cartId }, data, authorization);
            }),
        );
    }

    setShippingMethod(
        params: Checkout.Request.SetShippingMethodParams,
        data: Checkout.Request.SetShippingMethodBody,
        authorization: string | undefined,
    ): Observable<Carts.Model.Cart> {
        return this.cartsService.getCart({ id: params.cartId }, authorization).pipe(
            switchMap((cart) => {
                if (!cart) {
                    return throwError(() => new NotFoundException(`Cart with ID ${params.cartId} not found`));
                }

                if (!cart.items || cart.items.data.length === 0) {
                    return throwError(
                        () => new BadRequestException('Cart must have items before adding shipping method'),
                    );
                }

                return this.cartsService.addShippingMethod(
                    { cartId: params.cartId },
                    { shippingOptionId: data.shippingOptionId },
                    authorization,
                );
            }),
        );
    }

    setPayment(
        params: Checkout.Request.SetPaymentParams,
        data: Checkout.Request.SetPaymentBody,
        authorization: string | undefined,
    ): Observable<Payments.Model.PaymentSession> {
        return this.cartsService.getCart({ id: params.cartId }, authorization).pipe(
            switchMap((cart) => {
                if (!cart) {
                    return throwError(() => new NotFoundException(`Cart with ID ${params.cartId} not found`));
                }

                return this.paymentsService
                    .createSession(
                        {
                            cartId: params.cartId,
                            providerId: data.providerId,
                            returnUrl: data.returnUrl,
                            cancelUrl: data.cancelUrl,
                            metadata: data.metadata,
                        },
                        authorization,
                    )
                    .pipe(
                        switchMap((session) => {
                            return this.cartsService
                                .updateCart(
                                    { id: params.cartId },
                                    {
                                        metadata: {
                                            ...cart.metadata,
                                            paymentSessionId: session.id,
                                            paymentMethod: {
                                                id: session.providerId,
                                                name: session.providerId,
                                                type: 'OTHER',
                                            },
                                        },
                                    },
                                    authorization,
                                )
                                .pipe(map(() => session));
                        }),
                    );
            }),
        );
    }

    getCheckoutSummary(
        params: Checkout.Request.GetCheckoutSummaryParams,
        authorization: string | undefined,
    ): Observable<Checkout.Model.CheckoutSummary> {
        return this.cartsService.getCart({ id: params.cartId }, authorization).pipe(
            switchMap((cart) => {
                if (!cart) {
                    return throwError(() => new NotFoundException(`Cart with ID ${params.cartId} not found`));
                }

                const paymentSessionId = cart.metadata?.paymentSessionId as string | undefined;

                if (paymentSessionId) {
                    return this.paymentsService
                        .getSession({ id: paymentSessionId }, authorization)
                        .pipe(map((session) => mapCheckoutSummary(cart, session, params.locale)));
                }

                return of(mapCheckoutSummary(cart, undefined, params.locale));
            }),
        );
    }

    placeOrder(
        params: Checkout.Request.PlaceOrderParams,
        data: Checkout.Request.PlaceOrderBody | undefined,
        authorization: string | undefined,
    ): Observable<Checkout.Model.PlaceOrderResponse> {
        return this.cartsService.getCart({ id: params.cartId }, authorization).pipe(
            switchMap((cart) => {
                if (!cart) {
                    return throwError(() => new NotFoundException('Cart not found'));
                }

                if (!cart.items?.data?.length) {
                    return throwError(() => new BadRequestException('Cart must have items before placing order'));
                }

                if (!cart.shippingAddress || !cart.billingAddress) {
                    return throwError(() => new BadRequestException('Shipping and billing addresses are required'));
                }

                if (!cart.shippingMethod) {
                    return throwError(() => new BadRequestException('Shipping method is required'));
                }

                const paymentSessionId = cart.metadata?.paymentSessionId as string | undefined;
                if (!paymentSessionId) {
                    return throwError(() => new BadRequestException('Payment session is required'));
                }

                const email = data?.email || cart.email;

                // Create order from cart
                const order = mapOrderFromCart(cart, email);

                // Persist to database instead of in-memory array, then delete the cart
                return new Observable<Checkout.Model.PlaceOrderResponse>((subscriber) => {
                    this.insertOrder(order)
                        .then(() => {
                            // Delete cart after persisting order
                            this.cartsService.deleteCart({ id: params.cartId }, authorization).subscribe({
                                next: () => {},
                                error: () => {
                                    // Cart deletion failure is non-critical
                                },
                            });

                            // Get payment session for redirect URL
                            this.paymentsService
                                .getSession({ id: paymentSessionId! }, authorization)
                                .pipe(map((session) => mapPlaceOrderResponse(order, session, params.locale)))
                                .subscribe({
                                    next: (response) => {
                                        subscriber.next(response);
                                        subscriber.complete();
                                    },
                                    error: (err) => subscriber.error(err),
                                });
                        })
                        .catch((err) => subscriber.error(err));
                });
            }),
        );
    }

    getShippingOptions(
        params: Checkout.Request.GetShippingOptionsParams,
        _authorization?: string,
    ): Observable<Checkout.Model.ShippingOptions> {
        return of(mapShippingOptions(params.locale));
    }

    completeCheckout(
        params: Checkout.Request.CompleteCheckoutParams,
        data: Checkout.Request.CompleteCheckoutBody,
        authorization: string | undefined,
    ): Observable<Checkout.Model.PlaceOrderResponse> {
        return this.setAddresses(
            { cartId: params.cartId },
            {
                shippingAddressId: data.shippingAddressId,
                shippingAddress: data.shippingAddress,
                billingAddressId: data.billingAddressId,
                billingAddress: data.billingAddress,
                notes: data.notes,
                email: data.email,
            },
            authorization,
        ).pipe(
            switchMap(() =>
                data.shippingMethodId
                    ? this.setShippingMethod(
                          { cartId: params.cartId },
                          { shippingOptionId: data.shippingMethodId },
                          authorization,
                      )
                    : of(null),
            ),
            switchMap(() =>
                this.setPayment(
                    { cartId: params.cartId },
                    {
                        providerId: data.paymentProviderId,
                        returnUrl: data.returnUrl,
                        cancelUrl: data.cancelUrl,
                        metadata: data.metadata,
                    },
                    authorization,
                ),
            ),
            switchMap(() =>
                this.placeOrder(
                    { cartId: params.cartId },
                    {
                        email: data.email,
                    },
                    authorization,
                ),
            ),
        );
    }
}
