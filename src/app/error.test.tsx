// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/i18n/provider";
import ErrorPage from "./error";
import { classifyViewError } from "./error-classification";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("localized route errors", () => {
  it("distinguishes data, configuration and rendering failures", () => {
    expect(classifyViewError(Object.assign(new Error("Database query failed (read)"), { name: "DataAccessError" }))).toBe("data");
    expect(classifyViewError(Object.assign(new Error("Invalid server environment: URL"), { name: "ConfigurationError" }))).toBe("configuration");
    expect(classifyViewError(new TypeError("marketDetailLabel is not a function"))).toBe("render");
  });

  it("shows a rendering error in Spanish without blaming Supabase", () => {
    const retry = vi.fn();
    render(<LocaleProvider initialLocale="es"><ErrorPage error={new TypeError("marketDetailLabel is not a function")} retry={retry} /></LocaleProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo mostrar esta vista");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Supabase");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows a data error in English", () => {
    render(<LocaleProvider initialLocale="en"><ErrorPage error={Object.assign(new Error("Database query failed (read)"), { name: "DataAccessError" })} retry={() => undefined} /></LocaleProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Market data unavailable");
  });
});
