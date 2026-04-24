import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GrandBazaar } from "./GrandBazaar";
import { useGameStore } from "../state/store";

beforeEach(() => {
  useGameStore.setState({ geOpen: true, geOrders: [] });
});

describe("GrandBazaar", () => {
  it("renders nothing when closed", () => {
    useGameStore.setState({ geOpen: false });
    render(<GrandBazaar />);
    expect(screen.queryByText("Grand Bazaar")).toBeNull();
  });

  it("renders when open", () => {
    render(<GrandBazaar />);
    expect(screen.getByText("Grand Bazaar")).toBeInTheDocument();
  });

  it("shows buy/sell/orders tabs", () => {
    render(<GrandBazaar />);
    expect(screen.getByText("buy")).toBeInTheDocument();
    expect(screen.getByText("sell")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("shows form fields on buy tab", () => {
    render(<GrandBazaar />);
    expect(screen.getByTestId("ge-item-input")).toBeInTheDocument();
    expect(screen.getByTestId("ge-qty-input")).toBeInTheDocument();
    expect(screen.getByTestId("ge-price-input")).toBeInTheDocument();
  });

  it("shows error when submitting with empty item name", () => {
    render(<GrandBazaar />);
    fireEvent.click(screen.getByTestId("ge-submit"));
    expect(screen.getByTestId("ge-error")).toHaveTextContent("Item name required");
  });

  it("shows error when quantity is zero", () => {
    render(<GrandBazaar />);
    fireEvent.change(screen.getByTestId("ge-item-input"), { target: { value: "Iron Ore" } });
    fireEvent.change(screen.getByTestId("ge-qty-input"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("ge-price-input"), { target: { value: "100" } });
    fireEvent.click(screen.getByTestId("ge-submit"));
    expect(screen.getByTestId("ge-error")).toHaveTextContent("Qty must be");
  });

  it("shows error when price is zero", () => {
    render(<GrandBazaar />);
    fireEvent.change(screen.getByTestId("ge-item-input"), { target: { value: "Iron Ore" } });
    fireEvent.change(screen.getByTestId("ge-qty-input"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("ge-price-input"), { target: { value: "0" } });
    fireEvent.click(screen.getByTestId("ge-submit"));
    expect(screen.getByTestId("ge-error")).toHaveTextContent("Price must be");
  });

  it("places a valid buy order and switches to orders tab", () => {
    render(<GrandBazaar />);
    fireEvent.change(screen.getByTestId("ge-item-input"), { target: { value: "Iron Ore" } });
    fireEvent.change(screen.getByTestId("ge-qty-input"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("ge-price-input"), { target: { value: "500" } });
    fireEvent.click(screen.getByTestId("ge-submit"));

    const orders = useGameStore.getState().geOrders;
    expect(orders).toHaveLength(1);
    expect(orders[0].itemName).toBe("Iron Ore");
    expect(orders[0].quantity).toBe(10);
    expect(orders[0].priceEach).toBe(500);
    expect(orders[0].side).toBe("buy");
  });

  it("places a valid sell order", () => {
    render(<GrandBazaar />);
    fireEvent.click(screen.getByText("sell"));
    fireEvent.change(screen.getByTestId("ge-item-input"), { target: { value: "Coal" } });
    fireEvent.change(screen.getByTestId("ge-qty-input"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("ge-price-input"), { target: { value: "250" } });
    fireEvent.click(screen.getByTestId("ge-submit"));

    const orders = useGameStore.getState().geOrders;
    expect(orders[0].side).toBe("sell");
    expect(orders[0].itemName).toBe("Coal");
  });

  it("closes when Close is clicked", () => {
    render(<GrandBazaar />);
    fireEvent.click(screen.getByText("Close"));
    expect(useGameStore.getState().geOpen).toBe(false);
  });

  it("shows no active orders message on empty orders tab", () => {
    render(<GrandBazaar />);
    fireEvent.click(screen.getByText("orders"));
    expect(screen.getByText("No active orders")).toBeInTheDocument();
  });

  it("can cancel an order", () => {
    useGameStore.setState({
      geOrders: [
        {
          id: "abc",
          side: "buy",
          itemId: 1,
          itemName: "Timber",
          quantity: 5,
          filledQty: 0,
          priceEach: 100,
          timestamp: Date.now(),
        },
      ],
    });
    render(<GrandBazaar />);
    fireEvent.click(screen.getByText("orders"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(useGameStore.getState().geOrders).toHaveLength(0);
  });
});
