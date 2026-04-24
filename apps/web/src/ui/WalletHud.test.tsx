import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletHud, formatGrind } from "./WalletHud";
import { useGameStore } from "../state/store";

beforeEach(() => {
  useGameStore.setState({ wallet: { balance: 0n, ledger: [] } });
});

// ── formatGrind unit tests ────────────────────────────────────────────────────

describe("formatGrind", () => {
  it("formats zero", () => {
    expect(formatGrind(0n)).toBe("0");
  });

  it("formats whole $GRIND with no decimal", () => {
    expect(formatGrind(1_000_000n)).toBe("1");
  });

  it("formats fractional amount", () => {
    expect(formatGrind(1_500_000n)).toBe("1.5");
  });

  it("strips trailing zeros from fraction", () => {
    expect(formatGrind(1_100_000n)).toBe("1.1");
  });

  it("formats sub-unit amount (< 1 GRIND)", () => {
    expect(formatGrind(500_000n)).toBe("0.5");
  });

  it("formats large balance", () => {
    expect(formatGrind(1_000_000_000_000n)).toBe("1,000,000");
  });

  it("formats exact multi-digit fraction", () => {
    expect(formatGrind(12_345_678n)).toBe("12.345678");
  });
});

// ── WalletHud component tests ─────────────────────────────────────────────────

describe("WalletHud", () => {
  it("renders the wallet container", () => {
    render(<WalletHud />);
    expect(screen.getByTestId("wallet-hud")).toBeInTheDocument();
  });

  it("shows $GRIND label", () => {
    render(<WalletHud />);
    expect(screen.getByText("$GRIND")).toBeInTheDocument();
  });

  it("shows zero balance initially", () => {
    render(<WalletHud />);
    expect(screen.getByTestId("wallet-balance").textContent).toBe("0");
  });

  it("formats balance from base units to human-readable", () => {
    useGameStore.setState({ wallet: { balance: 5_500_000n, ledger: [] } });
    render(<WalletHud />);
    expect(screen.getByTestId("wallet-balance").textContent).toBe("5.5");
  });

  it("shows ledger entries when present", () => {
    useGameStore.setState({
      wallet: {
        balance: 2_000_000n,
        ledger: [
          {
            id: "1",
            direction: "in",
            amount: 1_000_000n,
            description: "Quest reward",
            timestamp: Date.now(),
          },
        ],
      },
    });
    render(<WalletHud />);
    expect(screen.getByText("Quest reward")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("shows Deposit and Withdraw buttons", () => {
    render(<WalletHud />);
    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("Withdraw")).toBeInTheDocument();
  });

  it("shows at most 5 ledger rows", () => {
    const ledger = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      direction: "in" as const,
      amount: 1_000_000n,
      description: `Entry ${i}`,
      timestamp: Date.now(),
    }));
    useGameStore.setState({ wallet: { balance: 10_000_000n, ledger } });
    render(<WalletHud />);
    // Only first 5 rendered (ledger.slice(0,5))
    expect(screen.getByText("Entry 0")).toBeInTheDocument();
    expect(screen.getByText("Entry 4")).toBeInTheDocument();
    expect(screen.queryByText("Entry 5")).toBeNull();
  });
});
