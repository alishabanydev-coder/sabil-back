const { before, describe, it } = require("node:test");
const request = require("supertest");
const assert = require("node:assert/strict");
const app = require("../app");
const Admin = require("../models/admin.model");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.ADMIN_JWT_SECRET = "test-jwt-secret";

const superAdmin = {
  isActive: true,
  role: "super_admin",
};
const normalAdmin = {
  isActive: true,
  role: "admin",
};

const updatedAdmin = {
  toAuthJSON() {
    return {
      id: "507f1f77bcf86cd799439011",
      userName: "renamed",
      name: "New Name",
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

before(() => {
  Admin.findById = async (id) => {
    if (id === "super-admin-id") {
      return superAdmin;
    }
    if (id === "normal-admin-id") {
      return normalAdmin;
    }
    return null;
  };
  Admin.findByIdAndUpdate = async (id) =>
    id === "507f1f77bcf86cd799439099" ? null : updatedAdmin;
});

describe("PATCH /api/admin/admins/:id", () => {
  it("rejects a request with no token", async () => {
    const response = await request(app).patch("/api/admin/admins/abc");
    assert.equal(response.status, 401);
    assert.equal(
      response.body.message,
      "Admin authentication token is required."
    );
  });
  it("rejects an admin who is not a super admin", async () => {
    const response = await request(app)
      .patch("/api/admin/admins/507f1f77bcf86cd799439011")
      .set("Authorization", `Bearer ${tokenFor("normal-admin-id")}`)
      .send({ name: "New Name" });
    assert.equal(response.status, 403);
    assert.equal(response.body.message, "Super admin access is required.");
  });
  it("rejects a valid id that matches no admin", async () => {
    const response = await request(app)
      .patch("/api/admin/admins/507f1f77bcf86cd799439099")
      .set("Authorization", `Bearer ${tokenFor("super-admin-id")}`)
      .send({ name: "New Name" });
    assert.equal(response.status, 404);
    assert.equal(response.body.message, "Admin not found.");
  });
  it("rejects an id that is not a Mongo id", async () => {
    const response = await request(app)
      .patch("/api/admin/admins/abc")
      .set("Authorization", `Bearer ${tokenFor("super-admin-id")}`);
    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Invalid admin id.");
  });
  it("updates the admin for a super admin", async () => {
    const response = await request(app)
      .patch("/api/admin/admins/507f1f77bcf86cd799439011")
      .set("Authorization", `Bearer ${tokenFor("super-admin-id")}`)
      .send({ name: "New Name" });
    assert.equal(response.status, 200);
    assert.equal(response.body.admin.name, "New Name");
    assert.equal(response.body.admin.passwordHash, undefined);
  });
});
