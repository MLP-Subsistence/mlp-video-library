import assert from "node:assert/strict";
import { test } from "node:test";
import { projectWhereForUser } from "../projects";

test("localization projects are personal to the account that made them", () => {
  assert.deepEqual(projectWhereForUser({ id: "u1", role: "educator" }), { createdById: "u1" });
  // Content managers prepare the shared templates, but their own localizations stay theirs.
  assert.deepEqual(projectWhereForUser({ id: "u2", role: "editor" }), { createdById: "u2" });
  // Administrators keep oversight for support.
  assert.deepEqual(projectWhereForUser({ id: "u3", role: "admin" }), {});
});
