import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const TOKEN_TTL = "7d";
const SALT_ROUNDS = 12;

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set — required to sign/verify login sessions.");
  }
  return secret;
}

export function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret(), { expiresIn: TOKEN_TTL });
}

// Throws (jsonwebtoken's JsonWebTokenError / TokenExpiredError) on an
// invalid or expired token — callers should catch and respond 401.
export function verifyToken(token) {
  return jwt.verify(token, jwtSecret());
}
