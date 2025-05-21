// crypto.ts
import crypto from "crypto";

const algorithm = "aes-256-cbc";
const iv = Buffer.alloc(16, 0); // Static IV for demo; use random IV in production

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest().subarray(0, 32);
}

export function encrypt(text: string, key: string): string {
  const cipher = crypto.createCipheriv(algorithm, deriveKey(key), iv);
  return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString("hex");
}

export function decrypt(encrypted: string, key: string): string {
  const decipher = crypto.createDecipheriv(algorithm, deriveKey(key), iv);
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final()
  ]).toString("utf8");
}