# @aneron/packet-budget

Choose which pending entity updates fit into one outgoing packet under a byte budget.

## Purpose

`@aneron/packet-budget` picks a subset of pending updates for one outgoing packet. The caller supplies the byte budget, the fixed header on that packet, the header added to every update, and the pending list. Each pending update has an id, a payload size in bytes, a base priority, and the number of ticks since it was last sent.

Effective priority is the base priority multiplied by an age factor. The factor starts at `1` and grows with the tick count. Linear growth is unbounded. Capped growth stops at a caller-chosen ceiling. A starved update can pass a fresher update once its factor is large enough. A base priority of `0` stays `0`.

The module sorts the updates that can fit in an empty packet by effective priority, highest first. Equal priorities are ordered by id, lowest UTF-16 code unit order first. It then takes updates in that order while they fit. The default walks past an update that does not fit and keeps trying later ones. Strict order stops at the first update that does not fit and defers the rest. An update whose own cost is larger than the payload budget is oversize. It is reported and never selected.

`selectUpdates` does not mutate its argument. It returns a new frozen object. It does not read a clock, start a timer, draw a random number, or open a socket. The package has no runtime dependencies. The same inputs produce the same result.

## Install

The package is an ES module. It needs Node.js 20 or newer. It has no runtime dependencies. The package name is `@aneron/packet-budget`. It is not published to the npm registry.

Clone this repository and run the tests:

```bash
git clone https://github.com/ANERON-GAMES/packet-budget.git
cd packet-budget
npm install
npm test
```

`npm test` runs `node --test`. `npm run lint` runs ESLint. `npm run format:check` runs Prettier.

Install it as a dependency from the git repository:

```bash
npm install github:ANERON-GAMES/packet-budget
```

```js
import { selectUpdates } from "@aneron/packet-budget";
```

Code in this repository imports the same entry point with `./src/index.js`.

## Usage

Byte counts below are integers chosen by the caller. Tick counts are integers chosen by the caller. The module does not treat them as timestamps.

`update-b` has the highest base priority and is taken first. `update-c` does not fit in the bytes that remain, so it is deferred. `update-a` is smaller and still fits. No age is passed, so each effective priority is the base priority.

```js
import { selectUpdates } from "@aneron/packet-budget";

const packed = selectUpdates({
  budget: 100,
  packetHeader: 10,
  updateHeader: 2,
  updates: [
    { id: "update-a", payload: 30, priority: 1, ticks: 0 },
    { id: "update-b", payload: 40, priority: 3, ticks: 0 },
    { id: "update-c", payload: 50, priority: 2, ticks: 0 }
  ]
});
```

The payload budget is `100 - 10`, which is `90`. Costs are `32`, `42`, and `52`. `update-b` leaves `48`. `update-c` needs `52`, so it waits. `update-a` needs `32` and is taken. `10 + 42 + 32` is `84`.

`packed.selected` is `["update-b", "update-a"]`. `packed.bytesUsed` is `84`. `packed.remaining` is `16`. `packed.deferred[0].id` is `"update-c"`. `packed.deferred[0].effectivePriority` is `2`. `packed.oversize` is `[]`.

Linear age adds `ticks * perTick` to the factor `1`. `update-a` has base priority `1` and `10` ticks at `0.5` per tick, so its factor is `6` and its effective priority is `6`. `update-b` was sent this tick, so its effective priority stays `5`. The budget holds both costs of `12`.

```js
const aged = selectUpdates({
  budget: 40,
  packetHeader: 4,
  updateHeader: 2,
  age: { type: "linear", perTick: 0.5 },
  updates: [
    { id: "update-a", payload: 10, priority: 1, ticks: 10 },
    { id: "update-b", payload: 10, priority: 5, ticks: 0 }
  ]
});
```

`aged.selected` is `["update-a", "update-b"]`. `aged.bytesUsed` is `28`. `aged.remaining` is `12`. `aged.deferred` is `[]`. `aged.oversize` is `[]`.

The same two updates do not both fit when the payload budget is `16`. The older update is sent. The fresher update is deferred with the effective priority it had during the sort.

```js
const starved = selectUpdates({
  budget: 20,
  packetHeader: 4,
  updateHeader: 2,
  age: { type: "linear", perTick: 0.5 },
  updates: [
    { id: "update-b", payload: 10, priority: 5, ticks: 0 },
    { id: "update-a", payload: 10, priority: 1, ticks: 10 }
  ]
});
```

`starved.selected` is `["update-a"]`. `starved.deferred[0].id` is `"update-b"`. `starved.deferred[0].effectivePriority` is `5`. `starved.bytesUsed` is `16`. `starved.remaining` is `4`. Input order listed `update-b` first. Age reordered the send list.

Capped age uses the same growth and then limits the factor. The raw factor for `update-a` is `6`. The cap is `4`, so the effective priority is `4`, which is still below `5`.

```js
const capped = selectUpdates({
  budget: 20,
  packetHeader: 4,
  updateHeader: 2,
  age: { type: "capped", perTick: 0.5, cap: 4 },
  updates: [
    { id: "update-a", payload: 10, priority: 1, ticks: 10 },
    { id: "update-b", payload: 10, priority: 5, ticks: 0 }
  ]
});
```

`capped.selected` is `["update-b"]`. `capped.deferred[0].id` is `"update-a"`. `capped.deferred[0].effectivePriority` is `4`. `capped.bytesUsed` is `16`. `capped.remaining` is `4`.

Skip-and-continue is the default. `update-a` fits and leaves `6` bytes. `update-b` needs `10` and is skipped. `update-c` needs `4` and is taken. Strict order stops when `update-b` does not fit, so `update-c` waits even though `4` bytes would have held it.

```js
const loose = selectUpdates({
  budget: 40,
  packetHeader: 10,
  updateHeader: 2,
  updates: [
    { id: "update-a", payload: 22, priority: 9, ticks: 0 },
    { id: "update-b", payload: 8, priority: 5, ticks: 0 },
    { id: "update-c", payload: 2, priority: 1, ticks: 0 }
  ]
});
const held = selectUpdates({
  budget: 40,
  packetHeader: 10,
  updateHeader: 2,
  strict: true,
  updates: [
    { id: "update-a", payload: 22, priority: 9, ticks: 0 },
    { id: "update-b", payload: 8, priority: 5, ticks: 0 },
    { id: "update-c", payload: 2, priority: 1, ticks: 0 }
  ]
});
```

`loose.selected` is `["update-a", "update-c"]`. `loose.deferred[0].id` is `"update-b"`. `loose.bytesUsed` is `38`. `loose.remaining` is `2`. `held.selected` is `["update-a"]`. `held.deferred[0].id` is `"update-b"`. `held.deferred[1].id` is `"update-c"`. `held.deferred[0].effectivePriority` is `5`. `held.deferred[1].effectivePriority` is `1`. `held.bytesUsed` is `34`. `held.remaining` is `6`.

A cost greater than `budget - packetHeader` cannot fit even when the packet is otherwise empty. That update is oversize. It is not a candidate, so strict order does not stop on it. `update-a` costs `45` and the payload budget is `40`. `update-b` costs `15` and is sent.

```js
const wide = selectUpdates({
  budget: 50,
  packetHeader: 10,
  updateHeader: 5,
  updates: [
    { id: "update-a", payload: 40, priority: 100, ticks: 0 },
    { id: "update-b", payload: 10, priority: 1, ticks: 0 }
  ]
});
```

`wide.oversize` is `["update-a"]`. `wide.selected` is `["update-b"]`. `wide.bytesUsed` is `25`. `wide.remaining` is `25`. `wide.deferred` is `[]`.

Equal effective priorities break the tie by id. `"update-a"` is before `"update-b"`. Only one cost of `14` fits in the payload budget of `24`.

```js
const tied = selectUpdates({
  budget: 30,
  packetHeader: 6,
  updateHeader: 4,
  updates: [
    { id: "update-b", payload: 10, priority: 2, ticks: 0 },
    { id: "update-a", payload: 10, priority: 2, ticks: 0 }
  ]
});
```

`tied.selected` is `["update-a"]`. `tied.deferred[0].id` is `"update-b"`. `tied.deferred[0].effectivePriority` is `2`. `tied.bytesUsed` is `20`. `tied.remaining` is `10`.

An empty pending list builds no packet. The packet header is not charged. An oversize update also builds no packet when nothing else is selected.

```js
const idle = selectUpdates({
  budget: 100,
  packetHeader: 8,
  updateHeader: 1,
  updates: []
});
const quiet = selectUpdates({
  budget: 20,
  packetHeader: 4,
  updateHeader: 2,
  updates: [{ id: "update-a", payload: 30, priority: 1, ticks: 0 }]
});
```

`idle.selected` is `[]`. `idle.bytesUsed` is `0`. `idle.remaining` is `100`. `idle.deferred` is `[]`. `idle.oversize` is `[]`. `JSON.stringify(idle)` is `{"selected":[],"bytesUsed":0,"remaining":100,"deferred":[],"oversize":[]}`. `quiet.selected` is `[]`. `quiet.bytesUsed` is `0`. `quiet.remaining` is `20`. `quiet.oversize` is `["update-a"]`. `quiet.deferred` is `[]`.

A deferred effective priority can be fractional. `update-b` has base priority `1`, `3` ticks, and `0.5` per tick. The factor is `2.5`.

```js
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
```

`grown.selected` is `["update-a"]`. `grown.bytesUsed` is `12`. `grown.remaining` is `3`. `grown.deferred[0].effectivePriority` is `2.5`. `JSON.stringify(grown.deferred)` is `[{"id":"update-b","effectivePriority":2.5}]`.

A cost that equals the payload budget fills the packet. `4 + 16` is `20`.

```js
const full = selectUpdates({
  budget: 20,
  packetHeader: 4,
  updateHeader: 6,
  updates: [{ id: "update-a", payload: 10, priority: 1, ticks: 0 }]
});
```

`full.selected` is `["update-a"]`. `full.bytesUsed` is `20`. `full.remaining` is `0`. `full.deferred` is `[]`. `full.oversize` is `[]`.

The call reads the pending list and does not write it. A later edit is visible only to a later call.

```js
const pending = [{ id: "update-a", payload: 4, priority: 1, ticks: 4 }];
const before = selectUpdates({
  budget: 20,
  packetHeader: 2,
  updateHeader: 2,
  updates: pending
});
pending[0].ticks = 9;
pending.push({ id: "update-b", payload: 1, priority: 9, ticks: 0 });
```

`before.selected` is `["update-a"]`. `before.bytesUsed` is `8`. `before.remaining` is `12`. `pending[0].ticks` is `9`. `pending.length` is `2`.

## API

`selectUpdates` is a function. It has no constructor and no shared state. Each call reads its argument and returns a new result. The same input produces a deep-equal result and a new object tree.

`selectUpdates` does not mutate `options`, the `updates` array, update objects, or the `age` object. A call freezes only the result it creates. The result, `selected`, `deferred`, each deferred entry, and `oversize` are frozen.

Own fields are read. An unknown own field on `options` throws. Inherited fields are ignored because a plain object has no caller-defined prototype. An omitted optional field, or a field whose value is `undefined`, uses the default. A frozen object and an object with a null prototype are accepted.

A plain object has prototype `Object.prototype` or `null`, every own property is an enumerable data property, and there are no symbol properties. An accessor, a non-enumerable property, an array, or a class instance is not a plain object.

Byte counts and tick counts are safe integers from `0` through `MAX_BYTES` (`9007199254740991`). `-0` is stored as `0` on values this module writes. Comparison of priorities is ordinary IEEE-754 with no epsilon. Ids are not trimmed and are not case-folded. `"update-a"` and `"update-b"` are different ids.

Returned values never contain `-0`. `JSON.parse(JSON.stringify(result))` is a deep copy of the result. The copy is not frozen.

### Constants

| Export      | Value                  | Meaning                                                                |
| ----------- | ---------------------- | ---------------------------------------------------------------------- |
| `LINEAR`    | `"linear"`             | Age type. The factor is `1 + ticks * perTick`.                         |
| `CAPPED`    | `"capped"`             | Age type. The factor is that value, limited by `cap`.                  |
| `AGE_TYPES` | `["linear", "capped"]` | Frozen age types, in that order.                                       |
| `MAX_BYTES` | `9007199254740991`     | Largest accepted byte count and tick count. `Number.MAX_SAFE_INTEGER`. |

### `selectUpdates(options)`

```js
selectUpdates(options);
```

`options` must be a plain object. Otherwise the function throws `TypeError` with the message `options must be an object`.

Checks run in this order. The first failure wins. A throw returns no result and leaves the argument unchanged.

1. `options` is a plain object.
2. Every own field is one of `budget`, `packetHeader`, `updateHeader`, `updates`, `age`, and `strict`.
3. `budget` is a safe integer in range.
4. `packetHeader` is a safe integer from `0` through `budget`.
5. `updateHeader` is a safe integer in range.
6. `age`, when present and not `undefined`, matches an age type and its fields.
7. `strict`, when present and not `undefined`, is a boolean.
8. `updates` is a dense array. Each entry is validated in index order: object shape, fields, id, uniqueness, payload, priority, ticks, cost, then effective priority.

| Field          | Default                          | Accepted values                                                      |
| -------------- | -------------------------------- | -------------------------------------------------------------------- |
| `budget`       | required                         | A safe integer from `0` through `MAX_BYTES`.                         |
| `packetHeader` | required                         | A safe integer from `0` through `budget`.                            |
| `updateHeader` | required                         | A safe integer from `0` through `MAX_BYTES`.                         |
| `updates`      | required                         | A dense array of update objects. Empty is valid.                     |
| `age`          | `{ type: "linear", perTick: 0 }` | `{ type: "linear", perTick }` or `{ type: "capped", perTick, cap }`. |
| `strict`       | `false`                          | `true` or `false`.                                                   |

### `options.budget`

`budget` is the size of one outgoing packet, including the packet header and every selected update. It must be an own property whose value is a safe integer from `0` through `9007199254740991`. Otherwise `RangeError`: `budget must be an integer from 0 to 9007199254740991`. A missing key and an own value of `undefined` fail this check. `-0` is read as `0`.

### `options.packetHeader`

`packetHeader` is the fixed cost of sending a packet. It is included in `bytesUsed` only when at least one update is selected. It must be a safe integer from `0` through `budget`. Otherwise `RangeError`: `packetHeader must be an integer from 0 to budget`. A header larger than the budget fails this check. The payload budget is `budget - packetHeader`. That subtraction is exact.

### `options.updateHeader`

`updateHeader` is added to the payload of every update before the fit test. It must be a safe integer from `0` through `9007199254740991`. Otherwise `RangeError`: `updateHeader must be an integer from 0 to 9007199254740991`. `0` is valid. A zero header means the payload is the whole per-update cost.

### `options.updates`

`updates` must be a dense array. Otherwise `TypeError`: `updates must be an array`. A hole, an extra own property, a symbol property, or an accessor element fails that check. Empty is valid and selects nothing.

Each entry must be a plain object. Otherwise `TypeError`: `update must be an object`.

Each update has exactly the own fields `id`, `payload`, `priority`, and `ticks`. A missing field or an extra field throws `TypeError`: `update fields must be id, payload, priority, and ticks`.

Entries are read in index order:

1. `id` must be a string of length at least `1`. Otherwise `TypeError`: `update id must be a non-empty string`.
2. That id must not already have been seen. Otherwise `TypeError`: `update ids must be unique`. Comparison is exact string equality.
3. `payload` must be a safe integer from `0` through `MAX_BYTES`. Otherwise `RangeError`: `payload must be an integer from 0 to 9007199254740991`.
4. `priority` must be a finite number greater than or equal to `0`. Otherwise `RangeError`: `priority must be a finite number greater than or equal to 0`. This is the base priority. `0` is valid. A negative number is rejected so aging cannot move an update downward.
5. `ticks` must be a safe integer from `0` through `MAX_BYTES`. Otherwise `RangeError`: `ticks must be an integer from 0 to 9007199254740991`. This is the caller's count of ticks since the update was last sent.
6. `updateHeader + payload` must be a safe integer. Otherwise `RangeError`: `update cost must be an integer from 0 to 9007199254740991`.
7. The effective priority must be finite. Otherwise `RangeError`: `effective priority must be finite`.

The cost of an update is `updateHeader + payload`. The same header is used for every update in the call.

### `options.age`

`age` selects the factor applied to every base priority. The default is linear growth of `0` per tick, including when the field is omitted or is `undefined`. Under that default the effective priority equals the base priority.

`age` must be a plain object. Otherwise `TypeError`: `age must be an object`.

`age.type` must be `"linear"` or `"capped"`. Otherwise `TypeError`: `age type must be linear or capped`. The check is case-sensitive. A missing `type` fails this check.

A linear age has exactly the own fields `type` and `perTick`. Otherwise `TypeError`: `linear age fields must be type and perTick`.

A capped age has exactly the own fields `type`, `perTick`, and `cap`. Otherwise `TypeError`: `capped age fields must be type, perTick, and cap`.

`perTick` must be a finite number greater than or equal to `0`. Otherwise `RangeError`: `perTick must be a finite number greater than or equal to 0`. `-0` is read as `0`. `perTick` is checked before `cap`.

For `"capped"`, `cap` must be a finite number greater than or equal to `1`. Otherwise `RangeError`: `cap must be a finite number greater than or equal to 1`. A cap of `1` holds every factor at `1`.

The factor for an update is computed as follows.

1. `grown` is `1 + ticks * perTick`.
2. For `"linear"`, the factor is `grown`.
3. For `"capped"`, the factor is `cap` when `grown` is greater than `cap`. Otherwise the factor is `grown`.
4. The effective priority is `priority * factor`.

A non-finite product throws. The cap is applied before that check, so a capped factor can stay finite when the uncapped product would not. `priority * cap` can still be non-finite, and that still throws. The throw happens while the updates are read, in index order, including for an update that would have been oversize.

`ticks` of `0` produces a factor of `1` for every finite `perTick`. A base priority of `0` produces an effective priority of `0`.

### `options.strict`

`strict` selects the walk. The default is `false`, including when the field is omitted or is `undefined`.

A present value other than `undefined` must be `true` or `false`. Otherwise `TypeError`: `strict must be a boolean`. The number `1` and the string `"true"` fail this check.

`false` skips an update that does not fit and continues with the later candidates. `true` stops at the first candidate that does not fit. Every candidate after that stop is deferred, including one whose cost would have fit in the remaining bytes.

Oversize updates are removed before this walk. They do not count as the first misfit.

### Result

The return value is a frozen object. Its fields are written in this order:

| Field       | Meaning                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `selected`  | Ids accepted for the packet, in send order.                             |
| `bytesUsed` | Bytes charged for the packet. `0` when `selected` is empty.             |
| `remaining` | `budget - bytesUsed`.                                                   |
| `deferred`  | Candidates that were not selected, in the same order used for the walk. |
| `oversize`  | Ids whose cost is greater than the payload budget, in input order.      |

`selected`, `deferred`, and `oversize` partition the input ids. No id appears twice.

Send order is the candidate order, with updates that were not taken removed. The candidate order sorts by effective priority descending, then by id ascending. Id order is UTF-16 code unit order, the same order as `left < right` on strings. `"update-a"` is before `"update-b"`. Input order is not the send order.

An update is oversize when `updateHeader + payload` is greater than `budget - packetHeader`. A cost equal to the payload budget is not oversize. It fits when the packet has not yet taken any of that budget. Oversize ids stay in input order. They are not sorted.

Every candidate fits in an empty packet. When `strict` is `false` or `true`, the first candidate is selected whenever the candidate list is not empty. Later candidates are selected only while their cost is less than or equal to the payload bytes still free. After a strict stop, no later candidate is selected.

`bytesUsed` is `0` when `selected` is empty. No packet is built, so the packet header is not charged and `remaining` is `budget`. When at least one update is selected, `bytesUsed` is `packetHeader` plus the cost of each selected update. `remaining` is the payload bytes still free. A selected list of zero-cost updates with a packet header of `0` has `bytesUsed` of `0`.

Each deferred entry is a frozen object:

| Field               | Meaning                                            |
| ------------------- | -------------------------------------------------- |
| `id`                | The update id.                                     |
| `effectivePriority` | `priority * factor` for the age used on this call. |

The entry does not include the payload, the base priority, or the tick count. Oversize ids do not include an effective priority. The value was still computed, and a non-finite value still throws, before the id is classified as oversize.

### Errors

`TypeError` means a value had the wrong shape.

`RangeError` means a number was outside its range, a cost was not a safe integer, or an effective priority was not finite.

| When the check fails                                         | Error        | Message                                                       |
| ------------------------------------------------------------ | ------------ | ------------------------------------------------------------- |
| `options` is missing or is not a plain object                | `TypeError`  | `options must be an object`                                   |
| `options` has an own field outside the six names             | `TypeError`  | `options has an unknown field`                                |
| `budget` is missing or outside its range                     | `RangeError` | `budget must be an integer from 0 to 9007199254740991`        |
| `packetHeader` is missing, negative, or greater than budget  | `RangeError` | `packetHeader must be an integer from 0 to budget`            |
| `updateHeader` is missing or outside its range               | `RangeError` | `updateHeader must be an integer from 0 to 9007199254740991`  |
| `age` is present and is not a plain object                   | `TypeError`  | `age must be an object`                                       |
| `age.type` is missing or is not `linear` or `capped`         | `TypeError`  | `age type must be linear or capped`                           |
| A linear age is missing `perTick` or has an extra field      | `TypeError`  | `linear age fields must be type and perTick`                  |
| A capped age is missing a field or has an extra field        | `TypeError`  | `capped age fields must be type, perTick, and cap`            |
| `perTick` is not a finite number greater than or equal to 0  | `RangeError` | `perTick must be a finite number greater than or equal to 0`  |
| `cap` is not a finite number greater than or equal to 1      | `RangeError` | `cap must be a finite number greater than or equal to 1`      |
| `strict` is present and is not a boolean                     | `TypeError`  | `strict must be a boolean`                                    |
| `updates` is missing or is not a dense array                 | `TypeError`  | `updates must be an array`                                    |
| An update entry is not a plain object                        | `TypeError`  | `update must be an object`                                    |
| An update is missing a field or has an extra field           | `TypeError`  | `update fields must be id, payload, priority, and ticks`      |
| An id is not a non-empty string                              | `TypeError`  | `update id must be a non-empty string`                        |
| An id is repeated                                            | `TypeError`  | `update ids must be unique`                                   |
| `payload` is outside its range                               | `RangeError` | `payload must be an integer from 0 to 9007199254740991`       |
| `priority` is not a finite number greater than or equal to 0 | `RangeError` | `priority must be a finite number greater than or equal to 0` |
| `ticks` is outside its range                                 | `RangeError` | `ticks must be an integer from 0 to 9007199254740991`         |
| `updateHeader + payload` is not a safe integer               | `RangeError` | `update cost must be an integer from 0 to 9007199254740991`   |
| The effective priority is not finite                         | `RangeError` | `effective priority must be finite`                           |

## Design

The budget is a hard size for one packet. The function does not split an update across packets and it does not build a second packet. An update that cannot fit alone is oversize so the caller can shrink it or drop it. Leaving it in `deferred` would look like a temporary wait. The next call would skip it again for the same reason.

The packet header is part of a packet that exists. An empty `selected` list means no packet is built, so `bytesUsed` stays `0` and `remaining` stays `budget`. Charging the header on an empty selection would report bytes that were not sent. Once one update is selected, the header is part of `bytesUsed` because the packet that carries the update pays it. That is why the fit test uses `budget - packetHeader` and not the raw budget. A cost that fits in `budget` but not in `budget - packetHeader` is still oversize.

The per-update header is a fixed framing cost. It is added to the payload before any comparison. A payload of `0` is a real update. It still pays `updateHeader`, and it still occupies a place in send order. It is oversize only when that header alone is greater than the payload budget.

Selection is a single greedy walk, not a search for the combination that fills the most bytes. Filling the most bytes could send a low-priority update and drop a high-priority one. The walk spends bytes on higher effective priority first. Send order is that same order, so the caller does not sort again.

Skip-and-continue exists because the next candidate can be smaller than the one that did not fit. A large update must not block a smaller update that still fits in the bytes left. Strict order is the other choice. The selected ids are then a prefix of the candidate order. A caller that wants that prefix, and is willing to leave unused bytes, sets `strict` to `true`.

Candidates are the updates that are not oversize. The first of them always fits, because the walk starts from a full payload budget and every candidate is within that budget. Strict mode can return an empty `selected` list only when every update is oversize or the pending list is empty.

Effective priority is a product so the wait scales with the gap between base priorities. Adding a constant each tick would let a priority of `1` pass a priority of `5` after a fixed number of ticks that ignores how large the second priority is. Multiplication does not. At `0.5` per tick, a base priority of `1` needs a factor above `5` before it passes a fresh base priority of `5`. That factor is `1 + ticks * 0.5`, so `10` ticks produce `6` and the starved update goes first. A base priority of `0` stays `0` for every factor. Age does not invent priority from nothing.

The cap exists so a stale low-priority update cannot grow past a ceiling the caller picked. The ceiling is a factor, not a priority. A cap of `4` stops the example above at effective priority `4`, and the fresh priority of `5` stays ahead. A cap equal to the uncapped factor does not lower it. A cap of `1` disables growth. The comparison is `grown > cap`. A factor equal to the cap stays.

Ties use the id, not the input index. Two updates with the same effective priority then have one order on every call, including after the caller rebuilds the array. The order is code-unit order. It is not `localeCompare`. The caller who wants a different tie break gives those updates different base priorities.

The tick count is an input. The module does not read a clock and does not remember a previous call. The caller increments `ticks` for an update that was deferred and resets it for an update that was selected. Two calls do not share result objects, so freezing one result cannot change the next call.

The result lists deferred priorities because the caller can store them with the deferred ids. The selected ids are enough to build the packet. The oversize ids are enough to find updates that need a different representation. Payloads are not copied onto the result. The caller still holds them.

## License

MIT. Copyright (c) 2026 Vadim Gubin.
