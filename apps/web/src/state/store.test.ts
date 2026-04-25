import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "./store";
import { ENTITY_KIND_MOB, ENTITY_KIND_PLAYER, ENTITY_KIND_NODE } from "../net/protocol";

const initialState = useGameStore.getState();

beforeEach(() => {
  // Reset the store between tests so quest progress / mobs / etc. don't leak.
  useGameStore.setState(initialState, true);
});

describe("incQuestObjective", () => {
  it("increments a single objective without flipping status", () => {
    useGameStore.getState().incQuestObjective("welcome_to_mireholm", 0, 1);
    const q = useGameStore.getState().quests.find((x) => x.id === "welcome_to_mireholm")!;
    expect(q.objectives[0].current).toBe(1);
    expect(q.status).toBe("active");
  });

  it("clamps at target instead of going past it", () => {
    useGameStore.getState().incQuestObjective("welcome_to_mireholm", 0, 999);
    const q = useGameStore.getState().quests.find((x) => x.id === "welcome_to_mireholm")!;
    expect(q.objectives[0].current).toBe(q.objectives[0].target);
  });

  it("transitions to complete only when ALL objectives are filled", () => {
    const incr = useGameStore.getState().incQuestObjective;
    incr("welcome_to_mireholm", 0, 999); // mine 3 ores
    incr("welcome_to_mireholm", 1, 999); // kill 1 mob
    let q = useGameStore.getState().quests.find((x) => x.id === "welcome_to_mireholm")!;
    expect(q.status).toBe("active"); // bank not visited yet
    incr("welcome_to_mireholm", 2, 1);
    q = useGameStore.getState().quests.find((x) => x.id === "welcome_to_mireholm")!;
    expect(q.status).toBe("complete");
  });

  it("ignores increments on a completed quest", () => {
    const incr = useGameStore.getState().incQuestObjective;
    incr("welcome_to_mireholm", 0, 999);
    incr("welcome_to_mireholm", 1, 999);
    incr("welcome_to_mireholm", 2, 1);
    incr("welcome_to_mireholm", 0, 5);
    const q = useGameStore.getState().quests.find((x) => x.id === "welcome_to_mireholm")!;
    expect(q.objectives[0].current).toBe(q.objectives[0].target);
  });

  it("is a no-op for unknown quest ids", () => {
    useGameStore.getState().incQuestObjective("does_not_exist", 0, 1);
    const counts = useGameStore.getState().quests.map((q) => q.objectives.map((o) => o.current));
    expect(counts).toEqual([
      [0, 0, 0],
      [0, 0],
    ]);
  });
});

describe("applyPositionDelta", () => {
  it("routes mob entries into the mobs map with hp/maxHp", () => {
    useGameStore.getState().applyPositionDelta([
      { entityId: 1_000_001, x: 5, y: 7, kind: ENTITY_KIND_MOB, hp: 6, maxHp: 8 },
    ]);
    const m = useGameStore.getState().mobs.get(1_000_001)!;
    expect(m).toBeDefined();
    expect(m.x).toBe(5);
    expect(m.y).toBe(7);
    expect(m.hp).toBe(6);
    expect(m.maxHp).toBe(8);
  });

  it("drops mobs that are missing from the snapshot (despawn)", () => {
    const apply = useGameStore.getState().applyPositionDelta;
    apply([
      { entityId: 1_000_001, x: 5, y: 7, kind: ENTITY_KIND_MOB, hp: 6, maxHp: 8 },
      { entityId: 1_000_002, x: 6, y: 7, kind: ENTITY_KIND_MOB, hp: 4, maxHp: 8 },
    ]);
    expect(useGameStore.getState().mobs.size).toBe(2);
    apply([{ entityId: 1_000_001, x: 5, y: 8, kind: ENTITY_KIND_MOB, hp: 5, maxHp: 8 }]);
    expect(useGameStore.getState().mobs.size).toBe(1);
    expect(useGameStore.getState().mobs.has(1_000_002)).toBe(false);
  });

  it("propagates hp/maxHp on the local player and ignores node entries", () => {
    useGameStore.setState({ localPlayer: { id: 42, x: 0, y: 0, hp: 100, maxHp: 100 } });
    useGameStore.getState().applyPositionDelta([
      { entityId: 42, x: 10, y: 11, kind: ENTITY_KIND_PLAYER, hp: 80, maxHp: 100 },
      { entityId: 2_000_000, x: 22, y: 22, kind: ENTITY_KIND_NODE, hp: 0, maxHp: 0 },
    ]);
    const lp = useGameStore.getState().localPlayer!;
    expect(lp.x).toBe(10);
    expect(lp.y).toBe(11);
    expect(lp.hp).toBe(80);
    // Node entries don't leak into otherPlayers.
    expect(useGameStore.getState().otherPlayers.size).toBe(0);
  });

  it("populates otherPlayers for non-local players", () => {
    useGameStore.setState({ localPlayer: { id: 42, x: 0, y: 0 } });
    useGameStore.getState().applyPositionDelta([
      { entityId: 99, x: 3, y: 4, kind: ENTITY_KIND_PLAYER, hp: 100, maxHp: 100 },
    ]);
    const other = useGameStore.getState().otherPlayers.get(99)!;
    expect(other.x).toBe(3);
    expect(other.y).toBe(4);
  });
});

describe("floats", () => {
  it("pushFloat appends with id + born", () => {
    useGameStore.getState().pushFloat({ tileX: 5, tileY: 5, text: "+1 XP", color: 0xffffff });
    const floats = useGameStore.getState().floats;
    expect(floats).toHaveLength(1);
    expect(floats[0].text).toBe("+1 XP");
    expect(typeof floats[0].id).toBe("string");
    expect(typeof floats[0].born).toBe("number");
  });

  it("clearExpiredFloats drops floats older than 1500ms", () => {
    useGameStore.setState({
      floats: [
        { id: "old", tileX: 0, tileY: 0, text: "old", color: 0, born: Date.now() - 5000 },
        { id: "fresh", tileX: 0, tileY: 0, text: "fresh", color: 0, born: Date.now() - 100 },
      ],
    });
    useGameStore.getState().clearExpiredFloats();
    const remaining = useGameStore.getState().floats.map((f) => f.id);
    expect(remaining).toEqual(["fresh"]);
  });
});

describe("swing tracking", () => {
  it("triggerSwing records the latest event", () => {
    useGameStore.getState().triggerSwing(1, 1_000_001);
    const sw = useGameStore.getState().lastSwing!;
    expect(sw.attackerId).toBe(1);
    expect(sw.targetId).toBe(1_000_001);
    expect(typeof sw.born).toBe("number");
  });
});
