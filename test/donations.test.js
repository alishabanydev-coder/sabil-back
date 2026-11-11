const { before, describe, it } = require("node:test");
const request = require("supertest");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin.model");
const User = require("../models/user.model");
const Donation = require("../models/donation.model");
const DonationProject = require("../models/donationProject.model");

process.env.NODE_ENV = "test";
process.env.ADMIN_JWT_SECRET = "test-jwt-secret";

const app = require("../app");

const SUPER_ID = "507f1f77bcf86cd799439011";
const NORMAL_ID = "507f1f77bcf86cd799439012";
const PROJECT_ID = "507f1f77bcf86cd799439031";
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

function tokenFor(adminId) {
  return jwt.sign({ adminId }, process.env.ADMIN_JWT_SECRET, {
    subject: adminId,
  });
}

function queryResult(value) {
  const query = Promise.resolve(value);
  query.select = () => Promise.resolve(value);
  return query;
}

before(() => {
  Admin.findById = async (id) => {
    if (id === SUPER_ID) return superAdmin;
    if (id === NORMAL_ID) return normalAdmin;
    return null;
  };

  DonationProject.findById = (id) =>
    queryResult(id === PROJECT_ID ? { _id: PROJECT_ID } : null);

  User.findById = (id) => queryResult(id === USER_ID ? { _id: USER_ID } : null);

  Donation.create = async (doc) => ({
    _id: "donation-id",
    userId: doc.userId,
    donationProjectId: PROJECT_ID,
    amount: doc.amount,
    currency: doc.currency,
    source: doc.source,
  });
});

describe("POST /api/admin/donations", () => {
  it("rejects a request with no token", async () => {
    const response = await request(app).post("/api/admin/donations").send({
      donationProjectId: PROJECT_ID,
      amount: 25,
    });

    assert.equal(response.status, 401);
    assert.equal(
      response.body.message,
      "Admin authentication token is required."
    );
  });

  it("rejects an admin without donation access", async () => {
    const response = await request(app)
      .post("/api/admin/donations")
      .set("Authorization", `Bearer ${tokenFor(NORMAL_ID)}`)
      .send({ donationProjectId: PROJECT_ID, amount: 25 });

    assert.equal(response.status, 403);
    assert.equal(
      response.body.message,
      "Admin create access is required for donation."
    );
  });

  it("rejects a missing amount", async () => {
    const response = await request(app)
      .post("/api/admin/donations")
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`)
      .send({ donationProjectId: PROJECT_ID });

    assert.equal(response.status, 400);
    assert.equal(
      response.body.message,
      "A valid non-negative amount is required."
    );
  });

  it("records a donation for a super admin", async () => {
    const response = await request(app)
      .post("/api/admin/donations")
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`)
      .send({ donationProjectId: PROJECT_ID, amount: 25, currency: "USD" });

    assert.equal(response.status, 201);
    assert.equal(response.body.donation.amount, 25);
    assert.equal(response.body.donation.donationProjectId, PROJECT_ID);
  });

  it("ties a donation to the user in the route", async () => {
    const response = await request(app)
      .post(`/api/admin/site-users/${USER_ID}/donations`)
      .set("Authorization", `Bearer ${tokenFor(SUPER_ID)}`)
      .send({ donationProjectId: PROJECT_ID, amount: 10 });

    assert.equal(response.status, 201);
    assert.equal(response.body.donation.amount, 10);
    assert.equal(String(response.body.donation.userId), USER_ID);
  });
});
