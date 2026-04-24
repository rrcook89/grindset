import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceTicker } from "./PriceTicker";

describe("PriceTicker", () => {
  it("renders the $GRIND label", () => {
    render(<PriceTicker />);
    expect(screen.getByText("$GRIND")).toBeInTheDocument();
  });

  it("renders the stub price $0.00", () => {
    render(<PriceTicker />);
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("renders the price-ticker container", () => {
    render(<PriceTicker />);
    expect(screen.getByTestId("price-ticker")).toBeInTheDocument();
  });
});
