import { compare, hash } from "bcryptjs";

const saltRounds = 12;

export function hashPassword(password: string) {
  return hash(password, saltRounds);
}

export function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}
