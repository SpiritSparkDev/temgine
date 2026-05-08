/**
 * pages/api/member/verify.js
 *
 * GET – verify a member's email address via token.
 * Redirects to /member-login?verified=1 on success,
 * or shows an error via redirect on failure.
 */

import { prisma } from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = (req.query.token || '').toString().trim();
  if (!token) {
    return res.redirect('/member-login?error=invalid-token');
  }

  const member = await prisma.member.findUnique({ where: { verifyToken: token } });

  if (!member) {
    return res.redirect('/member-login?error=invalid-token');
  }

  if (member.verifyTokenExp && new Date() > member.verifyTokenExp) {
    return res.redirect('/member-login?error=token-expired');
  }

  await prisma.member.update({
    where: { id: member.id },
    data: { verified: true, verifyToken: null, verifyTokenExp: null },
  });

  return res.redirect('/member-login?verified=1');
}
