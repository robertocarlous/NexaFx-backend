import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                SKIP_EMAIL_SENDING: 'true',
                FRONTEND_URL: 'http://localhost:3001',
                NODE_ENV: 'test',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get(MailService);
    await service.onModuleInit();
  });

  it('skips sending when SKIP_EMAIL_SENDING is true', async () => {
    await expect(
      service.sendVerificationEmail('test@example.com', 'token-123'),
    ).resolves.toBeUndefined();
  });
});
