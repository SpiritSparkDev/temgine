/**
 * __tests__/api/contact.test.js
 * Tests for POST /api/contact validation and message key handling.
 */

jest.disableAutomock();

const mockPrisma = {
  setting: {
    findUnique: jest.fn(),
  },
  contactMessage: {
    create: jest.fn(),
  },
};

jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/email', () => ({ sendMail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/rateLimit', () => ({
  rateLimit: () => ({ check: () => ({ ok: true, retryAfter: 0 }) }),
}));

const handler = require('../../pages/api/contact').default;
const { sendMail } = require('../../lib/email');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

describe('POST /api/contact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.contactMessage.create.mockResolvedValue({ id: 'msg-1' });
  });

  test('accepts message key and returns 200', async () => {
    const req = {
      method: 'POST',
      headers: {},
      body: {
        name: 'Andre',
        email: 'andre@example.com',
        message: 'Das ist eine ausreichend lange Nachricht.',
      },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('accepts nachricht alias and returns 200', async () => {
    const req = {
      method: 'POST',
      headers: {},
      body: {
        name: 'Andre',
        email: 'andre@example.com',
        nachricht: 'Diese Nachricht kommt aus dem Feld nachricht.',
      },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejects too short message after trim/sanitize', async () => {
    const req = {
      method: 'POST',
      headers: {},
      body: {
        name: 'Andre',
        email: 'andre@example.com',
        message: '   <b> x </b>   ',
      },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const [body] = res.json.mock.calls[0];
    expect(body.error).toBe('Validierungsfehler');
    expect(body.fields).toHaveProperty('message');
  });

  test('accepts alias fields for name and email', async () => {
    const req = {
      method: 'POST',
      headers: {},
      body: {
        fullname: 'Max Mustermann',
        mail: 'max@example.com',
        text: 'Bitte ruft mich morgen an.',
      },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('builds auto message from all form fields and keeps multi-value arrays', async () => {
    mockPrisma.setting.findUnique
      .mockResolvedValueOnce({ key: 'contactMailTo', value: 'office@example.com' })
      .mockResolvedValueOnce({ key: 'contactSaveToDb', value: 'false' });

    const req = {
      method: 'POST',
      headers: {},
      body: {
        name: 'Andre',
        email: 'andre@example.com',
        prioritaet: ['Stil', 'Budget'],
        budget_range: '5k-10k',
        note: 'Wir brauchen Landingpage und Kontaktformular.',
        altcha: 'token-value',
      },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = sendMail.mock.calls[0][0];
    expect(sent.text).toContain('Prioritaet: Stil, Budget');
    expect(sent.text).toContain('Budget range: 5k-10k');
    expect(sent.text).toContain('Note: Wir brauchen Landingpage und Kontaktformular.');
    expect(sent.text).not.toContain('altcha');
  });

  test('rejects request when name is missing', async () => {
    const req = {
      method: 'POST',
      headers: {},
      body: {
        email: 'andre@example.com',
        message: 'Das ist eine ausreichend lange Nachricht.',
      },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const [body] = res.json.mock.calls[0];
    expect(body.fields).toHaveProperty('name');
  });

  test('rejects request when email is invalid', async () => {
    const req = {
      method: 'POST',
      headers: {},
      body: {
        name: 'Andre',
        email: 'invalid-mail',
        message: 'Das ist eine ausreichend lange Nachricht.',
      },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const [body] = res.json.mock.calls[0];
    expect(body.fields).toHaveProperty('email');
  });
});
