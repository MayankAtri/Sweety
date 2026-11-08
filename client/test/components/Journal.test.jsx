import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DailyView from "../../src/components/DailyView.jsx";
import DateNavigation from "../../src/components/DateNavigation.jsx";
const empty = {
  readings: [],
  count: 0,
  average: null,
  highest: null,
  lowest: null,
};
const props = (extra = {}) => ({
  report: empty,
  date: "2026-11-08",
  onSave: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  ...extra,
});
describe("inline journal", () => {
  it.each(["", "39", "601", "110.5"])(
    "rejects invalid value %s",
    async (value) => {
      const p = props();
      render(<DailyView {...p} />);
      const user = userEvent.setup();
      if (value) await user.type(screen.getByLabelText("Glucose value"), value);
      await user.click(screen.getByRole("button", { name: "Save reading" }));
      expect(screen.getByRole("alert")).toBeVisible();
      expect(p.onSave).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Glucose value")).toHaveFocus();
    },
  );
  it.each([40, 600])(
    "saves inclusive boundary %s for selected slot",
    async (value) => {
      const p = props();
      render(<DailyView {...p} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("radio", { name: /After lunch/ }));
      await user.type(screen.getByLabelText("Glucose value"), String(value));
      await user.click(screen.getByRole("button", { name: "Save reading" }));
      expect(p.onSave).toHaveBeenCalledWith({
        date: "2026-11-08",
        slot: "after_lunch",
        value,
      });
    },
  );
  it("preserves value on server conflict then allows retry", async () => {
    const p = props({
      onSave: vi
        .fn()
        .mockRejectedValueOnce(new Error("Conflict"))
        .mockResolvedValueOnce({}),
    });
    render(<DailyView {...p} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Glucose value"), "123");
    await user.click(screen.getByRole("button", { name: "Save reading" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Conflict");
    expect(screen.getByLabelText("Glucose value")).toHaveValue(123);
    await user.click(screen.getByRole("button", { name: "Save reading" }));
    expect(p.onSave).toHaveBeenCalledTimes(2);
  });
  it("offers edit instead of overwriting a recorded slot", async () => {
    const reading = { id: "1", date: "2026-11-08", slot: "morning", value: 96 };
    const p = props({ report: { ...empty, readings: [reading], count: 1 } });
    render(<DailyView {...p} />);
    await userEvent.click(screen.getByRole("radio", { name: /Morning/ }));
    expect(
      screen.queryByRole("button", { name: "Save reading" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit reading" }));
    expect(p.onEdit).toHaveBeenCalledWith(reading);
  });
  it("guards duplicate submission while pending", async () => {
    let finish;
    const p = props({
      onSave: vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    });
    render(<DailyView {...p} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Glucose value"), "110");
    await user.dblClick(screen.getByRole("button", { name: "Save reading" }));
    expect(p.onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    finish();
  });
});
describe("week navigation", () => {
  it("keeps correct weekday dates and prevents future selection", () => {
    render(
      <DateNavigation
        date="2026-11-04"
        today="2026-11-04"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "4 Nov 2026" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "5 Nov 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
  });
  it("caps next-week movement at today and supports year boundaries", async () => {
    const onChange = vi.fn();
    render(
      <DateNavigation
        date="2025-12-31"
        today="2026-01-05"
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(onChange).toHaveBeenCalledWith("2026-01-05");
  });
  it("does not offer dates before the supported minimum", () => {
    render(
      <DateNavigation
        date="0001-02-01"
        today="2026-11-08"
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Previous week" }),
    ).toBeDisabled();
  });
});
