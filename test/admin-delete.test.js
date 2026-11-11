const { before, describe, it } = require("node:test");
const request = require("supertest");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const app = require("../app");
const Admin = require("../models/admin.model");

process.env.NODE_ENV = "test";
process.env.ADMIN_JWT_SECRET = "test-jwt-secret";

const OTHER_ID = "507f1f77bcf86cd799439013";
const SUPER_ID = "507f1f77bcf86cd799439011";
const MISSING_ID = "507f1f77bcf86cd799439099";

const superAdmin = {
  _id: {
    equals(other) {
      return String(other) === SUPER_ID;
    },
  },
  isActive: true,
  role: "super_admin",
};

function tokenFor(adminId) {
  return jwt.sign({ adminId }, process.env.ADMIN_JWT_SECRET, {
    subject: adminId,
  });
}

before(() => {
  Admin.findById = async (id) => (id === SUPER_ID ? superAdmin : null);
  Admin.findByIdAndDelete = async (id) =>
    id === MISSING_ID ? null : { _id: id };
});

describe("DELETE /api/admin/admins/:id", () => {
  it("rejects an id that is not a Mongo id", async () => {
    const response = await request(app)
      .delete("/api/admin/admins/abc")
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`);

    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Invalid admin id.");
  });

  it("rejects a super admin deleting their own account", async () => {
    const response = await request(app)
      .delete(`/api/admin/admins/${SUPER_ID}`)
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`);

    assert.equal(response.status, 400);
    assert.equal(
      response.body.message,
      "A super admin cannot delete their own account."
    );
  });

  it("rejects a valid id that matches no admin", async () => {
    const response = await request(app)
      .delete(`/api/admin/admins/${MISSING_ID}`)
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.message, "Admin not found.");
  });

  it("deletes another admin for a super admin", async () => {
    const response = await request(app)
      .delete(`/api/admin/admins/${OTHER_ID}`)
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.message, "Admin deleted.");
  });
});
