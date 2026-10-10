import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoadingNotice, QueryErrorNotice } from "./QueryStateNotice";

describe("LoadingNotice", () => {
  it("shows an active-loading message by default", () => {
    render(<LoadingNotice label="Loading strategy results…" />);
    expect(screen.getByText("Loading strategy results…")).toBeInTheDocument();
  });

  it("shows a distinct message when the query is paused, not the generic spinner label", () => {
    // fetchStatus 'paused' happens when React Query holds a request back
    // (e.g. offline / networkMode) while isPending stays true -- without
    // this branch the page would show "Loading…" forever with no
    // indication the request isn't actually in flight.
    render(<LoadingNotice label="Loading strategy results…" fetchStatus="paused" />);
    expect(screen.queryByText("Loading strategy results…")).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for a network connection/i)).toBeInTheDocument();
  });

  it("shows the normal spinner label when actively fetching", () => {
    render(<LoadingNotice label="Loading strategy results…" fetchStatus="fetching" />);
    expect(screen.getByText("Loading strategy results…")).toBeInTheDocument();
  });
});

describe("QueryErrorNotice", () => {
  it("shows a generic request-failed message for a non-503 error", () => {
    render(<QueryErrorNotice error={new Error("API error 500: boom")} />);
    expect(screen.getByText("Request failed")).toBeInTheDocument();
    expect(screen.getByText("API error 500: boom")).toBeInTheDocument();
  });

  it("shows the Lab-unavailable message for a 503", () => {
    render(<QueryErrorNotice error={new Error("API error 503: lab root missing")} />);
    expect(screen.getByText("Institutional Long-Horizon Lab is unavailable")).toBeInTheDocument();
  });

  it("shows a generic message for a network rejection (not an Error-shaped 503)", () => {
    render(<QueryErrorNotice error={new TypeError("Failed to fetch")} />);
    expect(screen.getByText("Request failed")).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
  });

  it("does not render a retry button when no onRetry is given", () => {
    render(<QueryErrorNotice error={new Error("boom")} />);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("renders a retry button that calls onRetry when provided", () => {
    const onRetry = vi.fn();
    render(<QueryErrorNotice error={new Error("boom")} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
