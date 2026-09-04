import bcrypt from "bcryptjs";
import { config } from "../config.js";

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, config.bcryptCost);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
