import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";

const sessionCookieName = "sme_moneybook_session";
const sessionDays = 30;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

function getClientIp(request?: Request) {
  if (!request) {
    return undefined;
  }

  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

export async function createSession(userId: string, request?: Request) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  await getPrisma().session.create({
    data: {
      token,
      userId,
      userAgent: request?.headers.get("user-agent")?.slice(0, 240),
      ipAddress: getClientIp(request)?.slice(0, 80),
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    await getPrisma().session.deleteMany({ where: { token } });
  }

  cookieStore.delete(sessionCookieName);
}

export async function destroySessionById(userId: string, sessionId: string) {
  await getPrisma().session.deleteMany({
    where: {
      id: sessionId,
      userId,
    },
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const session = await getPrisma().session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date()) {
    await getPrisma().session.deleteMany({ where: { token } });
    return null;
  }

  await getPrisma().session.updateMany({
    where: { token },
    data: { lastSeenAt: new Date() },
  });

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return user;
}

export async function listSessionsForUser(userId: string) {
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(sessionCookieName)?.value;
  const sessions = await getPrisma().session.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  });

  return sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
    isCurrent: session.token === currentToken,
  }));
}
