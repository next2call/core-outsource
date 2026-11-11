const crypto = require("crypto");

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const secret = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters");
  }
  return process.env.JWT_SECRET;
};
const signPart = (value) => crypto.createHmac("sha256", secret()).update(value).digest("base64url");

function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: String(user.user_id), admin: String(user.admin), userType: String(user.user_type), iat: now, exp: now + Number(process.env.JWT_EXPIRES_SECONDS || 28800) };
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  return `${unsigned}.${signPart(unsigned)}`;
}

function authenticate(req, res, next) {
  const value = req.get("authorization") || "";
  const token = value.startsWith("Bearer ") ? value.slice(7) : "";
  const [head, body, signature] = token.split(".");
  const expected = head && body ? signPart(`${head}.${body}`) : "";
  if (!head || !body || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ status: "error", message: "Valid Bearer token required" });
  }
  try {
    req.auth = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (req.auth.exp <= Math.floor(Date.now() / 1000)) throw new Error("expired");
    next();
  } catch (_) { return res.status(401).json({ status: "error", message: "Token expired or invalid" }); }
}

function sameUser(req, supplied) {
  return !supplied || String(supplied) === req.auth.sub;
}
module.exports = { issueToken, authenticate, sameUser };
