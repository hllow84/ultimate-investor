import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CorrelationMatrix from "./CorrelationMatrix";

describe("CorrelationMatrix", () => {
  it("renders only the rows/columns present in the matrix", () => {
    render(
      <CorrelationMatrix
        matrix={{
          a: { a: 1, b: -0.31 },
          b: { a: -0.31, b: 1 },
        }}
      />
    );
    expect(screen.getAllByText("1.00")).toHaveLength(2);
    expect(screen.getAllByText("-0.31")).toHaveLength(2);
  });

  it("shows an empty-state message for an empty matrix", () => {
    render(<CorrelationMatrix matrix={{}} />);
    expect(screen.getByText("No correlation data present.")).toBeInTheDocument();
  });
});
