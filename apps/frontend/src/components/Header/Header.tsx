'use client';

import Cookies from 'js-cookie';
import { X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useLocale } from 'next-intl';
import Image from 'next/image';
import React, { useState } from 'react';

import { Button } from '@o2s/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@o2s/ui/components/collapsible';
import { Link } from '@o2s/ui/components/link';
import { Typography } from '@o2s/ui/components/typography';

import { Link as NextLink } from '@/i18n';

import { LocaleSwitcher } from '../Auth/Toolbar/LocaleSwitcher';

import { ContextSwitcher } from './ContextSwitcher/ContextSwitcher';
import { DesktopNavigation } from './DesktopNavigation/DesktopNavigation';
import { HeaderProps } from './Header.types';
import { MobileNavigation } from './MobileNavigation/MobileNavigation';
import { NotificationInfo } from './NotificationInfo/NotificationInfo';
import { UserInfo } from './UserInfo/UserInfo';

const MOCK: { [key: string]: { info: string; link: string } } = {
    en: {
        info: 'You are currently viewing a demo version, where parts of the app may not be fully ready yet. If you notice any issues or want to give us your feedback, you can',
        link: 'do it here',
    },
    de: {
        info: 'Sie sehen derzeit eine Demoversion, in der Teile der App möglicherweise noch nicht vollständig fertiggestellt sind. Wenn Sie Probleme bemerken oder uns Ihr Feedback geben möchten, können Sie',
        link: 'das hier tun',
    },
    pl: {
        info: 'Obecnie przeglądasz wersję demonstracyjną, gdzie niektóre części aplikacji mogą nie być jeszcze w pełni gotowe. Jeśli zauważysz jakieś problemy lub chcesz przekazać nam swoją opinię, możesz',
        link: 'zrobić to tutaj',
    },
};

export const Header: React.FC<HeaderProps> = ({ headerData, isDemoHidden, children }) => {
    const session = useSession();
    const isSignedIn = session?.status === 'authenticated';

    const locale = useLocale();

    const [demoHidden, setDemoHidden] = useState(isDemoHidden);

    const LogoSlot = (
        <Link asChild>
            <NextLink href="/" aria-label={headerData.logo?.name}>
                {headerData.logo?.url && (
                    <Image
                        src={headerData.logo.url}
                        alt={headerData.logo.alternativeText ?? ''}
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

    const ContextSwitchSlot = () =>
        isSignedIn && headerData.contextSwitcher && <ContextSwitcher context={headerData.contextSwitcher} />;

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
                                    {(MOCK[locale] || MOCK.en)!.info}{' '}
                                    <Link
                                        href="https://github.com/o2sdev/openselfservice/issues"
                                        target="_blank"
                                        className="text-primary-foreground underline"
                                    >
                                        {(MOCK[locale] || MOCK.en)!.link}
                                    </Link>
                                    .
                                </Typography>

                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="w-9 p-0 shrink-0">
                                        <X className="h-4 w-4" />
                                        <span className="sr-only">Close</span>
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
