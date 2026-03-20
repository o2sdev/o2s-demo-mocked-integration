import { ApiConfig, Auth, Carts, Customers, Payments } from '@o2s/framework/modules';

import { Service as CartsService } from './modules/carts';
import { Service as CheckoutService } from './modules/checkout';
import { Service as OrdersService } from './modules/orders';

export * as Integration from './modules/index';

export const Config: Partial<ApiConfig['integrations']> = {
    carts: {
        name: 'mocked-vercel',
        service: CartsService,
        imports: [Auth.Module, Customers.Module],
    },
    orders: {
        name: 'mocked-vercel',
        service: OrdersService,
        imports: [Auth.Module],
    },
    checkout: {
        name: 'mocked-vercel',
        service: CheckoutService,
        imports: [Auth.Module, Carts.Module, Customers.Module, Payments.Module],
    },
};
