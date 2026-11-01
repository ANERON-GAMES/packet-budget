import assert from "node:assert/strict";
import test from "node:test";
import { selectUpdates } from "../src/index.js";

function assertPartition(options, result) {
  const byId = new Map();
  for (const update of options.updates) {
    byId.set(update.id, update);
  }
  const usable = options.budget - options.packetHeader;
  const seen = new Set();
  let costSum = 0;
  for (const id of result.selected) {
    assert.equal(seen.has(id), false);
    seen.add(id);
    const cost = options.updateHeader + byId.get(id).payload;
    assert.equal(cost <= usable, true);
    costSum += cost;
  }
  for (const entry of result.deferred) {
    assert.equal(seen.has(entry.id), false);
    seen.add(entry.id);
    const cost = options.updateHeader + byId.get(entry.id).payload;
    assert.equal(cost <= usable, true);
  }
  for (const id of result.oversize) {
    assert.equal(seen.has(id), false);
    seen.add(id);
    const cost = options.updateHeader + byId.get(id).payload;
    assert.equal(cost > usable, true);
  }
  assert.equal(seen.size, options.updates.length);
  if (result.selected.length === 0) {
    assert.equal(result.bytesUsed, 0);
  } else {
    assert.equal(result.bytesUsed, options.packetHeader + costSum);
  }
  assert.equal(result.remaining, options.budget - result.bytesUsed);
  assert.equal(result.remaining >= 0, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.selected), true);
  assert.equal(Object.isFrozen(result.deferred), true);
  assert.equal(Object.isFrozen(result.oversize), true);
  for (const entry of result.deferred) {
    assert.equal(Object.isFrozen(entry), true);
  }
}

test("higher priority is packed first and a later update still fills the gap", () => {
  const options = {
    budget: 100,
    packetHeader: 10,
    updateHeader: 2,
    updates: [
      { id: "update-a", payload: 30, priority: 1, ticks: 0 },
      { id: "update-b", payload: 40, priority: 3, ticks: 0 },
      { id: "update-c", payload: 50, priority: 2, ticks: 0 }
    ]
  };
  const packed = selectUpdates(options);
  assert.deepEqual(packed.selected, ["update-b", "update-a"]);
  assert.equal(packed.bytesUsed, 84);
  assert.equal(packed.remaining, 16);
  assert.deepEqual(packed.deferred, [{ id: "update-c", effectivePriority: 2 }]);
  assert.deepEqual(packed.oversize, []);
  assertPartition(options, packed);
});

test("linear age sends the starved update first when only one fits", () => {
  const options = {
    budget: 20,
    packetHeader: 4,
    updateHeader: 2,
    age: { type: "linear", perTick: 0.5 },
    updates: [
      { id: "update-a", payload: 10, priority: 1, ticks: 10 },
      { id: "update-b", payload: 10, priority: 5, ticks: 0 }
    ]
  };
  const starved = selectUpdates(options);
  assert.deepEqual(starved.selected, ["update-a"]);
  assert.deepEqual(starved.deferred, [{ id: "update-b", effectivePriority: 5 }]);
  assert.equal(starved.bytesUsed, 16);
  assert.equal(starved.remaining, 4);
  assertPartition(options, starved);
});

test("both aged updates fit when the budget has room", () => {
  const options = {
    budget: 40,
    packetHeader: 4,
    updateHeader: 2,
    age: { type: "linear", perTick: 0.5 },
    updates: [
      { id: "update-a", payload: 10, priority: 1, ticks: 10 },
      { id: "update-b", payload: 10, priority: 5, ticks: 0 }
    ]
  };
  const aged = selectUpdates(options);
  assert.deepEqual(aged.selected, ["update-a", "update-b"]);
  assert.deepEqual(aged.deferred, []);
  assert.equal(aged.bytesUsed, 28);
  assert.equal(aged.remaining, 12);
  assertPartition(options, aged);
});

test("skip continues after a misfit and strict stops there", () => {
  const updates = [
    { id: "update-c", payload: 2, priority: 1, ticks: 0 },
    { id: "update-a", payload: 22, priority: 9, ticks: 0 },
    { id: "update-b", payload: 8, priority: 5, ticks: 0 }
  ];
  const looseOptions = {
    budget: 40,
    packetHeader: 10,
    updateHeader: 2,
    updates
  };
  const heldOptions = {
    budget: 40,
    packetHeader: 10,
    updateHeader: 2,
    strict: true,
    updates
  };
  const loose = selectUpdates(looseOptions);
  const held = selectUpdates(heldOptions);
  const explicit = selectUpdates({ ...looseOptions, strict: false });
  assert.deepEqual(loose.selected, ["update-a", "update-c"]);
  assert.deepEqual(loose.deferred, [{ id: "update-b", effectivePriority: 5 }]);
  assert.equal(loose.bytesUsed, 38);
  assert.equal(loose.remaining, 2);
  assert.deepEqual(held.selected, ["update-a"]);
  assert.deepEqual(held.deferred, [
    { id: "update-b", effectivePriority: 5 },
    { id: "update-c", effectivePriority: 1 }
  ]);
  assert.equal(held.bytesUsed, 34);
  assert.equal(held.remaining, 6);
  assert.deepEqual(explicit, loose);
  assertPartition(looseOptions, loose);
  assertPartition(heldOptions, held);
});

test("an update larger than the payload budget is oversize and is never selected", () => {
  const options = {
    budget: 50,
    packetHeader: 10,
    updateHeader: 5,
    strict: true,
    updates: [
      { id: "update-c", payload: 40, priority: 1, ticks: 0 },
      { id: "update-a", payload: 80, priority: 100, ticks: 0 },
      { id: "update-b", payload: 10, priority: 1, ticks: 0 }
    ]
  };
  const wide = selectUpdates(options);
  assert.deepEqual(wide.selected, ["update-b"]);
  assert.deepEqual(wide.oversize, ["update-c", "update-a"]);
  assert.deepEqual(wide.deferred, []);
  assert.equal(wide.bytesUsed, 25);
  assert.equal(wide.remaining, 25);
  assertPartition(options, wide);
  const alone = selectUpdates({
    budget: 100,
    packetHeader: 10,
    updateHeader: 2,
    updates: [{ id: "update-a", payload: 95, priority: 9, ticks: 0 }]
  });
  assert.deepEqual(alone.selected, []);
  assert.deepEqual(alone.oversize, ["update-a"]);
  assert.equal(alone.bytesUsed, 0);
  assert.equal(alone.remaining, 100);
});

test("an empty selection does not spend the packet header", () => {
  const idle = selectUpdates({
    budget: 100,
    packetHeader: 8,
    updateHeader: 1,
    updates: []
  });
  assert.deepEqual(idle.selected, []);
  assert.equal(idle.bytesUsed, 0);
  assert.equal(idle.remaining, 100);
  assert.deepEqual(idle.deferred, []);
  assert.deepEqual(idle.oversize, []);
  assert.equal(
    JSON.stringify(idle),
    '{"selected":[],"bytesUsed":0,"remaining":100,"deferred":[],"oversize":[]}'
  );
  const quiet = selectUpdates({
    budget: 20,
    packetHeader: 4,
    updateHeader: 2,
    updates: [{ id: "update-a", payload: 30, priority: 1, ticks: 0 }]
  });
  assert.deepEqual(quiet.selected, []);
  assert.deepEqual(quiet.oversize, ["update-a"]);
  assert.equal(quiet.bytesUsed, 0);
  assert.equal(quiet.remaining, 20);
});

test("equal priorities use id order and an exact fit leaves no bytes", () => {
  const tied = selectUpdates({
    budget: 30,
    packetHeader: 6,
    updateHeader: 4,
    updates: [
      { id: "update-b", payload: 10, priority: 2, ticks: 0 },
      { id: "update-a", payload: 10, priority: 2, ticks: 0 }
    ]
  });
  assert.deepEqual(tied.selected, ["update-a"]);
  assert.deepEqual(tied.deferred, [{ id: "update-b", effectivePriority: 2 }]);
  assert.equal(tied.bytesUsed, 20);
  assert.equal(tied.remaining, 10);
  const full = selectUpdates({
    budget: 20,
    packetHeader: 4,
    updateHeader: 6,
    updates: [{ id: "update-a", payload: 10, priority: 1, ticks: 0 }]
  });
  assert.deepEqual(full.selected, ["update-a"]);
  assert.equal(full.bytesUsed, 20);
  assert.equal(full.remaining, 0);
});

test("a zero payload still pays the update header", () => {
  const marker = selectUpdates({
    budget: 10,
    packetHeader: 3,
    updateHeader: 2,
    updates: [{ id: "update-a", payload: 0, priority: 1, ticks: 0 }]
  });
  assert.deepEqual(marker.selected, ["update-a"]);
  assert.equal(marker.bytesUsed, 5);
  assert.equal(marker.remaining, 5);
  const free = selectUpdates({
    budget: 7,
    packetHeader: 0,
    updateHeader: 0,
    updates: [
      { id: "update-b", payload: 0, priority: 1, ticks: 0 },
      { id: "update-a", payload: 0, priority: 1, ticks: 0 }
    ]
  });
  assert.deepEqual(free.selected, ["update-a", "update-b"]);
  assert.equal(free.bytesUsed, 0);
  assert.equal(free.remaining, 7);
});

test("deferred priority uses the age formula", () => {
  const grown = selectUpdates({
    budget: 15,
    packetHeader: 3,
    updateHeader: 1,
    age: { type: "linear", perTick: 0.5 },
    updates: [
      { id: "update-a", payload: 8, priority: 4, ticks: 0 },
      { id: "update-b", payload: 4, priority: 1, ticks: 3 }
    ]
  });
  assert.deepEqual(grown.selected, ["update-a"]);
  assert.equal(grown.bytesUsed, 12);
  assert.equal(grown.remaining, 3);
  assert.equal(JSON.stringify(grown.deferred), '[{"id":"update-b","effectivePriority":2.5}]');
});

test("inputs are not mutated and results are not shared", () => {
  const pending = [{ id: "update-a", payload: 4, priority: 1, ticks: 4 }];
  const options = {
    budget: 20,
    packetHeader: 2,
    updateHeader: 2,
    updates: pending
  };
  const before = selectUpdates(options);
  pending[0].ticks = 9;
  pending.push({ id: "update-b", payload: 1, priority: 9, ticks: 0 });
  assert.deepEqual(before.selected, ["update-a"]);
  assert.equal(before.bytesUsed, 8);
  assert.equal(before.remaining, 12);
  assert.equal(pending[0].ticks, 9);
  assert.equal(pending.length, 2);
  const again = selectUpdates({
    budget: 20,
    packetHeader: 2,
    updateHeader: 2,
    updates: [{ id: "update-a", payload: 4, priority: 1, ticks: 4 }]
  });
  assert.deepEqual(again, before);
  assert.notEqual(again, before);
  assert.notEqual(again.selected, before.selected);
  assert.throws(() => {
    before.selected.push("update-b");
  }, TypeError);
  assert.throws(() => {
    before.deferred.push({ id: "update-b", effectivePriority: 1 });
  }, TypeError);
});

test("a header equal to the budget leaves only a zero-cost update selectable", () => {
  const result = selectUpdates({
    budget: 12,
    packetHeader: 12,
    updateHeader: 0,
    updates: [
      { id: "update-a", payload: 1, priority: 5, ticks: 0 },
      { id: "update-b", payload: 0, priority: 1, ticks: 0 }
    ]
  });
  assert.deepEqual(result.oversize, ["update-a"]);
  assert.deepEqual(result.selected, ["update-b"]);
  assert.equal(result.bytesUsed, 12);
  assert.equal(result.remaining, 0);
});
