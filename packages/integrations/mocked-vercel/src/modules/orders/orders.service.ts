import { Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Observable, from } from 'rxjs';

import { Auth, Orders } from '@o2s/framework/modules';

import { assembleOrder } from './orders.mapper';
import { mapOrder, mapOrders } from './orders.mocked';
import { db, schema } from '@/db';

@Injectable()
export class OrdersService extends Orders.Service {
    constructor(private readonly authService: Auth.Service) {
        super();
    }

    // --- Private DB helpers ---

    private async fetchOrder(id: string): Promise<Orders.Model.Order | undefined> {
        const orderRows = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
        const orderRow = orderRows[0];
        if (!orderRow) return undefined;

        const itemRows = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));
        return assembleOrder(orderRow, itemRows);
    }

    private async fetchOrdersByCustomerId(customerId: string): Promise<Orders.Model.Order[]> {
        const orderRows = await db.select().from(schema.orders).where(eq(schema.orders.customerId, customerId));

        const orders = await Promise.all(
            orderRows.map(async (orderRow) => {
                const itemRows = await db
                    .select()
                    .from(schema.orderItems)
                    .where(eq(schema.orderItems.orderId, orderRow.id));
                return assembleOrder(orderRow, itemRows);
            }),
        );

        return orders;
    }

    // --- Public service methods ---

    getOrder(
        params: Orders.Request.GetOrderParams,
        authorization: string | undefined,
    ): Observable<Orders.Model.Order | undefined> {
        return from(
            (async () => {
                // Check DB first (for orders placed via checkout)
                const dbOrder = await this.fetchOrder(params.id);
                if (dbOrder) {
                    if (dbOrder.customerId) {
                        if (!authorization) {
                            throw new UnauthorizedException('Unauthorized');
                        }
                        const customerId = this.authService.getCustomerId(authorization);
                        if (dbOrder.customerId !== customerId) {
                            throw new UnauthorizedException('Unauthorized');
                        }
                    }
                    return dbOrder;
                }

                // Fall back to mocked data
                const order = mapOrder(params);
                if (!order) return undefined;

                if (order.customerId) {
                    if (!authorization) {
                        throw new UnauthorizedException('Unauthorized');
                    }
                    const customerId = this.authService.getCustomerId(authorization);
                    if (order.customerId !== customerId) {
                        throw new UnauthorizedException('Unauthorized');
                    }
                }

                return order;
            })(),
        );
    }

    getOrderList(
        query: Orders.Request.GetOrderListQuery,
        authorization: string | undefined,
    ): Observable<Orders.Model.Orders> {
        if (!authorization) {
            throw new UnauthorizedException('Unauthorized');
        }

        const customerId = this.authService.getCustomerId(authorization);

        if (!customerId) {
            throw new UnauthorizedException('Unauthorized');
        }

        return from(
            (async () => {
                // Get DB orders (placed via checkout)
                const dbOrders = await this.fetchOrdersByCustomerId(customerId);

                // Get mocked orders
                const mockedResult = mapOrders(query, customerId);

                // Merge: DB orders first, then mocked — deduplicate by ID
                const seenIds = new Set(dbOrders.map((o) => o.id));
                const merged = [
                    ...dbOrders,
                    ...mockedResult.data.filter((o: Orders.Model.Order) => !seenIds.has(o.id)),
                ];

                // Apply filters
                const { status, paymentStatus, dateFrom, dateTo } = query;
                let filtered = merged.filter(
                    (order) =>
                        (!status || order.status === status) &&
                        (!paymentStatus || order.paymentStatus === paymentStatus) &&
                        (!dateFrom || new Date(order.createdAt) >= new Date(dateFrom)) &&
                        (!dateTo || new Date(order.createdAt) <= new Date(dateTo)),
                );

                // Sort
                const [field, direction] = (query.sort ?? 'createdAt_DESC').split('_');
                const isAscending = direction === 'ASC';
                filtered = filtered.sort((a, b) => {
                    const aVal = a[field as keyof Orders.Model.Order];
                    const bVal = b[field as keyof Orders.Model.Order];

                    if (field === 'createdAt' || field === 'updatedAt' || field === 'paymentDueDate') {
                        const aDate = new Date(aVal as string).getTime();
                        const bDate = new Date(bVal as string).getTime();
                        return isAscending ? aDate - bDate : bDate - aDate;
                    } else if (field === 'total' || field === 'subtotal') {
                        const aTotal = (aVal as { value: number }).value;
                        const bTotal = (bVal as { value: number }).value;
                        return isAscending ? aTotal - bTotal : bTotal - aTotal;
                    } else if (typeof aVal === 'string' && typeof bVal === 'string') {
                        return isAscending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                    }
                    return 0;
                });

                const total = filtered.length;
                const offset = query.offset ?? 0;
                const limit = query.limit ?? 10;
                const paginated = filtered.slice(Number(offset), Number(offset) + Number(limit));

                return { data: paginated, total };
            })(),
        );
    }
}
