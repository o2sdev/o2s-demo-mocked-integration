'use client';

import Cookies from 'js-cookie';
import { X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';

import { Button } from '@o2s/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@o2s/ui/components/collapsible';
import { Link } from '@o2s/ui/components/link';
import { Typography } from '@o2s/ui/components/typography';

import { Link as NextLink } from '@/i18n';

import { Image } from '@/components/Image/Image';

import { LocaleSwitcher } from '../Auth/Toolbar/LocaleSwitcher';
import { ContextSwitcher } from '../ContextSwitcher/ContextSwitcher';

import { DesktopNavigation } from './DesktopNavigation/DesktopNavigation';
import { HeaderProps } from './Header.types';
import { MobileNavigation } from './MobileNavigation/MobileNavigation';
import { NotificationInfo } from './NotificationInfo/NotificationInfo';
import { UserInfo } from './UserInfo/UserInfo';

export const Header: React.FC<HeaderProps> = ({ headerData, isDemoHidden, children }) => {
    const session = useSession();
    const isSignedIn = !!session.data?.user;

    const t = useTranslations();

    const [demoHidden, setDemoHidden] = useState(isDemoHidden);

    const LogoSlot = (
        <Link asChild>
            {/*TODO: get label from API*/}
            <NextLink href="/" aria-label={'go to home'}>
                {headerData.logo?.url && (
                    <Image
                        src={headerData.logo.url}
                        alt={headerData.logo.alt}
                        width={headerData.logo.width}
                        height={headerData.logo.height}
                    />
                )}
            </NextLink>
        </Link>
    );

    const UserSlot = () => {
        if (!isSignedIn || !headerData.userInfo) {
            return undefined;
        }

        return <UserInfo user={session?.data?.user} userInfo={headerData.userInfo} />;
    };

    const NotificationSlot = () => {
        if (!isSignedIn || !headerData.notification?.url || !headerData.notification?.label) {
            return null;
        }

        return <NotificationInfo data={{ url: headerData.notification.url, label: headerData.notification.label }} />;
    };

    const LocaleSlot = () => {
        return <LocaleSwitcher label={headerData.languageSwitcherLabel ?? 'Language'} />;
    };

    const ContextSwitchSlot = () => isSignedIn && <ContextSwitcher data={headerData.contextSwitcher} />;

    return (
        <>
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
            <header className="flex flex-col gap-4">
                <>
                    <div className="md:block hidden">
                        <DesktopNavigation
                            logoSlot={LogoSlot}
                            contextSlot={<ContextSwitchSlot />}
                            localeSlot={<LocaleSlot />}
                            notificationSlot={<NotificationSlot />}
                            userSlot={<UserSlot />}
                            items={headerData.items}
                        />
                    </div>
                    <div className="md:hidden">
                        <MobileNavigation
                            logoSlot={LogoSlot}
                            contextSlot={<ContextSwitchSlot />}
                            localeSlot={<LocaleSlot />}
                            notificationSlot={<NotificationSlot />}
                            userSlot={<UserSlot />}
                            items={headerData.items}
                            title={headerData.title}
                            mobileMenuLabel={headerData.mobileMenuLabel}
                        />
                    </div>
                </>
                {children}
            </header>
        </>
    );
};
