import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, normalizeLocale, type Locale, getMessages } from "./messages";

export const LOCALE_COOKIE = "mr-locale";

export const getServerLocale: () => Promise<Locale> = cache(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return value ? normalizeLocale(value) : DEFAULT_LOCALE;
});

export async function getServerMessages() {
  const locale = await getServerLocale();
  return { locale, messages: getMessages(locale) };
}
