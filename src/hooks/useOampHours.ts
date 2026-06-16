import { useEffect, useMemo, useState } from "react";

import { OAMP_HOURS, type OampWeekday } from "@/constants/oamp";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";

const WEEKDAYS: OampWeekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const SEARCH_DAYS = 7;

export function useOampHours() {
  const { locale } = useLocale();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  return useMemo(() => {
    const currentDay = WEEKDAYS[now.getDay()];
    const currentHours = OAMP_HOURS[currentDay];
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const isOpen = Boolean(currentHours && currentHour >= currentHours[0] && currentHour < currentHours[1]);

    if (isOpen) {
      return { isOpen: true, nextOpenLabel: null as string | null };
    }

    const next = nextOpening(now);
    if (!next) {
      return { isOpen: false, nextOpenLabel: null as string | null };
    }

    return {
      isOpen: false,
      nextOpenLabel: t("oamp.actionables.closedUntil", {
        day: t(`oamp.days.${next.day}` as const),
        time: formatHour(next.hour),
      }),
    };
    // `locale` isn't referenced directly but t() reads it at call time — keep it
    // so the labels re-translate when the user switches language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, now]);
}

function nextOpening(now: Date): { day: OampWeekday; hour: number } | null {
  const todayIndex = now.getDay();
  const currentHour = now.getHours() + now.getMinutes() / 60;

  for (let offset = 0; offset < SEARCH_DAYS; offset += 1) {
    const day = WEEKDAYS[(todayIndex + offset) % 7];
    const hours = OAMP_HOURS[day];
    if (!hours) continue;
    if (offset === 0 && currentHour >= hours[0]) continue;
    return { day, hour: hours[0] };
  }

  return null;
}

function formatHour(hour: number) {
  return `${hour}:00`;
}
