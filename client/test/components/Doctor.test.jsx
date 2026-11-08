import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DoctorView from "../../src/components/DoctorView.jsx";
import App from "../../src/App.jsx";
import { api } from "../../src/lib.js";

vi.mock("../../src/lib.js", async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));
vi.mock("../../src/components/ReportsView.jsx", () => ({
  default: ({ reports }) => <div>Report average: {reports.daily.average}</div>,
}));
const patients = [
  { id: "2", name: "Ada Patient", email: "ada@sweety.example" },
  { id: "3", name: "Ben Patient", email: "ben@sweety.example" },
];
const list = { patients, page: 1, limit: 12, total: 2 };
const reports = (value = 123) => ({
  daily: { count: 1, average: value, readings: [{ slot: "morning", value }] },
});
const props = () => ({
  userId: "1",
  date: "2026-11-08",
  today: "2026-11-08",
  onDateChange: vi.fn(),
  onExpired: vi.fn(),
});
const defaults = (path) => {
  if (path.startsWith("/doctor/patients?")) return Promise.resolve(list);
  if (path.endsWith("/reports?date=2026-11-08"))
    return Promise.resolve(reports());
  if (path.endsWith("/trends?date=2026-11-08"))
    return Promise.resolve({ readings: [] });
  throw new Error(`Unexpected API call ${path}`);
};
beforeEach(() => {
  vi.clearAllMocks();
  api.mockImplementation(defaults);
});

describe("doctor workspace", () => {
  it("requires an explicit assigned-patient selection and only reads their reports", async () => {
    render(<DoctorView {...props()} />);
    await screen.findByLabelText("Patient");
    expect(api).toHaveBeenCalledTimes(1);
    await userEvent.selectOptions(screen.getByLabelText("Patient"), "2");
    expect(await screen.findByText("Report average: 123")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Ada Patient" })).toBeVisible();
    expect(screen.getByText("123")).toBeVisible();
    expect(screen.getAllByText("Not recorded")).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: /add reading|edit|delete/i }),
    ).not.toBeInTheDocument();
    expect(
      api.mock.calls.every(
        ([path, options]) => path.startsWith("/doctor/") && !options.method,
      ),
    ).toBe(true);
  });
  it("shows the unassigned state without requesting patient data", async () => {
    api.mockResolvedValue({ patients: [], page: 1, limit: 12, total: 0 });
    render(<DoctorView {...props()} />);
    expect(await screen.findByText("No assigned patients yet")).toBeVisible();
    expect(screen.queryByLabelText("Patient")).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("retries a failed patient list", async () => {
    api.mockRejectedValueOnce(new Error("Connection lost"));
    render(<DoctorView {...props()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection lost",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Patient")).toBeVisible();
  });
  it("ignores a late response for the previously selected patient", async () => {
    let finishAda;
    api.mockImplementation((path) =>
      path === "/doctor/patients/2/reports?date=2026-11-08"
        ? new Promise((resolve) => {
            finishAda = resolve;
          })
        : path === "/doctor/patients/3/reports?date=2026-11-08"
          ? Promise.resolve(reports(145))
          : defaults(path),
    );
    render(<DoctorView {...props()} />);
    await userEvent.selectOptions(await screen.findByLabelText("Patient"), "2");
    await userEvent.selectOptions(screen.getByLabelText("Patient"), "3");
    expect(await screen.findByText("Report average: 145")).toBeVisible();
    finishAda(reports(96));
    await waitFor(() =>
      expect(screen.queryByText("Report average: 96")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Ben Patient" })).toBeVisible();
  });
  it("clears patient reports when refreshed assignments revoke access", async () => {
    render(<DoctorView {...props()} />);
    await userEvent.selectOptions(await screen.findByLabelText("Patient"), "2");
    await screen.findByText("Report average: 123");
    api.mockResolvedValue({ patients: [], page: 1, limit: 12, total: 0 });
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    expect(await screen.findByText("No assigned patients yet")).toBeVisible();
    expect(screen.queryByText("Report average: 123")).not.toBeInTheDocument();
  });
  it("shows revoked report access without retaining previous report data", async () => {
    const p = props();
    const { rerender } = render(<DoctorView {...p} />);
    await userEvent.selectOptions(await screen.findByLabelText("Patient"), "2");
    await screen.findByText("Report average: 123");
    api.mockRejectedValue(
      Object.assign(new Error("Patient not found."), { status: 404 }),
    );
    rerender(<DoctorView {...p} date="2026-11-07" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Patient not found.",
    );
    expect(screen.queryByText("Report average: 123")).not.toBeInTheDocument();
  });
  it("expires the session on a 401 response", async () => {
    const p = props();
    api.mockRejectedValue(
      Object.assign(new Error("Please log in"), { status: 401 }),
    );
    render(<DoctorView {...p} />);
    await waitFor(() => expect(p.onExpired).toHaveBeenCalledOnce());
  });
  it("paginates assignments without carrying the old selection", async () => {
    api.mockImplementation((path) =>
      path === "/doctor/patients?page=1&limit=12"
        ? Promise.resolve({ ...list, total: 13 })
        : path === "/doctor/patients?page=2&limit=12"
          ? Promise.resolve({
              patients: [
                {
                  id: "14",
                  name: "Last Patient",
                  email: "last@sweety.example",
                },
              ],
              page: 2,
              limit: 12,
              total: 13,
            })
          : defaults(path),
    );
    render(<DoctorView {...props()} />);
    await userEvent.selectOptions(await screen.findByLabelText("Patient"), "2");
    await screen.findByText("Report average: 123");
    await userEvent.click(
      screen.getByRole("button", { name: "Next", exact: true }),
    );
    expect(
      await screen.findByRole("option", { name: /Last Patient/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Patient")).toHaveValue("");
    expect(screen.queryByText("Report average: 123")).not.toBeInTheDocument();
  });
});

describe("doctor app shell", () => {
  it("does not request patient-only endpoints or expose mutation/navigation controls", async () => {
    api.mockImplementation((path) =>
      path === "/config"
        ? Promise.resolve({ today: "2026-11-08", timeZone: "Asia/Kolkata" })
        : path === "/auth/me"
          ? Promise.resolve({
              user: {
                id: "1",
                name: "Doctor",
                email: "doctor@sweety.example",
                role: "doctor",
              },
            })
          : defaults(path),
    );
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Your assigned patients" }),
    ).toBeVisible();
    expect(await screen.findByLabelText("Patient")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Patients", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("button", { name: "Overview", exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /save reading|add reading|history/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      api.mock.calls.every(
        ([path]) => !/^\/(reports|trends|readings)(\?|$)/.test(path),
      ),
    ).toBe(true);
  });
});
