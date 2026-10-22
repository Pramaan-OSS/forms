import { hashSecret, verifySecret } from "@/lib/crypto";

export const hashPassword = async (password: string) => {
  return await hashSecret(password, 12);
};

export const verifyPassword = async (password: string, hashedPassword: string) => {
  return await verifySecret(password, hashedPassword);
};
