import { SignJWT, jwtVerify } from "jose";

const JWT_ISSUER = "teamflow";
const STREAM_AUDIENCE = "teamflow-stream";
const STREAM_TTL_SEC = 60 * 60;

function getJwtSecret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? "dev-secret",
  );
}

export async function signStreamToken(linkId: string, userId: string) {
  return new SignJWT({ sub: userId, linkId, type: "stream" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(STREAM_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${STREAM_TTL_SEC}s`)
    .sign(getJwtSecret());
}

export async function verifyStreamToken(token: string) {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    issuer: JWT_ISSUER,
    audience: STREAM_AUDIENCE,
  });
  if (payload.type !== "stream" || typeof payload.sub !== "string") {
    throw new Error("Invalid stream token");
  }
  if (typeof payload.linkId !== "string") {
    throw new Error("Invalid stream token");
  }
  return { userId: payload.sub, linkId: payload.linkId };
}

export function streamTokenExpiresAt() {
  return new Date(Date.now() + STREAM_TTL_SEC * 1000).toISOString();
}
