import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';

export const authOptions = {
  providers: [
    CredentialsProvider({
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

        if (!username || !password) {
          return null;
        }
        
        try {
          // Suche User mit Passwort (username kann Email oder Name sein)
          const user = await prisma.user.findFirst({
            where: {
              password: { not: null },
              OR: [
                { email: username },
                { name: username },
              ],
            },
            select: {
              id: true,
              name: true,
              email: true,
              password: true,
              role: true,
            },
          });

          if (!user?.password) {
            return null;
          }

          const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

          if (user.password === hashedPassword) {
            return { id: user.id, name: user.name, email: user.email, role: user.role };
          }
        } catch (error) {
          console.error('Auth error:', error);
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
  callbacks: {
    async signIn({ user, account, profile }) {
      // Benutzer in Datenbank speichern (bei OAuth-Login)
      if (account && (account.provider === 'github' || account.provider === 'google')) {
        const { prisma } = await import('../../../lib/prisma');
        
        try {
          // Prüfe ob es der erste OAuth-User ist oder bestimmte Emails
          const existingUsers = await prisma.user.count();
          const isFirstUser = existingUsers === 0;
          
          await prisma.user.upsert({
            where: { email: user.email },
            update: {
              name: user.name,
              image: user.image,
            },
            create: {
              email: user.email,
              name: user.name,
              image: user.image,
              role: isFirstUser ? 'ADMIN' : 'EDITOR', // Erster User wird Admin
            },
          });
        } catch (error) {
          console.error('Error saving user:', error);
        }
      }
      return true;
    },
    async session({ session, token }) {
      // Session-Daten erweitern falls nötig
      session.user.id = token.sub;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
