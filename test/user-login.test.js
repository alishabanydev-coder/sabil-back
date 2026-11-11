const { before, describe, it } = require("node:test");
const request = require("supertest");
const assert = require("node:assert/strict");
const User = require("../models/user.model");

process.env.NODE_ENV = "test";
process.env.USER_JWT_SECRET = "test-user-jwt-secret";

const app = require("../app");

const USER_ID = "507f1f77bcf86cd799439021";

const fakeUser = {
  _id: {
    toString() {
      return USER_ID;
    },
  },
  isActive: true,
  email: "reader@example.com",
  displayName: "Reader",
  avatar: null,
  emailVerified: false,
  showAsAnonymousInDonations: false,
  async comparePassword(password) {
    return password === "test-password";
  },
  async save() {},
  toAuthJSON() {
    return {
      id: USER_ID,
      email: this.email,
      displayName: this.displayName,
      avatar: null,
      emailVerified: false,
      showAsAnonymousInDonations: false,
    };
  },
};

before(() => {
  User.findOne = async (query) =>
    query.email === "reader@example.com" ? fakeUser : null;
});

describe("POST /api/auth/login", () => {
  it("rejects a body without a password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "reader@example.com" });

    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Email and password are required.");
  });

  it("rejects a wrong password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "reader@example.com", password: "wrong-password" });

    assert.equal(response.status, 401);
    assert.equal(response.body.message, "Invalid email or password.");
  });

  it("returns a token for the fake user", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "reader@example.com", password: "test-password" });

    assert.equal(response.status, 200);
    assert.equal(typeof response.body.token, "string");
    assert.equal(response.body.user.email, "reader@example.com");
    assert.equal(response.body.user.passwordHash, undefined);
  });
});
