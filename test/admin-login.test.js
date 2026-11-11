const { after, before, describe, it } = require("node:test");
const request = require("supertest");
const assert = require("node:assert/strict");
const app = require("../app");
const dotenv = require("dotenv");
const Admin = require("../models/admin.model");

dotenv.config();

process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "tester";
process.env.ADMIN_PASSWORD = "test-password";
process.env.ADMIN_JWT_SECRET = "test-jwt-secret";

const fakeAdmin = {
  role: "super_admin",
  isActive: true,
  async comparePassword(password) {
    return password === "test-password";
  },
  toAuthJSON() {
    return {
      id: "admin-test-id",
      userName: "tester",
      name: "tester",
      role: "super_admin",
      permissions: [],
    };
  },
};

before(() => {
  Admin.findOne = async (query) =>
    query.userName === "tester" ? fakeAdmin : null;
});

after(async () => {});

describe("POST /api/admin/login", () => {
  it("rejects a body without password", async () => {
    const response = await request(app)
      .post("/api/admin/login")
      .send({ username: "superadmin" });
    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Username and password are required.");
  });

  it("rejects for user or password is wrong", async () => {
    const response = await request(app)
      .post("/api/admin/login")
      .send({ userName: "tester", password: "wrong-password" });

    assert.equal(response.status, 401);
    assert.equal(response.body.message, "Invalid username or password.");
  });

  it("successful login", async () => {
    const response = await request(app)
      .post("/api/admin/login")
      .send({ userName: "tester", password: "test-password" });

    assert.equal(response.status, 200);
    assert.equal(typeof response.body.token, "string");
    assert.equal(response.body.password, undefined);
  });
});
