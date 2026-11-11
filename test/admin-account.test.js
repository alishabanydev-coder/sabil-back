const { before, describe, it } = require("node:test");
const request = require("supertest");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin.model");

process.env.NODE_ENV = "test";
process.env.ADMIN_JWT_SECRET = "test-jwt-secret";

const app = require("../app");

const SUPER_ID = "507f1f77bcf86cd799439011";
const NORMAL_ID = "507f1f77bcf86cd799439012";
const MISSING_ID = "507f1f77bcf86cd799439099";

function idOf(value) {
  return {
    equals(other) {
      return String(other) === value;
    },
  };
}

const superAdmin = {
  _id: idOf(SUPER_ID),
  isActive: true,
  role: "super_admin",
  toAuthJSON() {
    return {
      id: SUPER_ID,
      userName: "tester",
      name: "Tester",
      role: "super_admin",
      permissions: [],
    };
  },
};

const normalAdmin = {
  _id: idOf(NORMAL_ID),
  isActive: true,
  role: "admin",
  toAuthJSON() {
    return {
      id: NORMAL_ID,
      userName: "editor",
      name: "Editor",
      role: "admin",
      permissions: [],
    };
  },
};

function tokenFor(adminId) {
  return jwt.sign({ adminId }, process.env.ADMIN_JWT_SECRET, {
    subject: adminId,
  });
}

function fakeCreatedAdmin(doc) {
  return {
    toAuthJSON() {
      return {
        id: "new-admin-id",
        userName: doc.userName,
        name: doc.name,
        role: doc.role,
        permissions: doc.permissions,
      };
    },
  };
}

before(() => {
  Admin.findById = async (id) => {
    if (id === SUPER_ID) return superAdmin;
    if (id === NORMAL_ID) return normalAdmin;
    return null;
  };

  Admin.find = () => ({
    sort: async () => [
      { userName: "tester", name: "Tester", role: "super_admin" },
    ],
  });

  Admin.hashPassword = async () => "hashed";
  Admin.create = async (doc) => fakeCreatedAdmin(doc);

  Admin.findByIdAndDelete = async (id) =>
    id === MISSING_ID ? null : { _id: id };
});

describe("GET /api/admin/me", () => {
  it("rejects a request with no token", async () => {
    const response = await request(app).get("/api/admin/me");

    assert.equal(response.status, 401);
    assert.equal(
      response.body.message,
      "Admin authentication token is required."
    );
  });

  it("returns the admin from the token", async () => {
    const response = await request(app)
      .get("/api/admin/me")
      .set("Authorization", `Bearer ${tokenFor(NORMAL_ID)}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.userName, "editor");
    assert.equal(response.body.role, "admin");
  });
});

describe("GET /api/admin/admins", () => {
  it("rejects an admin who is not a super admin", async () => {
    const response = await request(app)
      .get("/api/admin/admins")
      .set("Authorization", `Bearer ${tokenFor(NORMAL_ID)}`);

    assert.equal(response.status, 403);
    assert.equal(response.body.message, "Super admin access is required.");
  });

  it("returns the admin list for a super admin", async () => {
    const response = await request(app)
      .get("/api/admin/admins")
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.admins.length, 1);
    assert.equal(response.body.admins[0].passwordHash, undefined);
  });
});

describe("POST /api/admin/admins", () => {
  it("rejects a body without a username, name, and password", async () => {
    const response = await request(app)
      .post("/api/admin/admins")
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`)
      .send({ name: "Editor" });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.message,
      "Username, name, and password are required."
    );
  });

  it("rejects an unknown role", async () => {
    const response = await request(app)
      .post("/api/admin/admins")
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`)
      .send({
        userName: "editor",
        name: "Editor",
        password: "test-password",
        role: "owner",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Invalid admin role.");
  });

  it("creates an admin for a super admin", async () => {
    const response = await request(app)
      .post("/api/admin/admins")
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`)
      .send({
        userName: "Editor",
        name: "Editor",
        password: "test-password",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.admin.userName, "editor");
    assert.equal(response.body.admin.passwordHash, undefined);
  });

  it("rejects a username that already exists", async () => {
    Admin.create = async () => {
      const error = new Error("duplicate");
      error.code = 11000;
      throw error;
    };

    const response = await request(app)
      .post("/api/admin/admins")
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`)
      .send({
        userName: "editor",
        name: "Editor",
        password: "test-password",
      });

    Admin.create = async (doc) => fakeCreatedAdmin(doc);

    assert.equal(response.status, 409);
    assert.equal(
      response.body.message,
      "An admin with this username already exists."
    );
  });
});


