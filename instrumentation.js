export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logSetupLinkIfNeeded } = await import('./lib/setupToken');
    await logSetupLinkIfNeeded();
  }
}
