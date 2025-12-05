// this is a function used for serverless deployments
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { LoggerService } from '@o2s/utils.logger';

import { AppModule } from '../dist/app.module';

// Keep the app instance in memory for subsequent requests
let app;

// TODO: check if code below an be unified with `main.ts` so there is no duplication
export default async function handler(req, res) {
    // Bootstrap our NestJS app on cold start
    if (!app) {
        const logLevel = process.env.LOG_LEVEL === 'info' ? 'log' : process.env.LOG_LEVEL;
        const logLevels = [logLevel];
        if (logLevel === 'debug') {
            logLevels.push('verbose');
        }

        app = await NestFactory.create(AppModule, {
            logger: logLevels,
        });

        if (process.env.API_PREFIX) {
            app.setGlobalPrefix(process.env.API_PREFIX);
        }

        const origins = process.env.FRONT_BASE_URLS.split(',');

        app.enableCors({
            origin: [...origins],
            preflightContinue: false,
            credentials: true,
            allowedHeaders: [
                'Content-Type',
                'Authorization',
                'Cookie',
                'Cache-Control',
                'Pragma',
                'Expires',
                'x-locale',
                'x-currency',
                'x-client-timezone',
            ],
            methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        });

        app.use(helmet());
        app.use(cookieParser());
        app.use(compression());

        app.useLogger(app.get(LoggerService));

        // This is important
        await app.init();
    }

    const adapterHost = app.get(HttpAdapterHost);
    const httpAdapter = adapterHost.httpAdapter;
    const instance = httpAdapter.getInstance();

    instance(req, res);
}
