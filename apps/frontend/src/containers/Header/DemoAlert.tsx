'use client';

import Cookies from 'js-cookie';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';

import { Button } from '@o2s/ui/elements/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@o2s/ui/elements/collapsible';
import { Link } from '@o2s/ui/elements/link';
import { Typography } from '@o2s/ui/elements/typography';

export const DemoAlert = () => {
    const t = useTranslations();

    const [demoHidden, setDemoHidden] = useState(false);

    return (
        <Collapsible
            open={!demoHidden}
            onOpenChange={() => {
                setDemoHidden(true);
                Cookies.set('demoHidden', 'true', { expires: 1 });
            }}
        >
            <CollapsibleContent defaultOpen={!demoHidden}>
                <div className="bg-primary text-primary-foreground">
                    <div className="px-4 md:px-6 py-2 ml-auto mr-auto w-full md:max-w-7xl">
                        <div className="flex gap-4 items-center justify-between">
                            <Typography variant="small">
                                {t('demoBar.info')}{' '}
                                <Link
                                    href="https://github.com/o2sdev/openselfservice/issues"
                                    target="_blank"
                                    className="text-primary-foreground underline"
                                >
                                    {t('demoBar.link')}
                                </Link>
                                .
                            </Typography>

                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-9 p-0 shrink-0">
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">{t('general.close')}</span>
                                </Button>
                            </CollapsibleTrigger>
                        </div>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};
