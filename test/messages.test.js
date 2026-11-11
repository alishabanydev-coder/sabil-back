const { before, describe, it } = require("node:test");
const request = require("supertest");
const assert = require("node:assert/strict");
const Supporter = require("../models/supporter.model");

process.env.NODE_ENV = "test";

const app = require("../app");

before(() => {
  Supporter.create = async (doc) => ({
    name: doc.name,
    message: doc.message,
    email: doc.email,
  });
});

describe("POST /api/admin/public/supporters", () => {
  it("rejects a message without a name", async () => {
    const response = await request(app)
      .post("/api/admin/public/supporters")
      .send({ message: "Hello from a visitor" });

    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Name and message are required.");
  });

  it("saves a visitor message", async () => {
    const response = await request(app)
      .post("/api/admin/public/supporters")
      .send({
        name: "Sara",
        message: "Hello from a visitor",
        email: "sara@example.com",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.supporter.name, "Sara");
    assert.equal(response.body.supporter.message, "Hello from a visitor");
  });
});
