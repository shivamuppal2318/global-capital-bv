import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { requireApiKey } from "../src/middleware/apiKey.js";

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  return res;
}

let originalApiKey;
before(() => {
  originalApiKey = process.env.API_KEY;
});
after(() => {
  process.env.API_KEY = originalApiKey;
});

test("rejects with 500 when API_KEY is not configured server-side (fails closed)", () => {
  delete process.env.API_KEY;
  const req = { headers: {} };
  const res = fakeRes();
  let nextCalled = false;

  requireApiKey(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 500);
});

test("rejects with 401 when the header is missing", () => {
  process.env.API_KEY = "secret-key";
  const req = { headers: {} };
  const res = fakeRes();
  let nextCalled = false;

  requireApiKey(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("rejects with 401 when the header value is wrong", () => {
  process.env.API_KEY = "secret-key";
  const req = { headers: { "x-api-key": "wrong-key" } };
  const res = fakeRes();
  let nextCalled = false;

  requireApiKey(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("calls next() when the header matches", () => {
  process.env.API_KEY = "secret-key";
  const req = { headers: { "x-api-key": "secret-key" } };
  const res = fakeRes();
  let nextCalled = false;

  requireApiKey(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});
