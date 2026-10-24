import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Appendix Merger workspace", () => {
  it("opens in the Hebrew Appendix Compilation and exposes Quick Merge as a secondary workflow", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("heading", { name: "עריכת תיק נספחים" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "מיזוג מהיר" }));

    expect(screen.getByRole("heading", { name: "מיזוג מהיר" })).toBeInTheDocument();
    expect(screen.getByText("מיזוג נקי של קבצים, ללא שערים ותוכן עניינים.")).toBeInTheDocument();
  });
});
