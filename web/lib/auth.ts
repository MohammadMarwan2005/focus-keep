import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
export const COOKIE_NAME = "yawmi_session";

export type Session = {
  uid: number;
  username: string;
  role: "admin" | "user";
  name: string;
};

export async function signSession(s: Session): Promise<string> {
  return new SignJWT(s)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("unauthorized");
  return s;
}
