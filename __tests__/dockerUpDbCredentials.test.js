const { parseDbCredentials } = require('../scripts/docker-up.js');

describe('parseDbCredentials', () => {
  it('extracts user/password/db name from a DATABASE_URL', () => {
    expect(parseDbCredentials('postgresql://myuser:my%40pass@localhost:5432/mydb?schema=public')).toEqual({
      DATABASE_USER: 'myuser',
      DATABASE_PASSWORD: 'my@pass',
      DATABASE_NAME: 'mydb',
    });
  });

  it('returns empty object for missing or unparseable input', () => {
    expect(parseDbCredentials(undefined)).toEqual({});
    expect(parseDbCredentials('not-a-url')).toEqual({});
  });
});
