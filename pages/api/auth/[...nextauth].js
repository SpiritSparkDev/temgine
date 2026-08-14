import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';

export const authOptions = {
  providers: [
    // ── Admin / Editor login (SHA-256 passwords) ─────────────────────────────
    CredentialsProvider({
      id: 'admin-credentials',
      name: 'Admin Login',
      credentials: {
        username: { label: "Benutzername", type: "text" },
        password: { label: "Passwort", type: "password" }
      },
      async authorize(credentials) {
        const { prisma } = await import('../../../lib/prisma');
        const crypto = await import('crypto');
        const username = credentials?.username?.trim();
        const password = credentials?.password;

        if (!username || !password) return null;
        
        try {
          // Case-insensitive lookup: setup stores email as lowercase,
          // but user might type it with capitals on the login form.
          const user = await prisma.user.findFirst({
            where: {
              password: { not: null },
              OR: [
                { email: { equals: username, mode: 'insensitive' } },
                { name: { equals: username, mode: 'insensitive' } },
              ],
            },
            select: { id: true, name: true, email: true, password: true, role: true },
          });

          if (!user?.password) {
            console.error('[auth] User not found for username:', username);
            return null;
          }

          const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
          if (user.password === hashedPassword) {
            return { id: user.id, name: user.name, email: user.email, role: user.role, accountType: 'admin' };
          }
          console.error('[auth] Password mismatch for user:', user.email,
            '| stored:', user.password.slice(0, 8) + '…',
            '| computed:', hashedPassword.slice(0, 8) + '…');
        } catch (error) {
          console.error('Admin auth error:', error);
        }
        return null;
      }
    }),

    // ── Member / Site-visitor login (bcrypt passwords) ───────────────────────
    CredentialsProvider({
      id: 'member-credentials',
      name: 'Mitglieder-Login',
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" }
      },
      async authorize(credentials) {
        const { prisma } = await import('../../../lib/prisma');
        const bcrypt = await import('bcryptjs');
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) return null;

        try {
          const member = await prisma.member.findUnique({
            where: { email },
            select: {
              id: true, email: true, name: true, password: true,
              verified: true, blocked: true,
              groups: { select: { group: { select: { slug: true } } } },
            },
          });

          if (!member) return null;
          if (member.blocked) return null;
          if (!member.verified) return null;

          const valid = await bcrypt.compare(password, member.password);
          if (!valid) return null;

          const groupSlugs = member.groups.map(mg => mg.group.slug);
          return {
            id: member.id,
            name: member.name || member.email,
            email: member.email,
            accountType: 'member',
            memberGroups: groupSlugs,
          };
        } catch (error) {
          console.error('Member auth error:', error);
        }
        return null;
      }
    }),

    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET ? [
      GithubProvider({
        clientId: process.env.GITHUB_ID,
        clientSecret: process.env.GITHUB_SECRET,
      })
    ] : []),
  ],
  pages: {
    signIn: '/login',
  },
  cookies: {
    sessionToken: {
      name: `${process.env.NEXTAUTH_URL?.includes('localhost') ? '' : '__Secure-'}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.accountType = user.accountType || 'admin';
        token.memberGroups = user.memberGroups || [];
      }
      return token;
    },
    async signIn({ user, account, profile }) {
      if (account && account.provider === 'github') {
        const { prisma } = await import('../../../lib/prisma');
        try {
          const existingUsers = await prisma.user.count();
          const isFirstUser = existingUsers === 0;
          await prisma.user.upsert({
            where: { email: user.email },
            update: { name: user.name, image: user.image },
            create: {
              email: user.email,
              name: user.name,
              image: user.image,
              role: isFirstUser ? 'ADMIN' : 'EDITOR',
            },
          });
        } catch (error) {
          console.error('Error saving user:', error);
        }
      }
      return true;
    },
    async session({ session, token }) {
      session.user.id = token.sub;
      session.user.role = token.role;
      session.user.accountType = token.accountType || 'admin';
      session.user.memberGroups = token.memberGroups || [];
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
