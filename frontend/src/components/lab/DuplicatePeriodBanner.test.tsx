import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DuplicatePeriodBanner from "./DuplicatePeriodBanner";

describe("DuplicatePeriodBanner", () => {
  it("renders nothing when there is no warning", () => {
    const { container } = render(<DuplicatePeriodBanner warning={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the exact warning text from the API when present", () => {
    const warning = "1 data_as_of period(s) have more than one log record: ['2026-09-30'].";
    render(<DuplicatePeriodBanner warning={warning} />);
    expect(screen.getByText(warning)).toBeInTheDocument();
  });
});
