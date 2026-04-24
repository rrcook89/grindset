import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Inventory } from "./Inventory";
import { useGameStore } from "../state/store";

beforeEach(() => {
  useGameStore.setState({ inventory: [] });
});

describe("Inventory", () => {
  it("renders exactly 28 slots", () => {
    render(<Inventory />);
    const slots = screen.getAllByTestId(/^inv-slot-/);
    expect(slots).toHaveLength(28);
  });

  it("renders slots 0 through 27", () => {
    render(<Inventory />);
    for (let i = 0; i < 28; i++) {
      expect(screen.getByTestId(`inv-slot-${i}`)).toBeInTheDocument();
    }
  });

  it("renders an item's color square in the correct slot", () => {
    useGameStore.setState({
      inventory: [{ slotIndex: 3, itemId: 1, name: "Iron Ore", quantity: 1, color: "#aabbcc" }],
    });
    render(<Inventory />);
    const slot = screen.getByTestId("inv-slot-3");
    const colored = slot.querySelector("[style]") as HTMLElement;
    expect(colored).toBeTruthy();
    expect(colored.style.backgroundColor).toBe("rgb(170, 187, 204)");
  });

  it("shows quantity badge when quantity > 1", () => {
    useGameStore.setState({
      inventory: [{ slotIndex: 0, itemId: 2, name: "Coal", quantity: 99, color: "#333" }],
    });
    render(<Inventory />);
    expect(screen.getByText("99")).toBeInTheDocument();
  });

  it("shows 999+ badge when quantity > 999", () => {
    useGameStore.setState({
      inventory: [{ slotIndex: 0, itemId: 2, name: "Coal", quantity: 5000, color: "#333" }],
    });
    render(<Inventory />);
    expect(screen.getByText("999+")).toBeInTheDocument();
  });

  it("does not show badge when quantity is 1", () => {
    useGameStore.setState({
      inventory: [{ slotIndex: 0, itemId: 2, name: "Coal", quantity: 1, color: "#333" }],
    });
    render(<Inventory />);
    // Badge text should not be present
    expect(screen.queryByText("1")).toBeNull();
  });

  it("drag-drop swaps items between slots in state", () => {
    useGameStore.setState({
      inventory: [
        { slotIndex: 0, itemId: 1, name: "Ore", quantity: 1, color: "#f00" },
        { slotIndex: 1, itemId: 2, name: "Log", quantity: 1, color: "#0f0" },
      ],
    });
    render(<Inventory />);

    const slot0 = screen.getByTestId("inv-slot-0");
    const slot1 = screen.getByTestId("inv-slot-1");

    // Simulate drag from slot-0 item and drop onto slot-1
    const dragSource = slot0.querySelector("[draggable]") as HTMLElement;
    fireEvent.dragStart(dragSource);
    fireEvent.dragOver(slot1);
    fireEvent.drop(slot1);

    const inv = useGameStore.getState().inventory;
    const item0 = inv.find((i) => i.itemId === 1)!;
    const item1 = inv.find((i) => i.itemId === 2)!;
    expect(item0.slotIndex).toBe(1);
    expect(item1.slotIndex).toBe(0);
  });

  it("context menu appears on right-click of item", () => {
    useGameStore.setState({
      inventory: [{ slotIndex: 5, itemId: 10, name: "Sword", quantity: 1, color: "#777" }],
    });
    render(<Inventory />);
    const item = screen.getByTitle("Sword");
    fireEvent.contextMenu(item);
    expect(screen.getByText("Use")).toBeInTheDocument();
    expect(screen.getByText("Drop")).toBeInTheDocument();
    expect(screen.getByText("Examine")).toBeInTheDocument();
    expect(screen.getByText("Deposit")).toBeInTheDocument();
  });

  it("Deposit action removes item from inventory and adds to bank", () => {
    useGameStore.setState({
      inventory: [{ slotIndex: 0, itemId: 99, name: "Fish", quantity: 10, color: "#00f" }],
      bankItems: [],
    });
    render(<Inventory />);
    fireEvent.contextMenu(screen.getByTitle("Fish"));
    fireEvent.click(screen.getByText("Deposit"));

    const { inventory, bankItems } = useGameStore.getState();
    expect(inventory).toHaveLength(0);
    expect(bankItems).toHaveLength(1);
    expect(bankItems[0].itemId).toBe(99);
  });
});
