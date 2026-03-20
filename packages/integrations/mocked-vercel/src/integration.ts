import { ApiConfig, Auth, Customers } from '@o2s/framework/modules';

import { Service as CartsService } from './modules/carts';

export * as Integration from './modules/index';

export const Config: Partial<ApiConfig['integrations']> = {
    carts: {
        name: 'mocked-vercel',
        service: CartsService,
        imports: [Auth.Module, Customers.Module],
    },
};
