// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/i18n/provider";
import { LanguageSwitcher } from "./language-switcher";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    mocks.refresh.mockClear();
    document.cookie = "mr-locale=; Max-Age=0; Path=/";
  });

  it("starts with Spanish selected, switches by click, and persists the choice", () => {
    render(<LocaleProvider><LanguageSwitcher /></LocaleProvider>);
    const spanish = screen.getByRole("radio", { name: "Español" });
    const english = screen.getByRole("radio", { name: "Inglés" });
    expect(spanish).toHaveAttribute("aria-checked", "true");
    expect(english).toHaveAttribute("aria-checked", "false");

    fireEvent.click(english);
    expect(english).toHaveAttribute("aria-checked", "true");
    expect(document.cookie).toContain("mr-locale=en");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("supports arrow-key selection and focus movement", () => {
    render(<LocaleProvider><LanguageSwitcher /></LocaleProvider>);
    const spanish = screen.getByRole("radio", { name: "Español" });
    const english = screen.getByRole("radio", { name: "Inglés" });
    spanish.focus();
    fireEvent.keyDown(spanish, { key: "ArrowRight" });
    expect(document.activeElement).toBe(english);
    expect(english).toHaveAttribute("aria-checked", "true");
    expect(document.cookie).toContain("mr-locale=en");
  });
});
