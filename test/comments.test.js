const { before, describe, it } = require("node:test");
const request = require("supertest");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin.model");
const User = require("../models/user.model");
const Comment = require("../models/comment.model");

process.env.NODE_ENV = "test";
process.env.ADMIN_JWT_SECRET = "test-jwt-secret";
process.env.USER_JWT_SECRET = "test-user-jwt-secret";

const app = require("../app");

const SUPER_ID = "507f1f77bcf86cd799439011";
const NORMAL_ID = "507f1f77bcf86cd799439012";
const USER_ID = "507f1f77bcf86cd799439021";

const superAdmin = {
  isActive: true,
  role: "super_admin",
};

const normalAdmin = {
  isActive: true,
  role: "admin",
  permissions: [],
};

const fakeUser = {
  _id: {
    toString() {
      return USER_ID;
    },
  },
  isActive: true,
  displayName: "Reader",
  avatar: null,
  showAsAnonymousInDonations: false,
  getCommentAuthorPresentation() {
    return { username: "Reader", avatar: null };
  },
};

function adminToken(adminId) {
  return jwt.sign({ adminId }, process.env.ADMIN_JWT_SECRET, {
    subject: adminId,
  });
}

function userToken() {
  return jwt.sign({ userId: USER_ID }, process.env.USER_JWT_SECRET, {
    subject: USER_ID,
  });
}

before(() => {
  Admin.findById = async (id) => {
    if (id === SUPER_ID) return superAdmin;
    if (id === NORMAL_ID) return normalAdmin;
    return null;
  };

  User.findById = async (id) => (id === USER_ID ? fakeUser : null);

  Comment.create = async (doc) => ({
    _id: "comment-id",
    text: doc.text,
    username: doc.username,
    avatar: doc.avatar ?? null,
    userId: doc.userId ? USER_ID : null,
    targetType: doc.targetType,
    targetId: null,
    parentCommentId: null,
  });
});

describe("POST /api/auth/public/comments", () => {
  it("rejects a request with no user token", async () => {
    const response = await request(app).post("/api/auth/public/comments").send({
      text: "Hello",
      targetType: "general",
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.message, "User authentication token is required.");
  });

  it("rejects a comment without text", async () => {
    const response = await request(app)
      .post("/api/auth/public/comments")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ targetType: "general" });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.message,
      "Text and a valid target type are required."
    );
  });

  it("creates a comment for a signed-in user", async () => {
    const response = await request(app)
      .post("/api/auth/public/comments")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ text: "Hello", targetType: "general" });

    assert.equal(response.status, 201);
    assert.equal(response.body.comment.text, "Hello");
    assert.equal(response.body.comment.username, "Reader");
  });
});

describe("POST /api/admin/comments", () => {
  it("rejects an admin without comment access", async () => {
    const response = await request(app)
      .post("/api/admin/comments")
      .set("Authorization", `Bearer ${adminToken(NORMAL_ID)}`)
      .send({
        text: "Hello",
        username: "Staff",
        targetType: "general",
      });

    assert.equal(response.status, 403);
    assert.equal(
      response.body.message,
      "Admin create access is required for comments."
    );
  });

  it("rejects a comment without text", async () => {
    const response = await request(app)
      .post("/api/admin/comments")
      .set("Authorization", `Bearer ${adminToken(SUPER_ID)}`)
      .send({ username: "Staff", targetType: "general" });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.message,
      "Text, username, and a valid target type are required."
    );
  });

  it("creates a comment for a super admin", async () => {
    const response = await request(app)
      .post("/api/admin/comments")
      .set("Authorization", `Bearer ${adminToken(SUPER_ID)}`)
      .send({
        text: "Thanks for the gift",
        username: "Staff",
        targetType: "general",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.comment.text, "Thanks for the gift");
    assert.equal(response.body.comment.username, "Staff");
  });
});
