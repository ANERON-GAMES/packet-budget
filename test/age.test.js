import assert from "node:assert/strict";
import test from "node:test";
import { CAPPED, LINEAR, MAX_BYTES, selectUpdates } from "../src/index.js";

function priorityOf(update, age) {
  const result = selectUpdates({
    budget: 10,
    packetHeader: 0,
    updateHeader: 0,
    age,
    updates: [
      { id: "update-a", payload: 10, priority: 1e6, ticks: 0 },
      { id: "update-b", ...update }
    ]
  });
  assert.deepEqual(result.selected, ["update-a"]);
  assert.deepEqual(
    result.deferred.map((entry) => entry.id),
    ["update-b"]
  );
  return result.deferred[0].effectivePriority;
}

test("ticks of zero leave the base priority unchanged", () => {
  assert.equal(priorityOf({ payload: 1, priority: 4, ticks: 0 }, { type: LINEAR, perTick: 3 }), 4);
  assert.equal(
    priorityOf({ payload: 1, priority: 4, ticks: 0 }, { type: CAPPED, perTick: 3, cap: 2 }),
    4
  );
});

test("linear age multiplies the base priority by one plus ticks times perTick", () => {
  assert.equal(
    priorityOf({ payload: 1, priority: 2, ticks: 3 }, { type: LINEAR, perTick: 0.5 }),
    5
  );
  assert.equal(
    priorityOf({ payload: 1, priority: 1, ticks: 10 }, { type: "linear", perTick: 0.5 }),
    6
  );
});

test("omitted age and a zero perTick do not raise priority", () => {
  const updates = [
    { id: "update-b", payload: 4, priority: 2, ticks: 0 },
    { id: "update-a", payload: 4, priority: 1, ticks: 30 }
  ];
  const omitted = selectUpdates({
    budget: 4,
    packetHeader: 0,
    updateHeader: 0,
    updates
  });
  const zero = selectUpdates({
    budget: 4,
    packetHeader: 0,
    updateHeader: 0,
    age: { type: "linear", perTick: 0 },
    updates
  });
  const cleared = selectUpdates({
    budget: 4,
    packetHeader: 0,
    updateHeader: 0,
    age: undefined,
    updates
  });
  assert.deepEqual(omitted.selected, ["update-b"]);
  assert.deepEqual(omitted.deferred, [{ id: "update-a", effectivePriority: 1 }]);
  assert.deepEqual(zero, omitted);
  assert.deepEqual(cleared.selected, ["update-b"]);
  assert.deepEqual(cleared.deferred, [{ id: "update-a", effectivePriority: 1 }]);
});

test("a starved update overtakes a fresher update with a higher base priority", () => {
  const result = selectUpdates({
    budget: 20,
    packetHeader: 4,
    updateHeader: 2,
    age: { type: "linear", perTick: 0.5 },
    updates: [
      { id: "update-b", payload: 10, priority: 5, ticks: 0 },
      { id: "update-a", payload: 10, priority: 1, ticks: 10 }
    ]
  });
  assert.deepEqual(result.selected, ["update-a"]);
  assert.deepEqual(result.deferred, [{ id: "update-b", effectivePriority: 5 }]);
  assert.equal(result.bytesUsed, 16);
  assert.equal(result.remaining, 4);
  assert.deepEqual(result.oversize, []);
});

test("capped age stops the factor at the cap", () => {
  assert.equal(
    priorityOf({ payload: 1, priority: 1, ticks: 10 }, { type: "capped", perTick: 0.5, cap: 4 }),
    4
  );
  assert.equal(
    priorityOf({ payload: 1, priority: 2, ticks: 2 }, { type: "capped", perTick: 0.5, cap: 2 }),
    4
  );
  assert.equal(
    priorityOf({ payload: 1, priority: 2, ticks: 4 }, { type: "capped", perTick: 0.5, cap: 2 }),
    4
  );
  const result = selectUpdates({
    budget: 16,
    packetHeader: 4,
    updateHeader: 2,
    age: { type: "capped", perTick: 0.5, cap: 4 },
    updates: [
      { id: "update-a", payload: 10, priority: 1, ticks: 10 },
      { id: "update-b", payload: 10, priority: 5, ticks: 0 }
    ]
  });
  assert.deepEqual(result.selected, ["update-b"]);
  assert.deepEqual(result.deferred, [{ id: "update-a", effectivePriority: 4 }]);
});

test("a cap of one holds every factor at one", () => {
  assert.equal(
    priorityOf({ payload: 1, priority: 3, ticks: 8 }, { type: CAPPED, perTick: 1, cap: 1 }),
    3
  );
});

test("a base priority of zero stays zero as it ages", () => {
  const aged = priorityOf({ payload: 1, priority: 0, ticks: 12 }, { type: LINEAR, perTick: 1 });
  assert.equal(Object.is(aged, 0), true);
  const negativeZero = priorityOf(
    { payload: 1, priority: -0, ticks: 4 },
    { type: LINEAR, perTick: 2 }
  );
  assert.equal(Object.is(negativeZero, 0), true);
});

test("equal effective priorities are ordered by id", () => {
  const result = selectUpdates({
    budget: 40,
    packetHeader: 4,
    updateHeader: 2,
    age: { type: "linear", perTick: 1 },
    updates: [
      { id: "update-b", payload: 4, priority: 2, ticks: 0 },
      { id: "update-a", payload: 4, priority: 1, ticks: 1 }
    ]
  });
  assert.deepEqual(result.selected, ["update-a", "update-b"]);
  assert.deepEqual(result.deferred, []);
  assert.equal(result.bytesUsed, 16);
  assert.equal(result.remaining, 24);
});

test("a capped factor replaces a non-finite linear factor", () => {
  const result = selectUpdates({
    budget: 3,
    packetHeader: 0,
    updateHeader: 0,
    age: { type: "capped", perTick: Number.MAX_VALUE, cap: 4 },
    updates: [
      { id: "update-a", payload: 3, priority: 100, ticks: 0 },
      { id: "update-b", payload: 1, priority: 10, ticks: 1 }
    ]
  });
  assert.deepEqual(result.selected, ["update-a"]);
  assert.deepEqual(result.deferred, [{ id: "update-b", effectivePriority: 40 }]);
});

test("a non-finite effective priority throws", () => {
  assert.throws(
    () =>
      selectUpdates({
        budget: 4,
        packetHeader: 0,
        updateHeader: 0,
        age: { type: "linear", perTick: Number.MAX_VALUE },
        updates: [{ id: "update-a", payload: 1, priority: 1, ticks: MAX_BYTES }]
      }),
    { name: "RangeError", message: "effective priority must be finite" }
  );
  assert.throws(
    () =>
      selectUpdates({
        budget: 4,
        packetHeader: 0,
        updateHeader: 0,
        age: { type: "linear", perTick: Number.MAX_VALUE },
        updates: [{ id: "update-a", payload: 1, priority: 0, ticks: MAX_BYTES }]
      }),
    { name: "RangeError", message: "effective priority must be finite" }
  );
  assert.throws(
    () =>
      selectUpdates({
        budget: 4,
        packetHeader: 0,
        updateHeader: 0,
        age: { type: "capped", perTick: 1, cap: 2 },
        updates: [{ id: "update-a", payload: 1, priority: Number.MAX_VALUE, ticks: 1 }]
      }),
    { name: "RangeError", message: "effective priority must be finite" }
  );
});

test("minus zero byte counts behave as zero", () => {
  const result = selectUpdates({
    budget: -0,
    packetHeader: -0,
    updateHeader: -0,
    age: { type: "linear", perTick: -0 },
    updates: [{ id: "update-a", payload: -0, priority: -0, ticks: -0 }]
  });
  assert.deepEqual(result.selected, ["update-a"]);
  assert.equal(Object.is(result.bytesUsed, 0), true);
  assert.equal(Object.is(result.remaining, 0), true);
  assert.deepEqual(result.deferred, []);
  assert.deepEqual(result.oversize, []);
});
