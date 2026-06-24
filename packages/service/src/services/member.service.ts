import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export async function listMembers(
  organizationId: string,
  params: { limit: number; offset: number },
) {
  const { limit, offset } = params;

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    }),
    prisma.member.count({ where: { organizationId } }),
  ]);

  return { members, total };
}

export async function removeMember(organizationId: string, memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });
  if (!member || member.organizationId !== organizationId) {
    throw new HTTPException(404, { message: "Member not found" });
  }

  if (member.role === "owner") {
    const ownerCount = await prisma.member.count({
      where: { organizationId, role: "owner" },
    });
    if (ownerCount <= 1) {
      throw new HTTPException(400, {
        message: "An organization must have at least one owner",
      });
    }
  }

  return prisma.member.delete({ where: { id: memberId } });
}
