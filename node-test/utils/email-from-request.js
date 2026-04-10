"use strict";

function getEmailFromRequest(req) {
  return (
    req.body?.email ||
    req.query?.email ||
    req.headers["x-user-email"] ||
    ""
  );
}

module.exports = {
  getEmailFromRequest
};
