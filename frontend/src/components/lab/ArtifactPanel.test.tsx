import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ArtifactPanel from "./ArtifactPanel";
import type { ArtifactEnvelope } from "@/types/lab";

function envelope(overrides: Partial<ArtifactEnvelope<{ foo: string }>>): ArtifactEnvelope<{ foo: string }> {
  return {
    key: "test_artifact",
    relative_path: "data/test.json",
    status: "ok",
    source_last_modified: "2026-10-09T00:00:00Z",
    data: null,
    error: null,
    ...overrides,
  };
}

describe("ArtifactPanel", () => {
  it("renders children with the real data when status is ok", () => {
    render(
      <ArtifactPanel title="Test" envelope={envelope({ status: "ok", data: { foo: "bar" } })}>
        {(data) => <div>value: {data.foo}</div>}
      </ArtifactPanel>
    );
    expect(screen.getByText("value: bar")).toBeInTheDocument();
  });

  it("shows a distinct message for a missing artifact, never fabricated data", () => {
    render(
      <ArtifactPanel title="Test" envelope={envelope({ status: "missing", data: null, error: "File not found" })}>
        {() => <div>should not render</div>}
      </ArtifactPanel>
    );
    expect(screen.queryByText("should not render")).not.toBeInTheDocument();
    expect(screen.getByText("File not found")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("shows a distinct message for a malformed artifact", () => {
    render(
      <ArtifactPanel title="Test" envelope={envelope({ status: "malformed", data: null, error: "Invalid JSON: ..." })}>
        {() => <div>should not render</div>}
      </ArtifactPanel>
    );
    expect(screen.queryByText("should not render")).not.toBeInTheDocument();
    expect(screen.getByText("Malformed")).toBeInTheDocument();
  });

  it("shows a distinct message when the Lab is unavailable", () => {
    render(
      <ArtifactPanel title="Test" envelope={envelope({ status: "unavailable", data: null, error: "Lab root does not exist" })}>
        {() => <div>should not render</div>}
      </ArtifactPanel>
    );
    expect(screen.queryByText("should not render")).not.toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("never shows an ok status badge for a non-ok envelope", () => {
    render(
      <ArtifactPanel title="Test" envelope={envelope({ status: "missing", data: null })}>
        {() => <div />}
      </ArtifactPanel>
    );
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });
});
