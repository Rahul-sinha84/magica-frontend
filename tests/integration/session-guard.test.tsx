import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionGuard } from "@/components/layout/SessionGuard";
import { clerkState } from "../mocks/clerk";

describe("SessionGuard", () => {
  it("does nothing for a signed-in visitor", () => {
    render(<SessionGuard />);
    expect(screen.queryByTestId("redirect-to-sign-in")).not.toBeInTheDocument();
  });

  it("does not redirect before Clerk has finished loading", () => {
    Object.assign(clerkState, { isLoaded: false, isSignedIn: false });
    render(<SessionGuard />);
    expect(screen.queryByTestId("redirect-to-sign-in")).not.toBeInTheDocument();
  });

  it("sends you to sign-in when the session ends", () => {
    Object.assign(clerkState, { isLoaded: true, isSignedIn: false });
    render(<SessionGuard />);
    expect(screen.getByTestId("redirect-to-sign-in")).toBeInTheDocument();
  });

  it("reacts when the session ends while the page is open", () => {
    const { rerender } = render(<SessionGuard />);
    expect(screen.queryByTestId("redirect-to-sign-in")).not.toBeInTheDocument();

    Object.assign(clerkState, { isSignedIn: false });
    rerender(<SessionGuard />);
    expect(screen.getByTestId("redirect-to-sign-in")).toBeInTheDocument();
  });
});
