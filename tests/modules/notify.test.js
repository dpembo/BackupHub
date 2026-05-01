describe('Notify Module', () => {
  let notify;
  let sendMailMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    global.serverConfig = {
      smtp: {
        host: 'smtp.example.com',
        port: '465',
        secure: 'true',
        username: 'smtp-user',
        password: 'smtp-pass',
        emailFrom: 'noreply@example.com',
        emailTo: 'ops@example.com',
      },
    };

    global.logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'mock-message-id' });
    global.nodemailer = {
      createTransport: jest.fn().mockReturnValue({
        sendMail: sendMailMock,
      }),
    };

    notify = require('../../notify.js');
  });

  afterEach(() => {
    delete global.serverConfig;
    delete global.logger;
    delete global.nodemailer;
  });

  describe('sendEmail()', () => {
    it('sends to the provided recipient when one is supplied', async () => {
      await notify.sendEmail('Invite', 'Welcome body', 'invited.user@example.com');

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'invited.user@example.com',
          subject: 'Invite',
          text: 'Welcome body',
        })
      );
    });

    it('falls back to smtp.emailTo when recipient is not provided', async () => {
      await notify.sendEmail('Subject', 'Body');

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ops@example.com',
        })
      );
    });

    it('falls back to smtp.emailTo when recipient is blank', async () => {
      await notify.sendEmail('Subject', 'Body', '   ');

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ops@example.com',
        })
      );
    });
  });
});
